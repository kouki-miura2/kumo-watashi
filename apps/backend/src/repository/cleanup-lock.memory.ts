import type { CleanupLock } from './cleanup-lock.interface.ts'

/** Per-isolate in-memory lock — same durability caveat as `dao/transfer.memory.ts`. A single Node
 * process is enough of a "single writer" that a plain variable reproduces the D1 version's
 * race-free guarantee for the Node dev/test entrypoint. */
export const createCleanupLock = (): CleanupLock => {
  let lockedUntil = 0

  return {
    tryAcquire: async (leaseMs) => {
      const now = Date.now()
      if (lockedUntil > now) return false
      lockedUntil = now + leaseMs
      return true
    },
    release: async () => {
      lockedUntil = 0
    },
  }
}
