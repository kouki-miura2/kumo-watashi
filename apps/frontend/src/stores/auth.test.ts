import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, expect, test } from 'vite-plus/test'

import { useAuthStore } from './auth.ts'

beforeEach(() => {
  setActivePinia(createPinia())
})

test('starts unauthenticated', () => {
  const auth = useAuthStore()

  expect(auth.isAuthenticated).toBe(false)
  expect(auth.token).toBeNull()
  expect(auth.email).toBeNull()
})

test('signOut clears the session', () => {
  const auth = useAuthStore()
  auth.token = 'a-session-token'
  auth.email = 'yuki@example.com'

  auth.signOut()

  expect(auth.isAuthenticated).toBe(false)
  expect(auth.token).toBeNull()
  expect(auth.email).toBeNull()
})
