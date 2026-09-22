import { jwtVerify, SignJWT } from 'jose'

import type { SessionTokenIssuer } from './session-token.interface.ts'

// docs/spec.md section 27: authentication sessions are short-lived, longer than a Transfer
// Session (3 min) but not held onto for long.
const SESSION_TTL = '10m'

/** Signs/verifies our own short-lived auth session token (HS256) — separate from the Google ID
 * token, which is only ever exchanged once at sign-in. */
export const createSessionTokenIssuer = (secret: string): SessionTokenIssuer => {
  const key = new TextEncoder().encode(secret)

  return {
    create: (userId) =>
      new SignJWT({})
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(userId)
        .setIssuedAt()
        .setExpirationTime(SESSION_TTL)
        .sign(key),
    verify: async (token) => {
      try {
        const { payload } = await jwtVerify(token, key)
        return typeof payload.sub === 'string' ? payload.sub : null
      } catch {
        return null
      }
    },
  }
}
