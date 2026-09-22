<script setup lang="ts">
import QrScanner from 'qr-scanner'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import type { VOtpInput } from 'vuetify/components'

import { apiClient } from '../api/client.ts'
import { fileIconFor, formatFileSize } from '../format.ts'
import { useNotificationStore } from '../stores/notification.ts'

type Phase = 'scan' | 'code' | 'files' | 'downloading'

type ReceivedFile = {
  id: string
  name: string
  size: number
  contentType: string
  icon: string
  selected: boolean
  status: 'pending' | 'downloading' | 'done'
  progress: number
}

type TransferSessionView = {
  id: string
  senderLabel: string
  expiresAt: number
  files: { id: string; filename: string; contentType: string; size: number }[]
}

const notification = useNotificationStore()
const route = useRoute()

const phase = ref<Phase>('scan')
const isDetecting = ref(false)
const videoRef = ref<HTMLVideoElement | null>(null)
const cameraError = ref<string | null>(null)
const hasFlash = ref(false)
const flashOn = ref(false)
const codePartA = ref('')
const codePartB = ref('')
const codePartBInput = ref<VOtpInput | null>(null)
const transferId = ref('')
const joinCode = ref('')
const senderLabel = ref('')
const secondsRemaining = ref(0)
const files = ref<ReceivedFile[]>([])

let qrScanner: QrScanner | null = null
let countdownTimer: ReturnType<typeof setInterval> | undefined
let expiresAt = 0
/** The TTL window's original length, captured when `expiresAt` is set — see the matching note in
 * UploaderView.vue. */
let ttlMs = 0
let downloadAbortController: AbortController | undefined

const scanStatusText = computed(() => {
  if (cameraError.value) return cameraError.value
  if (isDetecting.value) return '読み取っています…'
  return '送る人の画面の QR を枠に合わせる'
})
const senderInitial = computed(() =>
  senderLabel.value ? senderLabel.value.charAt(0).toUpperCase() : '',
)
const totalSize = computed(() => files.value.reduce((sum, f) => sum + f.size, 0))
const selectedFiles = computed(() => files.value.filter((f) => f.selected))
const selectedCount = computed(() => selectedFiles.value.length)
const selectedSize = computed(() => selectedFiles.value.reduce((sum, f) => sum + f.size, 0))
const allSelected = computed(
  () => files.value.length > 0 && selectedCount.value === files.value.length,
)
const codeReady = computed(() => codePartA.value.length === 4 && codePartB.value.length === 4)

// The join code is case-insensitive (docs/spec.md section 13.1) but should always *display*
// uppercase, so lowercase keystrokes are normalized right back into the model.
watch(codePartA, (value) => {
  const upper = value.toUpperCase()
  if (upper !== value) codePartA.value = upper
})
watch(codePartB, (value) => {
  const upper = value.toUpperCase()
  if (upper !== value) codePartB.value = upper
})

/** The two 4-char `v-otp-input`s are separate component instances, so filling the first one
 * doesn't auto-advance into the second the way a single OTP field would — move focus manually. */
const focusSecondHalf = () => codePartBInput.value?.focus()
const formattedJoinCode = computed(() => `${joinCode.value.slice(0, 4)}-${joinCode.value.slice(4)}`)
const remainingLabel = computed(() => {
  const m = Math.floor(secondsRemaining.value / 60)
  const s = secondsRemaining.value % 60
  return `${m}:${String(s).padStart(2, '0')}`
})
const remainingRatio = computed(() =>
  ttlMs > 0 ? ((secondsRemaining.value * 1000) / ttlMs) * 100 : 0,
)

const doneCount = computed(() => selectedFiles.value.filter((f) => f.status === 'done').length)
const downloadedSize = computed(() =>
  selectedFiles.value.reduce((sum, f) => sum + f.size * (f.progress / 100), 0),
)
const overallPercent = computed(() => {
  if (selectedSize.value === 0) return 0
  return Math.round((downloadedSize.value / selectedSize.value) * 100)
})
const downloadComplete = computed(
  () => selectedFiles.value.length > 0 && doneCount.value === selectedFiles.value.length,
)

