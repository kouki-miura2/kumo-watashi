import { defineStore } from 'pinia'
import { createLogger } from 'utils'
import { ref } from 'vue'

import { apiClient } from '../api/client.ts'

const logger = createLogger({ prefix: 'sample-store' })

export const useSampleStore = defineStore('sample', () => {
  const message = ref<string | null>(null)
  const error = ref<string | null>(null)
  const loading = ref(false)

  const fetchSample = async (id: string) => {
    loading.value = true
    error.value = null
    try {
      const res = await apiClient.sample[':id'].$get({ param: { id } })
      if (!res.ok) throw new Error(`Request failed: ${res.status}`)
      const data = await res.json()
      message.value = data.message
      logger.info('fetched sample', { id, message: data.message })
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err)
      logger.error('failed to fetch sample', { id, error: err })
    } finally {
      loading.value = false
    }
  }

  return { message, error, loading, fetchSample }
})
