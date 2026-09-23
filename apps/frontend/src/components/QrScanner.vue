<script setup lang="ts">
import QrScannerLib from 'qr-scanner'
import { computed, onUnmounted, ref } from 'vue'

import { extractQrSecret } from '../qr.ts'

/** Owns the whole "scan a QR to join" screen — camera lifecycle, viewfinder, flash toggle, and
 * the manual-entry fallback link — so DownloaderView only reacts to `decoded`. Does *not* start
 * the camera on its own mount: the parent may already know it's about to join via a `?secret=`
 * query param and skip scanning entirely, so it calls the exposed `start()` explicitly once it's
 * decided scanning is actually needed (and again after a failed join, to resume). Unmounting (via
 * `v-if="phase === 'scan'"` in the parent) still tears the camera down automatically. */
const emit = defineEmits<{ decoded: [secret: string]; 'manual-entry': [] }>()

const videoRef = ref<HTMLVideoElement | null>(null)
const cameraError = ref<string | null>(null)
const hasFlash = ref(false)
const flashOn = ref(false)
const isDetecting = ref(false)

let scanner: QrScannerLib | null = null

const scanStatusText = computed(() => {
  if (cameraError.value) return cameraError.value
  if (isDetecting.value) return '読み取っています…'
  return '送る人の画面の QR を枠に合わせる'
})

const ensureScanner = () => {
  if (scanner || !videoRef.value) return
  scanner = new QrScannerLib(videoRef.value, (result) => handleResult(result.data), {
    preferredCamera: 'environment',
    maxScansPerSecond: 5,
    returnDetailedScanResult: true,
  })
}

const start = async () => {
  ensureScanner()
  if (!scanner) return
  cameraError.value = null
  try {
    await scanner.start()
    hasFlash.value = await scanner.hasFlash()
  } catch (error) {
    console.error('Failed to start camera:', error)
    cameraError.value = 'カメラを利用できません。コードを手入力してください。'
  }
}

const stop = () => {
  scanner?.stop()
}

const handleResult = (data: string) => {
  if (isDetecting.value) return
  const secret = extractQrSecret(data)
  if (!secret) return
  isDetecting.value = true
  stop()
  setTimeout(() => {
    isDetecting.value = false
    emit('decoded', secret)
  }, 300)
}

const toggleFlash = async () => {
  if (!scanner || !hasFlash.value) return
  await scanner.toggleFlash()
  flashOn.value = scanner.isFlashOn()
}

defineExpose({ start })

onUnmounted(() => {
  scanner?.destroy()
  scanner = null
})
</script>

<template>
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
        @click="emit('manual-entry')"
      />
      <div class="d-flex align-center justify-center ga-2" style="opacity: 0.7">
        <v-icon icon="mdi-lock-outline" size="16" />
        <span class="text-caption">受け取りにログインは不要です</span>
      </div>
    </div>
  </v-card>
</template>

<style scoped>
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
