import type { TurnstileVerifier } from './turnstile-verifier.interface.ts'

// Never a real Turnstile token — a fixed sentinel the Node dev/test entrypoint's stub Widget
// (or a test) sends instead, since this stub never calls Cloudflare's real siteverify endpoint.
export const TEST_PASS_TOKEN = 'test-pass'

/** Node dev/test stub — no network call, no real widget needed. Accepts only `TEST_PASS_TOKEN`,
 * so a request with no token (or a stale/wrong one) still fails the way production would. */
export const createTurnstileVerifier = (): TurnstileVerifier => ({
  verify: async (token) => token === TEST_PASS_TOKEN,
})
