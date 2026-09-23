import { expect, test, vi } from 'vite-plus/test'

vi.mock('jose', () => ({
  createRemoteJWKSet: vi.fn(() => 'mock-jwks'),
  jwtVerify: vi.fn(),
}))

import { jwtVerify } from 'jose'

import { createGoogleIdTokenVerifier } from './google-id-token-verifier.jose.ts'

const mockedJwtVerify = vi.mocked(jwtVerify)

const mockPayload = (payload: Record<string, unknown>) => {
  mockedJwtVerify.mockResolvedValue({
    payload,
  } as unknown as Awaited<ReturnType<typeof jwtVerify>>)
}

test('returns the verified, email_verified email as-is — docs/spec.md section 8.2 logs it unanonymized', async () => {
  mockPayload({ sub: 'google-subject-123', email: 'yuki@example.com', email_verified: true })

  const verifier = createGoogleIdTokenVerifier('test-client-id')
  const result = await verifier.verify('a.valid.token')

  expect(result).toEqual({ email: 'yuki@example.com' })
})

test('checks the token against Google issuers and the configured client id as audience', async () => {
  mockPayload({ sub: 'google-subject-123', email: 'yuki@example.com', email_verified: true })

  const verifier = createGoogleIdTokenVerifier('expected-client-id')
  await verifier.verify('a.valid.token')

  expect(mockedJwtVerify).toHaveBeenCalledWith(
    'a.valid.token',
    'mock-jwks',
    expect.objectContaining({
      issuer: ['https://accounts.google.com', 'accounts.google.com'],
      audience: 'expected-client-id',
    }),
  )
})

test('returns null when verification throws (invalid signature, expired, wrong audience, ...)', async () => {
  mockedJwtVerify.mockRejectedValue(new Error('signature verification failed'))

  const verifier = createGoogleIdTokenVerifier('test-client-id')
  const result = await verifier.verify('a.bad.token')

  expect(result).toBeNull()
})

test('returns null when the verified payload has no email', async () => {
  mockPayload({ sub: 'google-subject-123', email_verified: true })

  const verifier = createGoogleIdTokenVerifier('test-client-id')
  const result = await verifier.verify('a.valid.token')

  expect(result).toBeNull()
})

test('returns null when the email is not marked verified by Google', async () => {
  mockPayload({ sub: 'google-subject-123', email: 'yuki@example.com', email_verified: false })

  const verifier = createGoogleIdTokenVerifier('test-client-id')
  const result = await verifier.verify('a.valid.token')

  expect(result).toBeNull()
})
