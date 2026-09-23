<script setup lang="ts">
/** One row in an in-progress (uploading/downloading) file list — shared by UploaderView and
 * DownloaderView, which otherwise duplicated the same status-icon/progress-bar logic under
 * different status literals ('uploading' vs 'downloading'). Callers normalize their own status
 * union down to this component's three states. */
defineProps<{
  name: string
  /** Icon shown while `status === 'active'` — the pending/done icons are fixed. */
  icon: string
  status: 'pending' | 'active' | 'done'
  progress: number
  doneLabel: string
}>()
</script>

<template>
  <v-list-item :class="{ 'opacity-55': status === 'pending' }">
    <template #prepend>
      <v-icon
        :icon="
          status === 'done' ? 'mdi-check-circle' : status === 'active' ? icon : 'mdi-clock-outline'
        "
        :color="status === 'pending' ? 'grey' : 'primary'"
      />
    </template>
    <v-list-item-title>{{ name }}</v-list-item-title>
    <v-list-item-subtitle v-if="status === 'done'">{{ doneLabel }}</v-list-item-subtitle>
    <v-list-item-subtitle v-else-if="status === 'pending'">待機中</v-list-item-subtitle>
    <v-progress-linear
      v-else
      :model-value="progress"
      color="primary"
      height="4"
      rounded
      class="mt-1"
    />
    <template v-if="$slots.append" #append>
      <slot name="append" />
    </template>
  </v-list-item>
</template>

<style scoped>
.opacity-55 {
  opacity: 0.55;
}
</style>
