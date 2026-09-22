import { createRemoteJWKSet, jwtVerify } from 'jose'

import type {
  GoogleIdTokenVerifier,
  VerifiedGoogleUser,
} from './google-id-token-verifier.interface.ts'

const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com']

// Module scope so jose's internal key cache is shared across every verifier instance/request,
// instead of re-fetching Google's JWKS on each call.
const googleJwks = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'))

const hmacHex = async (value: string, secret: string): Promise<string> => {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value))
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  )
}

/** Verifies a Google ID token's signature/issuer/audience against Google's public JWKS, and
 * anonymizes the subject before it ever leaves this function — see docs/spec.md section 8. */
export const createGoogleIdTokenVerifier = (
  clientId: string,
  anonymizationSecret: string,
): GoogleIdTokenVerifier => ({
  verify: async (idToken): Promise<VerifiedGoogleUser | null> => {
    try {
      const { payload } = await jwtVerify(idToken, googleJwks, {
        issuer: GOOGLE_ISSUERS,
        audience: clientId,
      })
      if (typeof payload.sub !== 'string' || !payload.sub) return null
      return { id: await hmacHex(payload.sub, anonymizationSecret) }
    } catch {
      return null
    }
  },
})
