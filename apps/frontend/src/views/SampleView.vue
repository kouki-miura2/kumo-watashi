<script setup lang="ts">
import { useNotificationStore } from '../stores/notification.ts'

const notification = useNotificationStore()
</script>

<template>
  <v-container class="py-8">
    <v-card max-width="480" class="mx-auto">
      <v-card-title>Sample</v-card-title>
      <v-card-text>
        <p>Vue 3 + Vuetify 4 + vue-router + Pinia + Hono RPC boilerplate.</p>
      </v-card-text>
      <v-card-actions>
        <v-btn text="Show notification" @click="notification.show('Hello from Pinia!')" />
      </v-card-actions>
    </v-card>
  </v-container>
</template>
