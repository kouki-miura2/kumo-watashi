import { expect, test, vi } from 'vite-plus/test'

vi.mock('jose', () => ({
  createRemoteJWKSet: vi.fn(() => 'mock-jwks'),
  jwtVerify: vi.fn(),
}))

import { jwtVerify } from 'jose'

import { createGoogleIdTokenVerifier } from './google-id-token-verifier.jose.ts'

const mockedJwtVerify = vi.mocked(jwtVerify)

test('returns an anonymized id for a valid token, never the raw Google sub', async () => {
  mockedJwtVerify.mockResolvedValue({
    payload: { sub: 'google-subject-123' },
  } as unknown as Awaited<ReturnType<typeof jwtVerify>>)

  const verifier = createGoogleIdTokenVerifier('test-client-id', 'test-secret')
  const result = await verifier.verify('a.valid.token')

  expect(result).not.toBeNull()
  expect(result?.id).not.toBe('google-subject-123')
  expect(result?.id).toMatch(/^[0-9a-f]{64}$/)
})

test('checks the token against Google issuers and the configured client id as audience', async () => {
  mockedJwtVerify.mockResolvedValue({
    payload: { sub: 'google-subject-123' },
  } as unknown as Awaited<ReturnType<typeof jwtVerify>>)

  const verifier = createGoogleIdTokenVerifier('expected-client-id', 'test-secret')
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

test('produces the same anonymized id for the same Google subject', async () => {
  mockedJwtVerify.mockResolvedValue({
    payload: { sub: 'google-subject-123' },
  } as unknown as Awaited<ReturnType<typeof jwtVerify>>)

  const verifier = createGoogleIdTokenVerifier('test-client-id', 'test-secret')
  const first = await verifier.verify('token-a')
  const second = await verifier.verify('token-b')

  expect(first?.id).toBe(second?.id)
})

test('returns null when verification throws (invalid signature, expired, wrong audience, ...)', async () => {
  mockedJwtVerify.mockRejectedValue(new Error('signature verification failed'))

  const verifier = createGoogleIdTokenVerifier('test-client-id', 'test-secret')
  const result = await verifier.verify('a.bad.token')

  expect(result).toBeNull()
})

test('returns null when the verified payload has no subject', async () => {
  mockedJwtVerify.mockResolvedValue({
    payload: {},
  } as unknown as Awaited<ReturnType<typeof jwtVerify>>)

  const verifier = createGoogleIdTokenVerifier('test-client-id', 'test-secret')
  const result = await verifier.verify('a.valid.token')

  expect(result).toBeNull()
})
