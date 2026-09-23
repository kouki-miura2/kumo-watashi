<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import type { VOtpInput } from 'vuetify/components'

import { apiClient } from '../api/client.ts'
import QrScanner from '../components/QrScanner.vue'
import TransferFileItem from '../components/TransferFileItem.vue'
import { useCountdown } from '../composables/useCountdown.ts'
import { downloadWithProgress, saveBlob } from '../composables/useDownload.ts'
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
const codePartA = ref('')
const codePartB = ref('')
const codePartBInput = ref<VOtpInput | null>(null)
const scannerRef = ref<InstanceType<typeof QrScanner> | null>(null)
const transferId = ref('')
const joinCode = ref('')
const senderLabel = ref('')
const files = ref<ReceivedFile[]>([])

let downloadAbortController: AbortController | undefined

const { remainingLabel, remainingRatio, start: startCountdown } = useCountdown()

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

const applySession = (session: TransferSessionView) => {
  transferId.value = session.id
  senderLabel.value = session.senderLabel
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
  startCountdown(session.expiresAt)
  phase.value = 'files'
}

const reportJoinFailure = (status: number) => {
  if (status === 410) {
    notification.show('この転送は有効期限が切れています')
  } else if (status === 429) {
    notification.show('試行回数が多すぎます。しばらく待ってからもう一度お試しください')
  } else {
    notification.show('コードが見つかりません。もう一度お試しください')
  }
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

const handleDecoded = async (secret: string) => {
  const joined = await joinWithSecret(secret)
  if (!joined) await scannerRef.value?.start()
}

// If the user re-enters the scan screen from the code-entry one, the scanner component remounts
// (`v-if="phase === 'scan'"`) but doesn't auto-start itself — see QrScanner.vue — so it needs
// telling. The very first mount is handled by onMounted below instead, since a `watch` without
// `immediate` doesn't fire for the initial value.
watch(phase, async (next) => {
  if (next === 'scan') {
    await nextTick()
    await scannerRef.value?.start()
  }
})

onMounted(async () => {
  const secretFromQuery = route.query.secret
  if (typeof secretFromQuery === 'string' && secretFromQuery) {
    const joined = await joinWithSecret(secretFromQuery)
    if (!joined) await scannerRef.value?.start()
    return
  }
  await scannerRef.value?.start()
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
  downloadAbortController?.abort()
})
</script>

<template>
  <v-container class="py-8" style="max-width: 640px">
    <div v-if="phase === 'scan'" class="d-flex flex-column ga-6">
      <QrScanner ref="scannerRef" @decoded="handleDecoded" @manual-entry="phase = 'code'" />
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
            <TransferFileItem
              :name="f.name"
              :icon="f.icon"
              :status="f.status === 'downloading' ? 'active' : f.status"
              :progress="f.progress"
              done-label="保存しました"
            >
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
            </TransferFileItem>
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
</style>
