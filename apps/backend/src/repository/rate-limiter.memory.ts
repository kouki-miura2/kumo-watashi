import type { RateLimiter } from './rate-limiter.interface.ts'

interface Counter {
  count: number
  windowStartedAt: number
}

/** Per-isolate in-memory limiter — same durability caveat as `dao/transfer.memory.ts` /
 * `file-blob-store.memory.ts`. Fine for the Node dev/test entrypoint, where a single process
 * holds the whole counter map for its lifetime. */
export const createRateLimiter = (): RateLimiter => {
  const counters = new Map<string, Counter>()

  return {
    consume: async (key, limit, windowMs) => {
      const now = Date.now()
      const existing = counters.get(key)

      if (!existing || now - existing.windowStartedAt >= windowMs) {
        counters.set(key, { count: 1, windowStartedAt: now })
        return true
      }

      if (existing.count >= limit) return false

      existing.count += 1
      return true
    },
  }
}
