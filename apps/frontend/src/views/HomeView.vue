<script setup lang="ts">
import { onMounted } from 'vue'

import { useStatusStore } from '../stores/status.ts'

const statusStore = useStatusStore()

onMounted(() => {
  statusStore.fetchStatus()
})
</script>

<template>
  <v-container class="py-8">
    <v-card max-width="480" class="mx-auto">
      <v-card-title>Backend status</v-card-title>
      <v-card-text>
        <p v-if="statusStore.loading">Loading...</p>
        <p v-else-if="statusStore.error">Error: {{ statusStore.error }}</p>
        <p v-else>{{ statusStore.status ?? 'unknown' }}</p>
      </v-card-text>
      <v-card-actions>
        <v-btn text="Refresh" :loading="statusStore.loading" @click="statusStore.fetchStatus()" />
      </v-card-actions>
    </v-card>
  </v-container>
</template>
