import { expect, test, vi } from 'vite-plus/test'

import { createRateLimiter } from './rate-limiter.d1.ts'

interface CounterRow {
  key: string
  count: number
  window_started_at: number
}

/** A tiny in-memory stand-in for `rate_limit_counters`, dispatching on the SQL text of each
 * `prepare()` call — mirrors the fake used in `dao/transfer.d1.test.ts`. */
const makeFakeD1 = () => {
  const rows: CounterRow[] = []

  const makeStatement = (sql: string) => {
    let args: unknown[] = []
    const statement = {
      bind: (...values: unknown[]) => {
        args = values
        return statement
      },
      first: async <T>(): Promise<T | null> => {
        if (sql.includes('FROM rate_limit_counters WHERE key = ?')) {
          return (rows.find((r) => r.key === args[0]) ?? null) as T | null
        }
        throw new Error(`fake D1: unhandled first() query: ${sql}`)
      },
      run: async <T>() => {
        if (sql.startsWith('INSERT INTO rate_limit_counters')) {
          const key = args[0] as string
          const existing = rows.find((r) => r.key === key)
          if (existing) {
            existing.count = 1
            existing.window_started_at = args[1] as number
          } else {
            rows.push({ key, count: 1, window_started_at: args[1] as number })
          }
          return { success: true, meta: { changes: 1 } } as unknown as D1Result<T>
        }
        if (sql.startsWith('UPDATE rate_limit_counters SET count = count + 1')) {
          const row = rows.find((r) => r.key === args[0])
          if (row) row.count += 1
          return { success: true, meta: { changes: row ? 1 : 0 } } as unknown as D1Result<T>
        }
        throw new Error(`fake D1: unhandled run() query: ${sql}`)
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

  return { db: db as unknown as D1Database, rows }
}

test('allows attempts up to the limit within the window', async () => {
  const limiter = createRateLimiter(makeFakeD1().db)

  expect(await limiter.consume('k', 2, 60_000)).toBe(true)
  expect(await limiter.consume('k', 2, 60_000)).toBe(true)
})

test('rejects once the limit is reached within the window', async () => {
  const limiter = createRateLimiter(makeFakeD1().db)

  await limiter.consume('k', 1, 60_000)

  expect(await limiter.consume('k', 1, 60_000)).toBe(false)
})

test('keeps separate counters per key', async () => {
  const { db } = makeFakeD1()
  const limiter = createRateLimiter(db)

  await limiter.consume('a', 1, 60_000)

  expect(await limiter.consume('b', 1, 60_000)).toBe(true)
})

test('resets the counter once the window has elapsed', async () => {
  vi.useFakeTimers()
  const limiter = createRateLimiter(makeFakeD1().db)

  await limiter.consume('k', 1, 60_000)
  expect(await limiter.consume('k', 1, 60_000)).toBe(false)

  vi.advanceTimersByTime(60_000)

  expect(await limiter.consume('k', 1, 60_000)).toBe(true)

  vi.useRealTimers()
})
