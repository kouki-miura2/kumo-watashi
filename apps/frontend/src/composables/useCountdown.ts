import { computed, onScopeDispose, ref } from 'vue'

/** Transfer Session TTL countdown, shared by UploaderView (its own transfer) and DownloaderView
 * (the transfer it joined) — both need the same "seconds remaining" ticker, `m:ss` label, and
 * progress-bar ratio, and both re-arm it on the same event (session created/joined, or extended).
 */
export const useCountdown = () => {
  const secondsRemaining = ref(0)

  let expiresAt = 0
  // The current window's original length, captured alongside `expiresAt` — needed because
  // `remainingRatio` can't derive "how long was this window" from a countdown that only shrinks.
  let ttlMs = 0
  let timer: ReturnType<typeof setInterval> | undefined

  const tick = () => {
    secondsRemaining.value = Math.max(0, Math.round((expiresAt - Date.now()) / 1000))
    if (secondsRemaining.value === 0 && timer) {
      clearInterval(timer)
      timer = undefined
    }
  }

  const stop = () => {
    if (timer) clearInterval(timer)
    timer = undefined
  }

  /** (Re)arms the countdown for a new expiry — call again after `extend()` resets it server-side. */
  const start = (newExpiresAt: number, newTtlMs = Math.max(1, newExpiresAt - Date.now())) => {
    expiresAt = newExpiresAt
    ttlMs = newTtlMs
    stop()
    tick()
    timer = setInterval(tick, 1000)
  }

  const remainingLabel = computed(() => {
    const m = Math.floor(secondsRemaining.value / 60)
    const s = secondsRemaining.value % 60
    return `${m}:${String(s).padStart(2, '0')}`
  })

  const remainingRatio = computed(() =>
    ttlMs > 0 ? ((secondsRemaining.value * 1000) / ttlMs) * 100 : 0,
  )

  onScopeDispose(stop)

  return { secondsRemaining, remainingLabel, remainingRatio, start, stop }
}
