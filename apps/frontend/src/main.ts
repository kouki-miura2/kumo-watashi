import { VueQueryPlugin } from '@tanstack/vue-query'
import { createPinia } from 'pinia'
import { createApp } from 'vue'

import App from './App.vue'
import { vuetify } from './plugins/vuetify.ts'
import { router } from './router/index.ts'

createApp(App).use(createPinia()).use(router).use(vuetify).use(VueQueryPlugin).mount('#app')
