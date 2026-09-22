<script setup lang="ts">
import { watch } from 'vue'

import { useSampleQuery } from '../composables/useSampleQuery.ts'
import { useNotificationStore } from '../stores/notification.ts'

const { data, isPending, isError, error, refetch } = useSampleQuery('1')
const notification = useNotificationStore()

watch(error, (err) => {
  if (err) notification.show(err.message)
})
</script>

<template>
  <v-container class="py-8">
    <v-card max-width="480" class="mx-auto">
      <v-card-title>Sample response</v-card-title>
      <v-card-text>
        <p v-if="isPending">Loading...</p>
        <p v-else-if="isError">Error: {{ error?.message }}</p>
        <p v-else>{{ data?.message ?? 'unknown' }}</p>
      </v-card-text>
      <v-card-actions>
        <v-btn text="Refresh" :loading="isPending" @click="refetch()" />
      </v-card-actions>
    </v-card>
  </v-container>
</template>
