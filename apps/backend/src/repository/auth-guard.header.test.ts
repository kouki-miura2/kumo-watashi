import { expect, test } from 'vite-plus/test'

import { createAuthGuard } from './auth-guard.header.ts'

test('createAuthGuard resolves a user id from a non-empty Authorization header', async () => {
  const guard = createAuthGuard()

  await expect(
    guard.authenticate(new Request('http://localhost/', { headers: { authorization: 'token' } })),
  ).resolves.toEqual({
    id: 'token',
  })
})

test('createAuthGuard resolves null without an Authorization header', async () => {
  const guard = createAuthGuard()

  await expect(guard.authenticate(new Request('http://localhost/'))).resolves.toBeNull()
})
