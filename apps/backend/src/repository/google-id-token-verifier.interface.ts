export interface VerifiedGoogleUser {
  /** The verified account's email address, used as-is (not anonymized) for session identity and
   * audit logging — see docs/spec.md section 8.2. */
  email: string
}

export interface GoogleIdTokenVerifier {
  /** Verifies a Google Identity Services ID token, or returns `null` if invalid/expired. */
  verify: (idToken: string) => Promise<VerifiedGoogleUser | null>
}
