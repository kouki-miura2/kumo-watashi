import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, expect, test } from 'vite-plus/test'

import { useNotificationStore } from './notification.ts'

beforeEach(() => {
  setActivePinia(createPinia())
})

test('show sets the message and makes the snackbar visible', () => {
  const notification = useNotificationStore()

  notification.show('Something went wrong')

  expect(notification.message).toBe('Something went wrong')
  expect(notification.visible).toBe(true)
})

test('hide closes the snackbar but keeps the last message', () => {
  const notification = useNotificationStore()
  notification.show('Something went wrong')

  notification.hide()

  expect(notification.visible).toBe(false)
  expect(notification.message).toBe('Something went wrong')
})