const formatSize = formatFileSize

const startCountdown = () => {
  if (countdownTimer) clearInterval(countdownTimer)
  countdownTimer = setInterval(() => {
    secondsRemaining.value = Math.max(0, Math.round((expiresAt - Date.now()) / 1000))
    if (secondsRemaining.value === 0 && countdownTimer) {
      clearInterval(countdownTimer)
      countdownTimer = undefined
    }
  }, 1000)
}

const applySession = (session: TransferSessionView) => {
  transferId.value = session.id
  senderLabel.value = session.senderLabel
  expiresAt = session.expiresAt
  ttlMs = Math.max(1, session.expiresAt - Date.now())
  files.value = session.files.map((f) => ({
    id: f.id,
    name: f.filename,
    size: f.size,
    contentType: f.contentType,
    icon: fileIconFor(f.filename, f.contentType),
    selected: true,
    status: 'pending',
    progress: 0,
  }))
  secondsRemaining.value = Math.max(0, Math.round((expiresAt - Date.now()) / 1000))
  phase.value = 'files'
  startCountdown()
}

const reportJoinFailure = (status: number) => {
  notification.show(
    status === 410
      ? 'この転送は有効期限が切れています'
      : 'コードが見つかりません。もう一度お試しください',
  )
}

/** Downloader joins with either a human-typed code or a QR secret — never both — mirroring
 * docs/spec.md section 18 (same Transfer Session, two participation methods). */
const joinWithCode = async (rawCode: string) => {
  const res = await apiClient.api.transfers.join.$post({ json: { code: rawCode } })
  if (!res.ok) {
    reportJoinFailure(res.status)
    return false
  }
  joinCode.value = rawCode.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
  applySession(await res.json())
  return true
}

const joinWithSecret = async (secret: string) => {
  const res = await apiClient.api.transfers.join[':secret'].$get({ param: { secret } })
  if (!res.ok) {
    reportJoinFailure(res.status)
    return false
  }
  joinCode.value = ''
  applySession(await res.json())
  return true
}

/** Pulls the QR secret out of whatever the camera decoded — either the bare secret or a
 * `.../downloader?secret=...`-style URL (native camera apps open the link directly, our own
 * scanner below extracts it manually). */
const extractQrSecret = (data: string): string | null => {
  try {
    const fromQuery = new URL(data).searchParams.get('secret')
    if (fromQuery) return fromQuery
  } catch {
    // Not a URL — fall through to treating the raw text as the secret itself.
  }
  const trimmed = data.trim()
  return /^[0-9a-f]{64}$/i.test(trimmed) ? trimmed : null
}

const handleScanResult = (data: string) => {
  if (isDetecting.value) return
  const secret = extractQrSecret(data)
  if (!secret) return
  isDetecting.value = true
  stopScanning()
  setTimeout(async () => {
    isDetecting.value = false
    const joined = await joinWithSecret(secret)
    if (!joined) await startScanning()
  }, 300)
}

const ensureScanner = () => {
  if (qrScanner || !videoRef.value) return
  qrScanner = new QrScanner(videoRef.value, (result) => handleScanResult(result.data), {
    preferredCamera: 'environment',
    maxScansPerSecond: 5,
    returnDetailedScanResult: true,
  })
}

const startScanning = async () => {
  ensureScanner()
  if (!qrScanner) return
  cameraError.value = null
  try {
    await qrScanner.start()
    hasFlash.value = await qrScanner.hasFlash()
  } catch (error) {
    console.error('Failed to start camera:', error)
    cameraError.value = 'カメラを利用できません。コードを手入力してください。'
  }
}

