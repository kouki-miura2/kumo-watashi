import { expect, test, vi } from 'vite-plus/test'

import { createCleanupLock } from './cleanup-lock.d1.ts'

/** A tiny in-memory stand-in for the single-row `cleanup_lock` table, dispatching on the SQL text
 * of each `prepare()` call — mirrors the fakes used in `dao/transfer.d1.test.ts` /
 * `rate-limiter.d1.test.ts`. */
const makeFakeD1 = () => {
  let lockedUntil = 0

  const makeStatement = (sql: string) => {
    let args: unknown[] = []
    const statement = {
      bind: (...values: unknown[]) => {
        args = values
        return statement
      },
      run: async <T>() => {
        if (sql.startsWith('UPDATE cleanup_lock SET locked_until = ? WHERE id = 1 AND')) {
          const [nextLockedUntil, now] = args as [number, number]
          if (lockedUntil > now)
            return { success: true, meta: { changes: 0 } } as unknown as D1Result<T>
          lockedUntil = nextLockedUntil
          return { success: true, meta: { changes: 1 } } as unknown as D1Result<T>
        }
        if (sql.startsWith('UPDATE cleanup_lock SET locked_until = 0')) {
          lockedUntil = 0
          return { success: true, meta: { changes: 1 } } as unknown as D1Result<T>
        }
        throw new Error(`fake D1: unhandled run() query: ${sql}`)
      },
      first: async () => {
        throw new Error('not implemented')
      },
      all: async () => {
        throw new Error('not implemented')
      },
      raw: async () => {
        throw new Error('not implemented')
      },
    }
    return statement as unknown as D1PreparedStatement
  }

  const db = {
    prepare: (sql: string) => makeStatement(sql),
    batch: async (statements: D1PreparedStatement[]) => Promise.all(statements.map((s) => s.run())),
    exec: async () => {
      throw new Error('not implemented')
    },
    withSession: () => {
      throw new Error('not implemented')
    },
    dump: async () => new ArrayBuffer(0),
  }

  return db as unknown as D1Database
}

test('the first acquire succeeds', async () => {
  const lock = createCleanupLock(makeFakeD1())

  expect(await lock.tryAcquire(60_000)).toBe(true)
})

test('a second acquire fails while the lease is still held', async () => {
  const lock = createCleanupLock(makeFakeD1())
  await lock.tryAcquire(60_000)

  expect(await lock.tryAcquire(60_000)).toBe(false)
})

test('release lets the next acquire succeed immediately', async () => {
  const lock = createCleanupLock(makeFakeD1())
  await lock.tryAcquire(60_000)

  await lock.release()

  expect(await lock.tryAcquire(60_000)).toBe(true)
})

test('the lease expires on its own once leaseMs has elapsed', async () => {
  vi.useFakeTimers()
  const lock = createCleanupLock(makeFakeD1())
  await lock.tryAcquire(60_000)

  vi.advanceTimersByTime(60_000)

  expect(await lock.tryAcquire(60_000)).toBe(true)

  vi.useRealTimers()
})
