export interface CleanupLock {
  /** Attempts to claim the lease for `leaseMs` from now, non-blocking. Returns `true` if this
   * call won the race — the caller should run the sweep, then call `release()` — or `false` if
   * another caller currently holds an unexpired lease, in which case the caller should skip the
   * sweep entirely rather than wait. `leaseMs` is a crash-safety upper bound, not the normal
   * cadence: the happy path always calls `release()` right after finishing. */
  tryAcquire: (leaseMs: number) => Promise<boolean>
  /** Releases an acquired lease early so the next request isn't blocked out until `leaseMs`
   * elapses just because this one already finished. */
  release: () => Promise<void>
}
