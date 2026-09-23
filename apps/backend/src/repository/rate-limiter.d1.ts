import type { RateLimiter } from './rate-limiter.interface.ts'

interface CounterRow {
  count: number
  window_started_at: number
}

/** Cloudflare D1 implementation (docs/spec.md section 10) — durable across isolates, unlike
 * `rate-limiter.memory.ts`. Shares the same fixed-window semantics: a row per key, reset once
 * `windowMs` has elapsed since `window_started_at`. */
export const createRateLimiter = (db: D1Database): RateLimiter => ({
  consume: async (key, limit, windowMs) => {
    const now = Date.now()
    const row = await db
      .prepare('SELECT count, window_started_at FROM rate_limit_counters WHERE key = ?')
      .bind(key)
      .first<CounterRow>()

    if (!row || now - row.window_started_at >= windowMs) {
      await db
        .prepare(
          `INSERT INTO rate_limit_counters (key, count, window_started_at) VALUES (?, 1, ?)
           ON CONFLICT (key) DO UPDATE SET count = 1, window_started_at = excluded.window_started_at`,
        )
        .bind(key, now)
        .run()
      return true
    }

    if (row.count >= limit) return false

    await db
      .prepare('UPDATE rate_limit_counters SET count = count + 1 WHERE key = ?')
      .bind(key)
      .run()
    return true
  },
})