const stopScanning = () => {
  qrScanner?.stop()
}

const toggleFlash = async () => {
  if (!qrScanner || !hasFlash.value) return
  await qrScanner.toggleFlash()
  flashOn.value = qrScanner.isFlashOn()
}

watch(phase, async (next, previous) => {
  if (next === 'scan') {
    await nextTick()
    await startScanning()
  } else if (previous === 'scan') {
    stopScanning()
  }
})

onMounted(async () => {
  const secretFromQuery = route.query.secret
  if (typeof secretFromQuery === 'string' && secretFromQuery) {
    const joined = await joinWithSecret(secretFromQuery)
    if (!joined) await startScanning()
    return
  }
  await startScanning()
})

const submitCode = async () => {
  if (!codeReady.value) return
  await joinWithCode(`${codePartA.value}${codePartB.value}`)
}

const toggleFile = (id: string) => {
  const target = files.value.find((f) => f.id === id)
  if (target) target.selected = !target.selected
}

const toggleSelectAll = () => {
  const next = !allSelected.value
  files.value = files.value.map((f) => ({ ...f, selected: next }))
}

const downloadUrl = (fileId: string): string =>
  apiClient.api.transfers[':id'].files[':fileId'].download
    .$url({ param: { id: transferId.value, fileId } })
    .toString()

const saveBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

/** fetch + a manual read loop, not XHR, because it's the only way to both stream the body into a
 * Blob (rather than buffering the whole response before `onload`) and observe byte progress. */
const downloadWithProgress = async (
  url: string,
  onProgress: (percent: number) => void,
  signal: AbortSignal,
): Promise<Blob> => {
  const res = await fetch(url, { signal })
  if (!res.ok || !res.body) throw new Error('ダウンロードに失敗しました')
  const total = Number(res.headers.get('Content-Length') ?? 0)
  const reader = res.body.getReader()
  const chunks: BlobPart[] = []
  let loaded = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    loaded += value.length
    if (total > 0) onProgress(Math.round((loaded / total) * 100))
  }
  return new Blob(chunks)
}

const downloadSingle = async (file: ReceivedFile) => {
  if (file.status !== 'pending') return
  file.status = 'downloading'
  try {
    const blob = await downloadWithProgress(
      downloadUrl(file.id),
      (percent) => {
        file.progress = percent
      },
      new AbortController().signal,
    )
    saveBlob(blob, file.name)
    file.status = 'done'
    file.progress = 100
    notification.show(`${file.name} を保存しました`)
  } catch (error) {
    console.error('Download failed:', error)
    file.status = 'pending'
    file.progress = 0
    notification.show(`${file.name} の保存に失敗しました`)
  }
}

const downloadNext = async () => {
  const current = selectedFiles.value.find((f) => f.status === 'pending')
  if (!current) return
  current.status = 'downloading'
  try {
    downloadAbortController = new AbortController()
    const blob = await downloadWithProgress(
      downloadUrl(current.id),
      (percent) => {
        current.progress = percent
      },
      downloadAbortController.signal,
    )
    saveBlob(blob, current.name)
    current.status = 'done'
    current.progress = 100
    await downloadNext()
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return
    console.error('Download failed:', error)
    notification.show(`${current.name} の保存に失敗しました`)
    current.status = 'pending'
    current.progress = 0
  }
}

const startDownload = () => {
  if (selectedCount.value === 0) return
  phase.value = 'downloading'
  downloadNext()
}

const cancelDownload = () => {
  downloadAbortController?.abort()
  for (const f of selectedFiles.value) {
    if (f.status !== 'done') {
      f.status = 'pending'
      f.progress = 0
    }
  }
  phase.value = 'files'
}

onUnmounted(() => {
  qrScanner?.destroy()
  qrScanner = null
  downloadAbortController?.abort()
  if (countdownTimer) clearInterval(countdownTimer)
})
</script>

