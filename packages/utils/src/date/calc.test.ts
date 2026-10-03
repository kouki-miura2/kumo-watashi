import { expect, test } from 'vite-plus/test'

import {
  addDays,
  addMonths,
  addYears,
  diffInDays,
  endOfDay,
  isSameDay,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from './calc.ts'

// All expectations assume the default app time zone, JST (UTC+9).

test('addDays shifts by whole days without mutating the input', () => {
  const date = new Date('2026-01-31T03:00:00Z')

  expect(addDays(date, 1).toISOString()).toBe('2026-02-01T03:00:00.000Z')
  expect(date.toISOString()).toBe('2026-01-31T03:00:00.000Z')
})

test('addMonths moves by calendar months in the app time zone and clamps the day', () => {
  expect(addMonths(new Date('2026-09-28T03:00:00Z'), -3).toISOString()).toBe(
    '2026-06-28T03:00:00.000Z',
  )
  // 2026-03-31 09:00 JST minus 1 month is 2026-02-28 09:00 JST.
  expect(addMonths(new Date('2026-03-31T00:00:00Z'), -1).toISOString()).toBe(
    '2026-02-28T00:00:00.000Z',
  )
  // 2026-01-31 23:00 UTC is already Feb 1 in JST, so plus 1 month is Mar 1 JST.
  expect(addMonths(new Date('2026-01-31T23:00:00Z'), 1).toISOString()).toBe(
    '2026-02-28T23:00:00.000Z',
  )
})

test('addYears clamps Feb 29 to Feb 28', () => {
  expect(addYears(new Date('2028-02-29T00:00:00Z'), 1).toISOString()).toBe(
    '2029-02-28T00:00:00.000Z',
  )
})

test('startOfDay / endOfDay use the app time zone day', () => {
  // 2026-06-15 13:45 JST.
  const date = new Date('2026-06-15T04:45:00Z')

  expect(startOfDay(date).toISOString()).toBe('2026-06-14T15:00:00.000Z')
  expect(endOfDay(date).toISOString()).toBe('2026-06-15T14:59:59.999Z')
})

test('startOfWeek returns Monday 00:00 by default', () => {
  // Sunday 2026-10-04 23:00 JST belongs to the week starting Monday 2026-09-28.
  expect(startOfWeek(new Date('2026-10-04T14:00:00Z')).toISOString()).toBe(
    '2026-09-27T15:00:00.000Z',
  )
  // Monday 2026-10-05 00:00 JST starts a new week.
  expect(startOfWeek(new Date('2026-10-04T15:00:00Z')).toISOString()).toBe(
    '2026-10-04T15:00:00.000Z',
  )
})

test('startOfWeek accepts another first day of the week', () => {
  // Sunday 2026-10-04 23:00 JST starts its own Sunday-first week.
  expect(startOfWeek(new Date('2026-10-04T14:00:00Z'), 0).toISOString()).toBe(
    '2026-10-03T15:00:00.000Z',
  )
})

test('startOfMonth returns the 1st at 00:00', () => {
  // 2026-09-30 16:00 UTC is 2026-10-01 01:00 JST.
  expect(startOfMonth(new Date('2026-09-30T16:00:00Z')).toISOString()).toBe(
    '2026-09-30T15:00:00.000Z',
  )
})

test('isSameDay compares the app time zone calendar date', () => {
  // Both are 2026-06-15 in JST, though different UTC dates.
  expect(isSameDay(new Date('2026-06-14T16:00:00Z'), new Date('2026-06-15T14:00:00Z'))).toBe(true)
  expect(isSameDay(new Date('2026-06-15T14:00:00Z'), new Date('2026-06-15T16:00:00Z'))).toBe(false)
})

test('diffInDays counts calendar days between two dates', () => {
  // 2026-06-20 00:30 JST vs 2026-06-15 23:30 JST.
  expect(diffInDays(new Date('2026-06-19T15:30:00Z'), new Date('2026-06-15T14:30:00Z'))).toBe(5)
  expect(diffInDays(new Date('2026-06-15T14:30:00Z'), new Date('2026-06-19T15:30:00Z'))).toBe(-5)
})
