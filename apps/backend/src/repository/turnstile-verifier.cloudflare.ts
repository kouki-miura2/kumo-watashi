import type { TurnstileVerifier } from './turnstile-verifier.interface.ts'

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

// docs/spec.md section 9 — the one action this project asks Turnstile to gate (Transfer Session
// creation). Checked against siteverify's own `action` field so a token solved for a different
// surface can't be replayed here.
export const CREATE_TRANSFER_ACTION = 'create_transfer'

interface SiteverifyResponse {
  success?: boolean
  action?: string
  hostname?: string
}

/** Calls Cloudflare's real siteverify endpoint (docs/spec.md section 9). `expectedHostnames`
 * pins the token to the deployer's own frontend origin(s) — empty means "don't check" (skipped
 * rather than failing closed, so a deployer who hasn't set `TURNSTILE_HOSTNAMES` yet still gets
 * the action-match + secret-key protection instead of every request 403ing). */
export const createTurnstileVerifier = (
  secretKey: string,
  expectedHostnames: string[],
): TurnstileVerifier => ({
  verify: async (token, remoteIp) => {
    if (!token) return false

    let result: SiteverifyResponse
    try {
      const res = await fetch(SITEVERIFY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        signal: AbortSignal.timeout(10_000),
        body: new URLSearchParams({
          secret: secretKey,
          response: token,
          ...(remoteIp ? { remoteip: remoteIp } : {}),
        }),
      })
      if (!res.ok) return false
      result = await res.json()
    } catch {
      return false
    }

    if (!result.success) return false
    if (result.action !== CREATE_TRANSFER_ACTION) return false
    if (expectedHostnames.length > 0 && !expectedHostnames.includes(result.hostname ?? '')) {
      return false
    }
    return true
  },
})
