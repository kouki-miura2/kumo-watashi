import type { AuthGuard } from './auth-guard.interface.ts'
import type { SessionTokenIssuer } from './session-token.interface.ts'

const BEARER_PREFIX = 'Bearer '

/** Real `AuthGuard`: verifies the `Authorization: Bearer <token>` session token issued by
 * `POST /api/auth/google` (see `session-token.jose.ts`) — replaces the `auth-guard.header.ts`
 * placeholder, which trusted any non-empty header as-is. The resolved id is the email embedded in
 * the token at sign-in (docs/spec.md section 8.2), not re-verified against Google here. */
export const createSessionTokenAuthGuard = (sessionTokens: SessionTokenIssuer): AuthGuard => ({
  authenticate: async (request) => {
    const header = request.headers.get('authorization')
    if (!header?.startsWith(BEARER_PREFIX)) return null

    const token = header.slice(BEARER_PREFIX.length)
    const userId = await sessionTokens.verify(token)
    return userId ? { id: userId } : null
  },
})
