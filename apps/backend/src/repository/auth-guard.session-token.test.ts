import { expect, test } from 'vite-plus/test'

import { createSessionTokenAuthGuard } from './auth-guard.session-token.ts'
import type { SessionTokenIssuer } from './session-token.interface.ts'

const fakeSessionTokens: SessionTokenIssuer = {
  create: async (userId) => `session-for-${userId}`,
  verify: async (token) => (token.startsWith('session-for-') ? token.slice(12) : null),
}

test('resolves the user id embedded in a valid Bearer session token', async () => {
  const guard = createSessionTokenAuthGuard(fakeSessionTokens)
  const token = await fakeSessionTokens.create('yuki@example.com')

  const user = await guard.authenticate(
    new Request('http://localhost/', { headers: { authorization: `Bearer ${token}` } }),
  )

  expect(user).toEqual({ id: 'yuki@example.com' })
})

test('rejects a request with no Authorization header', async () => {
  const guard = createSessionTokenAuthGuard(fakeSessionTokens)

  const user = await guard.authenticate(new Request('http://localhost/'))

  expect(user).toBeNull()
})

test('rejects an Authorization header that is not a Bearer token', async () => {
  const guard = createSessionTokenAuthGuard(fakeSessionTokens)

  const user = await guard.authenticate(
    new Request('http://localhost/', { headers: { authorization: 'Basic dXNlcjpwYXNz' } }),
  )

  expect(user).toBeNull()
})

test('rejects an invalid or expired session token', async () => {
  const guard = createSessionTokenAuthGuard(fakeSessionTokens)

  const user = await guard.authenticate(
    new Request('http://localhost/', { headers: { authorization: 'Bearer not-a-real-token' } }),
  )

  expect(user).toBeNull()
})