<template>
  <v-container class="py-8" style="max-width: 640px">
    <div v-if="phase === 'scan'" class="d-flex flex-column ga-6">
      <v-card color="#0E1B24" theme="dark" rounded="lg" class="pa-6 d-flex flex-column ga-8">
        <div class="d-flex align-center ga-3">
          <v-btn icon="mdi-close" variant="text" to="/" />
          <span class="text-body-1 font-weight-medium flex-grow-1">QR を読み取る</span>
          <v-btn
            :icon="flashOn ? 'mdi-flashlight-off' : 'mdi-flashlight'"
            variant="text"
            :disabled="!hasFlash"
            @click="toggleFlash"
          />
        </div>

        <div class="flex-grow-1 d-flex flex-column align-center justify-center ga-8 py-8">
          <div class="viewfinder" :class="{ 'viewfinder--active': isDetecting }">
            <video ref="videoRef" class="viewfinder__video" muted playsinline />
            <template v-if="!cameraError">
              <span class="viewfinder__corner viewfinder__corner--tl" />
              <span class="viewfinder__corner viewfinder__corner--tr" />
              <span class="viewfinder__corner viewfinder__corner--bl" />
              <span class="viewfinder__corner viewfinder__corner--br" />
              <span class="viewfinder__line" />
            </template>
            <div v-else class="viewfinder__fallback">
              <v-icon icon="mdi-camera-off-outline" size="40" />
            </div>
          </div>
          <div class="d-flex flex-column align-center ga-2 text-center">
            <span class="text-body-1">{{ scanStatusText }}</span>
            <span class="text-caption" style="opacity: 0.7"
              >読み取ると自動でファイル一覧に進みます</span
            >
          </div>
        </div>

        <div class="d-flex flex-column ga-3">
          <v-btn
            variant="outlined"
            size="large"
            prepend-icon="mdi-form-textbox"
            text="コードを手入力する"
            @click="phase = 'code'"
          />
          <div class="d-flex align-center justify-center ga-2" style="opacity: 0.7">
            <v-icon icon="mdi-lock-outline" size="16" />
            <span class="text-caption">受け取りにログインは不要です</span>
          </div>
        </div>
      </v-card>
    </div>

    <div v-else-if="phase === 'code'" class="d-flex flex-column ga-6">
      <div class="d-flex align-center ga-3">
        <v-btn icon="mdi-arrow-left" variant="text" @click="phase = 'scan'" />
        <span class="text-h6">コードで受け取る</span>
      </div>

      <div>
        <h1 class="text-h5 font-weight-bold mb-2">ワンタイムコードを入力</h1>
        <p class="text-body-2 text-medium-emphasis">送る人の画面に表示された8文字です。</p>
      </div>

      <div class="d-flex flex-column ga-3">
        <div class="d-flex align-center justify-center ga-3">
          <v-otp-input
            v-model="codePartA"
            length="4"
            pattern="alphanumeric"
            variant="outlined"
            autofocus
            style="max-width: 220px"
            @finish="focusSecondHalf"
          />
          <span class="text-h5 font-weight-bold">–</span>
          <v-otp-input
            ref="codePartBInput"
            v-model="codePartB"
            length="4"
            pattern="alphanumeric"
            variant="outlined"
            style="max-width: 220px"
          />
        </div>
        <div class="d-flex align-center justify-center ga-2 text-medium-emphasis">
          <v-icon icon="mdi-information-outline" size="16" />
          <span class="text-caption">大文字・小文字は区別しません</span>
        </div>
      </div>

      <v-btn
        size="x-large"
        color="primary"
        :disabled="!codeReady"
        text="ファイルを確認する"
        @click="submitCode"
      />

      <v-btn
        variant="text"
        prepend-icon="mdi-qrcode-scan"
        text="QR を読み取る"
        @click="phase = 'scan'"
      />
    </div>

    <div v-else-if="phase === 'files'" class="d-flex flex-column ga-6">
      <div class="d-flex align-center ga-3">
        <v-btn icon="mdi-arrow-left" variant="text" @click="phase = 'code'" />
        <span class="text-h6 flex-grow-1">受け取る</span>
        <v-chip color="primary" prepend-icon="mdi-timer-outline">{{ remainingLabel }}</v-chip>
      </div>
      <v-progress-linear :model-value="remainingRatio" color="primary" height="4" />

      <v-card variant="outlined" rounded="lg" class="d-flex align-center ga-3 pa-4">
        <v-avatar color="primary" size="40">
          <span class="text-body-2 font-weight-bold" style="color: white">{{ senderInitial }}</span>
        </v-avatar>
        <div class="d-flex flex-column">
          <span class="text-body-2 font-weight-medium">{{ senderLabel }} さんからの転送</span>
          <span class="text-caption text-medium-emphasis mono">
            <template v-if="joinCode">{{ formattedJoinCode }} · </template>{{ files.length }} 件 /
            {{ formatSize(totalSize) }}
          </span>
        </div>
      </v-card>

      <div class="d-flex align-center justify-space-between">
        <span class="text-body-2 font-weight-medium">
          {{ allSelected ? `${files.length} 件すべて選択中` : `${selectedCount} 件選択中` }}
        </span>
        <v-btn
          variant="text"
          size="small"
          :text="allSelected ? '選択を解除' : 'すべて選択'"
          @click="toggleSelectAll"
        />
      </div>

      <v-card variant="outlined" rounded="lg">
        <v-list density="comfortable">
          <template v-for="(f, i) in files" :key="f.id">
            <v-divider v-if="i > 0" />
            <v-list-item>
              <template #prepend>
                <v-checkbox-btn
                  :model-value="f.selected"
                  density="compact"
                  @update:model-value="toggleFile(f.id)"
                />
                <v-icon :icon="f.icon" size="28" color="primary" class="mx-2" />
              </template>
              <v-list-item-title>{{ f.name }}</v-list-item-title>
              <v-list-item-subtitle class="mono">{{ formatSize(f.size) }}</v-list-item-subtitle>
              <template #append>
                <v-btn
                  icon="mdi-download-outline"
                  variant="text"
                  size="small"
                  :disabled="f.status !== 'pending'"
                  @click="downloadSingle(f)"
                />
              </template>
            </v-list-item>
          </template>
        </v-list>
      </v-card>

      <v-alert variant="flat" color="grey-lighten-3" density="comfortable" icon="mdi-timer-sand">
        {{ remainingLabel }} を過ぎるとファイルは削除されます。ダウンロード後は手元に残ります。
      </v-alert>

      <v-btn
        size="x-large"
        color="primary"
        :disabled="selectedCount === 0"
        prepend-icon="mdi-download"
        :text="`${selectedCount} 件をダウンロード（${formatSize(selectedSize)}）`"
        @click="startDownload"
      />
    </div>

    <div v-else class="d-flex flex-column ga-6">
      <div class="d-flex align-center justify-space-between">
        <span class="text-h6">{{
          downloadComplete ? '保存が完了しました' : 'ダウンロード中'
        }}</span>
        <span v-if="!downloadComplete" class="text-body-2 font-weight-bold mono"
          >{{ overallPercent }}%</span
        >
        <v-icon v-else icon="mdi-check-circle" color="primary" />
      </div>
      <v-progress-linear :model-value="overallPercent" color="primary" height="4" />

      <div class="d-flex flex-column align-center ga-4 py-4">
        <v-progress-circular
          v-if="!downloadComplete"
          indeterminate
          color="primary"
          size="56"
          width="4"
        />
        <v-icon v-else icon="mdi-check-circle" color="primary" size="56" />
        <div class="text-center">
          <div class="text-body-1 font-weight-medium">
            {{
              downloadComplete
                ? 'すべて保存しました'
                : `${doneCount} / ${selectedFiles.length} 件を保存中`
            }}
          </div>
          <div v-if="!downloadComplete" class="text-caption text-medium-emphasis mono">
            {{ formatSize(downloadedSize) }} / {{ formatSize(selectedSize) }}
          </div>
        </div>
      </div>

      <v-card variant="outlined" rounded="lg">
        <v-list density="comfortable">
          <template v-for="(f, i) in selectedFiles" :key="f.id">
            <v-divider v-if="i > 0" />
            <v-list-item :class="{ 'opacity-55': f.status === 'pending' }">
              <template #prepend>
                <v-icon
                  :icon="
                    f.status === 'done'
                      ? 'mdi-check-circle'
                      : f.status === 'downloading'
                        ? f.icon
                        : 'mdi-clock-outline'
                  "
                  :color="f.status === 'pending' ? 'grey' : 'primary'"
                />
              </template>
              <v-list-item-title>{{ f.name }}</v-list-item-title>
              <v-list-item-subtitle v-if="f.status === 'done'">保存しました</v-list-item-subtitle>
              <v-list-item-subtitle v-else-if="f.status === 'pending'">待機中</v-list-item-subtitle>
              <v-progress-linear
                v-else
                :model-value="f.progress"
                color="primary"
                height="4"
                rounded
                class="mt-1"
              />
              <template #append>
                <span v-if="f.status === 'downloading'" class="text-caption mono"
                  >{{ Math.round(f.progress) }}%</span
                >
                <v-btn
                  v-else-if="f.status === 'done'"
                  icon="mdi-open-in-new"
                  variant="text"
                  size="small"
                />
              </template>
            </v-list-item>
          </template>
        </v-list>
      </v-card>

      <v-alert
        v-if="!downloadComplete"
        variant="flat"
        color="grey-lighten-3"
        density="comfortable"
        icon="mdi-information-outline"
      >
        保存が終わるまで画面を閉じないでください。
      </v-alert>

      <v-btn
        v-if="!downloadComplete"
        variant="outlined"
        size="large"
        text="キャンセル"
        @click="cancelDownload"
      />
      <v-btn v-else variant="outlined" size="large" text="閉じる" to="/" />
    </div>
  </v-container>
