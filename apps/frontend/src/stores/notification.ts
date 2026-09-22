import { defineStore } from 'pinia'
import { ref } from 'vue'

/** Global UI state for a single app-wide snackbar. Not tied to any one API call or view. */
export const useNotificationStore = defineStore('notification', () => {
  const message = ref<string | null>(null)
  const visible = ref(false)

  const show = (text: string) => {
    message.value = text
    visible.value = true
  }

  const hide = () => {
    visible.value = false
  }

  return { message, visible, show, hide }
})
