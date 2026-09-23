export interface RateLimiter {
  /** Records one attempt against `key` within a fixed `windowMs` window. Returns `false` once
   * `limit` attempts have already been recorded for the current window (the caller should reject
   * the request without performing the action being limited); returns `true` otherwise. A new
   * window starts automatically once `windowMs` has elapsed since the first attempt in it. */
  consume: (key: string, limit: number, windowMs: number) => Promise<boolean>
}
