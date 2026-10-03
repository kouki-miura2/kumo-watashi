import { expect, test } from 'vite-plus/test'

import { formatDate } from './format.ts'

test('formatDate uses yyyy-MM-dd in the app time zone by default, not UTC', () => {
  // 2026-09-27 15:30 UTC is already 2026-09-28 00:30 in JST.
  expect(formatDate(new Date('2026-09-27T15:30:00Z'))).toBe('2026-09-28')
  expect(formatDate(new Date('2026-09-27T14:59:59Z'))).toBe('2026-09-27')
})

test('formatDate supports time tokens', () => {
  expect(formatDate(new Date('2026-01-04T23:03:09Z'), 'yyyy.MM.dd HH:mm:ss')).toBe(
    '2026.01.05 08:03:09',
  )
})

test('formatDate supports unpadded month and day', () => {
  expect(formatDate(new Date('2026-01-04T23:00:00Z'), 'M/d')).toBe('1/5')
  expect(formatDate(new Date('2026-12-24T23:00:00Z'), 'M/d')).toBe('12/25')
})
