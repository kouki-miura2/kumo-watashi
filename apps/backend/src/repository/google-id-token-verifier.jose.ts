import { createRemoteJWKSet, jwtVerify } from 'jose'

import type {
  GoogleIdTokenVerifier,
  VerifiedGoogleUser,
} from './google-id-token-verifier.interface.ts'

const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com']

// Module scope so jose's internal key cache is shared across every verifier instance/request,
// instead of re-fetching Google's JWKS on each call.
const googleJwks = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'))

/** Verifies a Google ID token's signature/issuer/audience against Google's public JWKS and
 * returns the verified email as-is — docs/spec.md section 8.2 records it unanonymized in logs so
 * the operator can tell their own use apart from an authorized third party's or an unauthorized
 * one's. Requires `email_verified` (Google's own recommendation before trusting the claim). */
export const createGoogleIdTokenVerifier = (clientId: string): GoogleIdTokenVerifier => ({
  verify: async (idToken): Promise<VerifiedGoogleUser | null> => {
    try {
      const { payload } = await jwtVerify(idToken, googleJwks, {
        issuer: GOOGLE_ISSUERS,
        audience: clientId,
      })
      if (typeof payload.email !== 'string' || !payload.email) return null
      if (payload.email_verified !== true) return null
      return { email: payload.email }
    } catch {
      return null
    }
  },
})
