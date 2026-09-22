<script setup lang="ts"></script>

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
  </v-app>
</template>
