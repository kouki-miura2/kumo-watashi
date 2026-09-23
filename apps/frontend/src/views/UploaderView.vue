<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, onMounted, onUnmounted, ref } from 'vue'

import { apiClient } from '../api/client.ts'
import QrCode from '../components/QrCode.vue'
import TransferFileItem from '../components/TransferFileItem.vue'
import { useCountdown } from '../composables/useCountdown.ts'
import { useTurnstile } from '../composables/useTurnstile.ts'
import { uploadFileWithProgress } from '../composables/useUpload.ts'
import { fileIconFor, formatFileSize } from '../format.ts'
import { useAuthStore } from '../stores/auth.ts'
import { useNotificationStore } from '../stores/notification.ts'

type Phase = 'select' | 'uploading' | 'complete'

type PickedFile = {
  id: string
  file: File
  progress: number
  status: 'pending' | 'uploading' | 'done'
}

const MAX_FILES = 5
const MAX_FILE_SIZE = 100 * 1024 * 1024
const MAX_TOTAL_SIZE = 500 * 1024 * 1024

// docs/spec.md section 9 — gates Transfer Session creation (the one operation that actually
// consumes R2/D1 quota) behind a bot check. No fallback default: this repo is OSS, and a widget
// is pinned to the domain(s) it was registered for, so reusing someone else's wouldn't work
// anyway — every deployer creates their own (Cloudflare dashboard → Turnstile → Add widget).
const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined

const notification = useNotificationStore()
const auth = useAuthStore()
const { isAuthenticated, email } = storeToRefs(auth)

const phase = ref<Phase>('select')
const files = ref<PickedFile[]>([])
const isDragOver = ref(false)
const transferId = ref('')
const joinCode = ref('')
const qrSecret = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
const googleButtonRef = ref<HTMLElement | null>(null)
const turnstileRef = ref<HTMLElement | null>(null)

let uploadAbortController: AbortController | undefined

const {
  remainingLabel,
  remainingRatio,
  start: startCountdown,
  stop: stopCountdown,
} = useCountdown()

const turnstileActive = computed(() => isAuthenticated.value && phase.value === 'select')
const { token: turnstileToken } = useTurnstile({
  siteKey: TURNSTILE_SITE_KEY,
  action: 'create_transfer',
  container: turnstileRef,
  active: turnstileActive,
  onError: (message) => notification.show(message),
})

const totalSize = computed(() => files.value.reduce((sum, f) => sum + f.file.size, 0))
const doneCount = computed(() => files.value.filter((f) => f.status === 'done').length)
const overallProgress = computed(() => {
  if (files.value.length === 0) return 0
  const sum = files.value.reduce((acc, f) => acc + f.progress, 0)
  return Math.round(sum / files.value.length)
})
const formattedJoinCode = computed(() => `${joinCode.value.slice(0, 4)}-${joinCode.value.slice(4)}`)
const downloadLink = computed(() =>
  qrSecret.value ? `${window.location.origin}/downloader?secret=${qrSecret.value}` : '',
)

const formatSize = formatFileSize
const fileIcon = (file: File) => fileIconFor(file.name, file.type)

onMounted(() => {
  if (!isAuthenticated.value && googleButtonRef.value) {
    auth.renderSignInButton(googleButtonRef.value)
  }
})

const triggerFileDialog = () => fileInput.value?.click()

const addFiles = (list: FileList | null) => {
  if (!list) return
  for (const file of Array.from(list)) {
    if (files.value.length >= MAX_FILES) {
      notification.show(`ファイルは最大${MAX_FILES}件までです`)
      break
    }
    if (file.size > MAX_FILE_SIZE) {
      notification.show(`${file.name} は${formatSize(MAX_FILE_SIZE)}を超えています`)
      continue
    }
    if (totalSize.value + file.size > MAX_TOTAL_SIZE) {
      notification.show(`合計サイズが${formatSize(MAX_TOTAL_SIZE)}を超えます`)
      continue
    }
    files.value.push({ id: crypto.randomUUID(), file, progress: 0, status: 'pending' })
  }
}

