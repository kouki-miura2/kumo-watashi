import type { AuthGuard } from './auth-guard.interface.ts'

/**
 * Default `AuthGuard`: treats a non-empty `Authorization` header as the user id.
 * Not a real credential check — projects add a real `AuthGuard` (JWT, API key,
 * Cloudflare Access, ...) alongside this file before turning the guard on.
 */
export const createAuthGuard = (): AuthGuard => ({
  authenticate: async (request) => {
    const token = request.headers.get('authorization')
    return token ? { id: token } : null
  },
})
