import type { CleanupLock } from './cleanup-lock.interface.ts'

/** Cloudflare D1 implementation (docs/spec.md section 5.1). D1 processes queries against a given
 * database one at a time, so this conditional `UPDATE` is inherently race-free: at most one
 * concurrent request can ever see `changes === 1` for the same lease window. */
export const createCleanupLock = (db: D1Database): CleanupLock => ({
  tryAcquire: async (leaseMs) => {
    const now = Date.now()
    const result = await db
      .prepare('UPDATE cleanup_lock SET locked_until = ? WHERE id = 1 AND locked_until <= ?')
      .bind(now + leaseMs, now)
      .run()
    return result.meta.changes === 1
  },
  release: async () => {
    await db.prepare('UPDATE cleanup_lock SET locked_until = 0 WHERE id = 1').run()
  },
})
