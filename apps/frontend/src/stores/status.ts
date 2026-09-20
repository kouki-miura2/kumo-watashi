import { defineStore } from 'pinia'
import { createLogger } from 'utils'
import { ref } from 'vue'

import { apiClient } from '../api/client.ts'

const logger = createLogger({ prefix: 'status-store' })

export const useStatusStore = defineStore('status', () => {
  const status = ref<string | null>(null)
  const error = ref<string | null>(null)
  const loading = ref(false)

  const fetchStatus = async () => {
    loading.value = true
    error.value = null
    try {
      const res = await apiClient.index.$get()
      const data = await res.json()
      status.value = data.status
      logger.info('fetched backend status:', data.status)
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err)
      logger.error('failed to fetch backend status:', err)
    } finally {
      loading.value = false
    }
  }

  return { status, error, loading, fetchStatus }
})
