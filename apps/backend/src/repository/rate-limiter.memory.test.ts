import { expect, test, vi } from 'vite-plus/test'

import { createRateLimiter } from './rate-limiter.memory.ts'

test('allows attempts up to the limit within the window', async () => {
  const limiter = createRateLimiter()

  expect(await limiter.consume('k', 2, 60_000)).toBe(true)
  expect(await limiter.consume('k', 2, 60_000)).toBe(true)
})

test('rejects once the limit is reached within the window', async () => {
  const limiter = createRateLimiter()

  await limiter.consume('k', 1, 60_000)

  expect(await limiter.consume('k', 1, 60_000)).toBe(false)
})

test('keeps separate counters per key', async () => {
  const limiter = createRateLimiter()

  await limiter.consume('a', 1, 60_000)

  expect(await limiter.consume('b', 1, 60_000)).toBe(true)
})

test('resets the counter once the window has elapsed', async () => {
  vi.useFakeTimers()
  const limiter = createRateLimiter()

  await limiter.consume('k', 1, 60_000)
  expect(await limiter.consume('k', 1, 60_000)).toBe(false)

  vi.advanceTimersByTime(60_000)

  expect(await limiter.consume('k', 1, 60_000)).toBe(true)

  vi.useRealTimers()
})
