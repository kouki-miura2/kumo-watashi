import { expect, test } from 'vite-plus/test'

import { formatDate } from './format.ts'

test('formatDate uses yyyy-MM-dd by default', () => {
  expect(formatDate(new Date(2026, 0, 5))).toBe('2026-01-05')
})

test('formatDate supports time tokens', () => {
  expect(formatDate(new Date(2026, 0, 5, 8, 3, 9), 'yyyy/MM/dd HH:mm:ss')).toBe(
    '2026/01/05 08:03:09',
  )
})