const onFileInputChange = (e: Event) => {
  const input = e.target as HTMLInputElement
  addFiles(input.files)
  input.value = ''
}

const onDrop = (e: DragEvent) => {
  isDragOver.value = false
  addFiles(e.dataTransfer?.files ?? null)
}

const removeFile = (id: string) => {
  files.value = files.value.filter((f) => f.id !== id)
}

const deleteTransferQuietly = async () => {
  if (!transferId.value) return
  await apiClient.api.transfers[':id'].$delete({ param: { id: transferId.value } }).catch(() => {})
}

const startUpload = async () => {
  if (files.value.length === 0) return
  if (!turnstileToken.value) {
    notification.show('ボット確認が完了していません。少し待ってからお試しください。')
    return
  }
  files.value = files.value.map((f) => ({ ...f, progress: 0, status: 'pending' }))
  phase.value = 'uploading'
  uploadAbortController = new AbortController()

  try {
    const created = await apiClient.api.transfers.$post({
      json: {
        senderLabel: email.value?.split('@')[0] ?? '匿名',
        turnstileToken: turnstileToken.value,
      },
    })
    if (!created.ok) {
      throw new Error(
        created.status === 403
          ? 'ボット確認に失敗しました。もう一度お試しください。'
          : '転送セッションの作成に失敗しました',
      )
    }
    const session = await created.json()
    transferId.value = session.id
    joinCode.value = session.joinCode
    qrSecret.value = session.qrSecret
    startCountdown(session.expiresAt)

    const uploadUrl = apiClient.api.transfers[':id'].files
      .$url({ param: { id: session.id } })
      .toString()
    for (const picked of files.value) {
      if (uploadAbortController.signal.aborted) return
      picked.status = 'uploading'
      await uploadFileWithProgress(
        uploadUrl,
        picked.file,
        (percent) => {
          picked.progress = percent
        },
        uploadAbortController.signal,
        auth.token ? { Authorization: `Bearer ${auth.token}` } : {},
      )
      picked.status = 'done'
    }

    phase.value = 'complete'
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return
    console.error('Upload failed:', error)
    notification.show(error instanceof Error ? error.message : 'アップロードに失敗しました')
    await deleteTransferQuietly()
    // Returning to 'select' re-triggers the Turnstile widget's own active-state watch, which
    // tears down and re-renders it — the token sent above was single-use, so this is what makes
    // a retry send a fresh one instead of silently resending an already-exhausted token.
    phase.value = 'select'
  }
}

const cancelUpload = async () => {
  uploadAbortController?.abort()
  await deleteTransferQuietly()
  phase.value = 'select'
}

const copyJoinCode = async () => {
  await navigator.clipboard.writeText(joinCode.value)
  notification.show('コードをコピーしました')
}

const deleteNow = async () => {
  stopCountdown()
  await deleteTransferQuietly()
  files.value = []
  phase.value = 'select'
  notification.show('ファイルを削除しました')
}

const extend = async () => {
  if (!transferId.value) return
  const res = await apiClient.api.transfers[':id'].extend.$post({ param: { id: transferId.value } })
  if (!res.ok) {
    notification.show('延長に失敗しました。転送がすでに終了している可能性があります。')
    return
  }
  const session = await res.json()
  startCountdown(session.expiresAt)
}

onUnmounted(() => {
  uploadAbortController?.abort()
})
</script>

