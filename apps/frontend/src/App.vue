<script setup lang="ts">
import { useNotificationStore } from './stores/notification.ts'

const notification = useNotificationStore()
</script>

<template>
  <v-app>
    <v-app-bar>
      <template #prepend>
        <RouterLink to="/" class="d-flex align-center text-decoration-none text-high-emphasis ml-2">
          <v-icon icon="mdi-weather-cloudy" class="mr-2" />
          <span class="text-subtitle-1 font-weight-medium">KUMO-WATASHI</span>
        </RouterLink>
      </template>
    </v-app-bar>
    <v-main>
      <router-view />
    </v-main>
    <v-snackbar v-model="notification.visible">{{ notification.message }}</v-snackbar>
  </v-app>
</template>
