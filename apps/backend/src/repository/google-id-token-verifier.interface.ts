export interface VerifiedGoogleUser {
  /** Anonymized identifier (HMAC of Google's `sub`), never the raw Google id — see docs/spec.md section 8. */
  id: string
}

export interface GoogleIdTokenVerifier {
  /** Verifies a Google Identity Services ID token, or returns `null` if invalid/expired. */
  verify: (idToken: string) => Promise<VerifiedGoogleUser | null>
}
