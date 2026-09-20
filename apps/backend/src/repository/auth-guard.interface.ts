export interface AuthenticatedUser {
  id: string
}

export interface AuthGuard {
  /** Resolves the authenticated user from a request, or `null` if unauthenticated. */
  authenticate: (request: Request) => Promise<AuthenticatedUser | null>
}
