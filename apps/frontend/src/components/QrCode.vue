<script setup lang="ts">
import QRCode from 'qrcode'
import { ref, watch } from 'vue'

/** Generates and displays a QR code for `text` — the Uploader's join link today, but self-
 * contained enough to reuse anywhere else a QR needs showing. */
const props = defineProps<{ text: string }>()

const dataUrl = ref('')

const generate = async (text: string) => {
  if (!text) {
    dataUrl.value = ''
    return
  }
  try {
    dataUrl.value = await QRCode.toDataURL(text, { margin: 1, width: 240 })
  } catch (error) {
    console.error('Failed to generate QR code:', error)
  }
}

watch(() => props.text, generate, { immediate: true })
</script>

<template>
  <v-card variant="elevated" rounded="lg" class="d-flex flex-column align-center ga-4 pa-5">
    <img
      v-if="dataUrl"
      :src="dataUrl"
      alt="受け取り用QRコード"
      width="200"
      height="200"
      style="border-radius: 8px"
    />
    <v-progress-circular v-else indeterminate color="primary" />
    <div class="text-center">
      <div class="text-body-2 font-weight-medium">相手にこの QR を読み取ってもらう</div>
      <div class="text-caption text-medium-emphasis">カメラを向けるだけで受け取り画面へ</div>
    </div>
  </v-card>
</template>
