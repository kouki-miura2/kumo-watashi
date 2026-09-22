<script setup lang="ts">
import { useNotificationStore } from './stores/notification.ts'

const notification = useNotificationStore()
</script>

<template>
  <v-app>
    <v-app-bar title="fs-ts">
      <template #append>
        <v-btn to="/" text="Home" />
        <v-btn to="/sample" text="Sample" />
      </template>
    </v-app-bar>
    <v-main>
      <router-view />
    </v-main>
    <v-snackbar v-model="notification.visible">{{ notification.message }}</v-snackbar>
  </v-app>
</template>
