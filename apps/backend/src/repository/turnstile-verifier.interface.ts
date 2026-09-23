export interface TurnstileVerifier {
  /** Verifies a Turnstile token from the client against Cloudflare's siteverify endpoint. Returns
   * `false` for a missing/invalid/expired token, a mismatched action, or a network/upstream
   * failure — verification fails closed. */
  verify: (token: string, remoteIp: string | undefined) => Promise<boolean>
}
