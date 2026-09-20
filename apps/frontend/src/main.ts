import { createPinia } from "pinia";
import { createApp } from "vue";
import App from "./App.vue";
import { router } from "./router/index.ts";
import { vuetify } from "./plugins/vuetify.ts";

createApp(App).use(createPinia()).use(router).use(vuetify).mount("#app");
