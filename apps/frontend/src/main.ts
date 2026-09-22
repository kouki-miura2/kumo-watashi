import { VueQueryPlugin } from '@tanstack/vue-query'
import { createPinia } from 'pinia'
import { createApp } from 'vue'

import App from './App.vue'
import { vuetify } from './plugins/vuetify.ts'
import { router } from './router/index.ts'

createApp(App)
  .use(createPinia())
  .use(router)
  .use(vuetify)
  // `retry: false`: without it, TanStack Query's default of 3 retries with exponential backoff
  // turns one 3s-timeout request into ~20s before the error surfaces.
  .use(VueQueryPlugin, { queryClientConfig: { defaultOptions: { queries: { retry: false } } } })
  .mount('#app')
