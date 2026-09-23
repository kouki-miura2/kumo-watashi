import { expect, test, vi } from 'vite-plus/test'

import { createCleanupLock } from './cleanup-lock.memory.ts'

test('the first acquire succeeds', async () => {
  const lock = createCleanupLock()

  expect(await lock.tryAcquire(60_000)).toBe(true)
})

test('a second acquire fails while the lease is still held', async () => {
  const lock = createCleanupLock()
  await lock.tryAcquire(60_000)

  expect(await lock.tryAcquire(60_000)).toBe(false)
})

test('release lets the next acquire succeed immediately', async () => {
  const lock = createCleanupLock()
  await lock.tryAcquire(60_000)

  await lock.release()

  expect(await lock.tryAcquire(60_000)).toBe(true)
})

test('the lease expires on its own once leaseMs has elapsed', async () => {
  vi.useFakeTimers()
  const lock = createCleanupLock()
  await lock.tryAcquire(60_000)

  vi.advanceTimersByTime(60_000)

  expect(await lock.tryAcquire(60_000)).toBe(true)

  vi.useRealTimers()
})