<template>
  <v-container class="py-8" style="max-width: 640px">
    <div v-if="!isAuthenticated" class="d-flex flex-column align-center ga-6 py-8">
      <v-avatar color="rgba(14,27,36,.06)" size="80">
        <v-icon icon="mdi-shield-account-outline" size="40" color="primary" />
      </v-avatar>
      <div class="w-100" style="max-width: 360px">
        <h1 class="text-h5 font-weight-bold mb-2">送信にはログインが必要です</h1>
        <p class="text-body-2 text-medium-emphasis">
          誰が預けたファイルかを記録し、1分後に確実に削除するために使います。
        </p>
      </div>
      <div class="d-flex flex-column ga-3 w-100" style="max-width: 320px">
        <div ref="googleButtonRef" class="d-flex justify-center" style="min-height: 44px" />
        <v-btn
          variant="flat"
          color="grey-lighten-3"
          text="受け取るだけなら不要です"
          to="/downloader"
        />
      </div>
      <div
        class="d-flex align-start ga-2 text-caption text-medium-emphasis w-100"
        style="max-width: 360px"
      >
        <v-icon icon="mdi-lock-outline" size="18" class="mt-1" />
        <span>ファイルの内容は閲覧されません。メールアドレスの取得のみに使用します。</span>
      </div>
    </div>

    <div v-else-if="phase === 'select'" class="d-flex flex-column ga-6">
      <div class="d-flex align-center ga-3">
        <v-btn icon="mdi-arrow-left" variant="text" to="/" />
        <span class="text-h6 flex-grow-1">ファイルを送る</span>
        <v-chip
          v-if="email"
          variant="flat"
          color="grey-lighten-3"
          prepend-icon="mdi-account-circle"
        >
          {{ email }}
        </v-chip>
      </div>

      <v-row>
        <v-col cols="12" :sm="files.length > 0 ? 6 : 12">
          <div
            class="d-flex flex-column align-center justify-center ga-3 pa-8 h-100"
            :style="{
              border: `2px dashed ${isDragOver ? 'rgb(var(--v-theme-primary))' : 'rgba(14,27,36,.24)'}`,
              borderRadius: '16px',
              background: isDragOver ? '#F4F6F8' : '#FFFFFF',
              cursor: 'pointer',
            }"
            @click="triggerFileDialog"
            @dragover.prevent="isDragOver = true"
            @dragleave.prevent="isDragOver = false"
            @drop.prevent="onDrop"
          >
            <v-avatar color="rgba(14,27,36,.06)" size="64">
              <v-icon icon="mdi-cloud-upload-outline" size="32" color="primary" />
            </v-avatar>
            <div class="text-center">
              <div class="text-body-1 font-weight-medium">ここにドロップ</div>
              <div class="text-caption text-medium-emphasis">またはクリックしてファイルを選択</div>
            </div>
            <span class="text-caption text-medium-emphasis mono text-center">
              最大{{ MAX_FILES }}ファイル / 1件{{ formatSize(MAX_FILE_SIZE) }} / 合計{{
                formatSize(MAX_TOTAL_SIZE)
              }}
            </span>
            <input
              ref="fileInput"
              type="file"
              multiple
              class="d-none"
              @change="onFileInputChange"
              @click.stop
            />
          </div>
        </v-col>

        <v-col v-if="files.length > 0" cols="12" sm="6" class="d-flex flex-column ga-3">
          <div class="d-flex align-center justify-space-between">
            <span class="text-body-2 font-weight-medium">選択中 {{ files.length }} 件</span>
            <span class="text-body-2 text-medium-emphasis mono">
              {{ formatSize(totalSize) }} / {{ formatSize(MAX_TOTAL_SIZE) }}
            </span>
          </div>

          <v-card variant="outlined" rounded="lg">
            <v-list density="comfortable">
              <template v-for="(f, i) in files" :key="f.id">
                <v-divider v-if="i > 0" />
                <v-list-item
                  :prepend-icon="fileIcon(f.file)"
                  :title="f.file.name"
                  :subtitle="formatSize(f.file.size)"
                >
                  <template #append>
                    <v-btn icon="mdi-close" variant="text" size="small" @click="removeFile(f.id)" />
                  </template>
                </v-list-item>
              </template>
            </v-list>
          </v-card>

          <v-alert
            variant="flat"
            color="grey-lighten-3"
            density="comfortable"
            icon="mdi-timer-sand"
          >
            アップロード完了から1分で自動削除されます。
          </v-alert>
        </v-col>
      </v-row>

      <div ref="turnstileRef" class="d-flex justify-center" />

      <v-btn
        size="x-large"
        color="primary"
        :disabled="files.length === 0 || !turnstileToken"
        prepend-icon="mdi-cloud-upload-outline"
        text="アップロードする"
        @click="startUpload"
      />
    </div>

    <div v-else-if="phase === 'uploading'" class="d-flex flex-column ga-6">
      <div class="d-flex align-center justify-space-between">
        <span class="text-h6">アップロード中</span>
        <span class="text-body-2 font-weight-bold mono">{{ overallProgress }}%</span>
      </div>
      <v-progress-linear :model-value="overallProgress" color="primary" height="4" />

      <div class="d-flex flex-column align-center ga-4 py-4">
        <v-progress-circular indeterminate color="primary" size="56" width="4" />
        <div class="text-body-1 font-weight-medium">
          {{ doneCount }} / {{ files.length }} 件をアップロード中
        </div>
      </div>

      <v-card variant="outlined" rounded="lg">
        <v-list density="comfortable">
          <template v-for="(f, i) in files" :key="f.id">
            <v-divider v-if="i > 0" />
            <TransferFileItem
              :name="f.file.name"
              :icon="fileIcon(f.file)"
              :status="f.status === 'uploading' ? 'active' : f.status"
              :progress="f.progress"
              done-label="完了"
            />
          </template>
        </v-list>
      </v-card>

      <v-alert
        variant="flat"
        color="grey-lighten-3"
        density="comfortable"
        icon="mdi-information-outline"
      >
        画面を閉じないでください。完了後に QR コードとコードを発行します。
      </v-alert>

      <v-btn variant="outlined" size="large" text="キャンセル" @click="cancelUpload" />
    </div>

    <div v-else class="d-flex flex-column ga-6">
      <div class="d-flex align-center ga-3">
        <span class="text-h6 flex-grow-1">受け取り待ち</span>
        <v-chip color="primary" prepend-icon="mdi-timer-outline">{{ remainingLabel }}</v-chip>
      </div>
      <v-progress-linear :model-value="remainingRatio" color="primary" height="4" />

      <v-row>
        <v-col cols="12" sm="5">
          <QrCode :text="downloadLink" />
        </v-col>
        <v-col cols="12" sm="7" class="d-flex flex-column ga-4">
          <div class="d-flex flex-column ga-2">
            <span class="text-caption text-medium-emphasis">または コードを伝える</span>
            <div
              class="d-flex align-center ga-2 pa-3"
              style="border: 1px solid rgba(14, 27, 36, 0.22); border-radius: 12px"
            >
              <span class="flex-grow-1 text-h6 font-weight-bold mono">{{ formattedJoinCode }}</span>
              <v-btn icon="mdi-content-copy" variant="tonal" @click="copyJoinCode" />
            </div>
          </div>

          <div class="d-flex flex-column ga-2">
            <div class="d-flex align-center justify-space-between">
              <span class="text-body-2 font-weight-medium"
                >送信したファイル {{ files.length }} 件</span
              >
              <span class="text-body-2 text-medium-emphasis mono">{{ formatSize(totalSize) }}</span>
            </div>
            <v-card variant="outlined" rounded="lg">
              <v-list density="compact">
                <template v-for="(f, i) in files" :key="f.id">
                  <v-divider v-if="i > 0" />
                  <v-list-item :prepend-icon="fileIcon(f.file)" :title="f.file.name">
                    <template #append>
                      <span class="text-caption text-medium-emphasis mono mr-2">{{
                        formatSize(f.file.size)
                      }}</span>
                      <v-icon icon="mdi-check-circle" color="primary" size="20" />
                    </template>
                  </v-list-item>
                </template>
              </v-list>
            </v-card>
          </div>
        </v-col>
      </v-row>

      <v-alert
        variant="flat"
        color="grey-lighten-3"
        density="comfortable"
        icon="mdi-information-outline"
      >
        この画面を閉じても、1分間は受け取れます。
      </v-alert>

      <div class="d-flex ga-3">
        <v-btn
          class="flex-grow-1"
          variant="outlined"
          size="large"
          text="いま削除する"
          @click="deleteNow"
        />
        <v-btn class="flex-grow-1" color="primary" size="large" text="延長する" @click="extend" />
      </div>
    </div>
  </v-container>
</template>

<style scoped>
.mono {
  font-family: ui-monospace, 'SFMono-Regular', Consolas, monospace;
}
</style>
