<script setup lang="ts">
import { onMounted } from 'vue'

import { useSampleStore } from '../stores/sample.ts'

const sampleStore = useSampleStore()

onMounted(() => {
  sampleStore.fetchSample('1')
})
</script>

<template>
  <v-container class="py-8">
    <v-card max-width="480" class="mx-auto">
      <v-card-title>Sample response</v-card-title>
      <v-card-text>
        <p v-if="sampleStore.loading">Loading...</p>
        <p v-else-if="sampleStore.error">Error: {{ sampleStore.error }}</p>
        <p v-else>{{ sampleStore.message ?? 'unknown' }}</p>
      </v-card-text>
      <v-card-actions>
        <v-btn
          text="Refresh"
          :loading="sampleStore.loading"
          @click="sampleStore.fetchSample('1')"
        />
      </v-card-actions>
    </v-card>
  </v-container>
</template>