</template>

<style scoped>
.mono {
  font-family: ui-monospace, 'SFMono-Regular', Consolas, monospace;
}

.opacity-55 {
  opacity: 0.55;
}

.viewfinder {
  position: relative;
  width: 220px;
  height: 220px;
  overflow: hidden;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.06);
  transition: transform 0.15s;
}

.viewfinder--active {
  transform: scale(0.97);
}

.viewfinder__video {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.viewfinder__fallback {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.6);
}

.viewfinder__corner {
  position: absolute;
  width: 40px;
  height: 40px;
  border: 3px solid #fff;
}

.viewfinder__corner--tl {
  top: 0;
  left: 0;
  border-right: none;
  border-bottom: none;
  border-radius: 20px 0 0 0;
}

.viewfinder__corner--tr {
  top: 0;
  right: 0;
  border-left: none;
  border-bottom: none;
  border-radius: 0 20px 0 0;
}

.viewfinder__corner--bl {
  bottom: 0;
  left: 0;
  border-right: none;
  border-top: none;
  border-radius: 0 0 0 20px;
}

.viewfinder__corner--br {
  bottom: 0;
  right: 0;
  border-left: none;
  border-top: none;
  border-radius: 0 0 20px 0;
}

.viewfinder__line {
  position: absolute;
  left: 16px;
  right: 16px;
  top: 10%;
  height: 2px;
  background: rgba(255, 255, 255, 0.7);
  animation: scan-move 1.6s ease-in-out infinite;
}

@keyframes scan-move {
  0%,
  100% {
    top: 10%;
  }
  50% {
    top: 88%;
  }
}
</style>
