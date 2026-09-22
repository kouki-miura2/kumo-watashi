export interface SessionTokenIssuer {
  /** Issues a short-lived, signed session token carrying `userId` as its subject. */
  create: (userId: string) => Promise<string>
  /** Verifies a session token, returning its subject (`userId`) or `null` if invalid/expired. */
  verify: (token: string) => Promise<string | null>
}
