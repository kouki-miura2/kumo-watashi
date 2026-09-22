import { expect, test } from 'vite-plus/test'

import { createSessionTokenIssuer } from './session-token.jose.ts'

test('verifies a token it created, returning the original user id', async () => {
  const issuer = createSessionTokenIssuer('test-secret')

  const token = await issuer.create('user-123')
  const userId = await issuer.verify(token)

  expect(userId).toBe('user-123')
})

test('rejects a token signed with a different secret', async () => {
  const issuedBy = createSessionTokenIssuer('secret-a')
  const verifiedBy = createSessionTokenIssuer('secret-b')

  const token = await issuedBy.create('user-123')
  const userId = await verifiedBy.verify(token)

  expect(userId).toBeNull()
})

test('rejects garbage input instead of throwing', async () => {
  const issuer = createSessionTokenIssuer('test-secret')

  const userId = await issuer.verify('not-a-real-token')

  expect(userId).toBeNull()
})
