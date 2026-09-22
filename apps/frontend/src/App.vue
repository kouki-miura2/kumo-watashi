<script setup lang="ts">
import { useNotificationStore } from './stores/notification.ts'

const notification = useNotificationStore()
</script>

<template>
  <v-app>
    <v-app-bar title="KUMO-WATASHI">
      <template #prepend>
        <v-icon icon="mdi-weather-cloudy" class="ml-2" />
      </template>
    </v-app-bar>
    <v-main>
      <router-view />
    </v-main>
    <v-snackbar v-model="notification.visible">{{ notification.message }}</v-snackbar>
  </v-app>
</template>
