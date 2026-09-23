import { expect, test, vi } from 'vite-plus/test'

import type { AuthPathPatternExclusion } from './app.ts'
import { AUTH_EXCLUDE_PATH_PATTERNS, AUTH_EXCLUDE_PATHS, createApp } from './app.ts'
import type { AuthGuard } from './repository/auth-guard.interface.ts'
import type { CleanupLock } from './repository/cleanup-lock.interface.ts'
import type { GoogleIdTokenVerifier } from './repository/google-id-token-verifier.interface.ts'
import type { RateLimiter } from './repository/rate-limiter.interface.ts'
import type { SessionTokenIssuer } from './repository/session-token.interface.ts'
import type { TurnstileVerifier } from './repository/turnstile-verifier.interface.ts'
import type { TransferService } from './service/transfer.service.ts'

const allowAllGuard: AuthGuard = { authenticate: async () => ({ id: 'test-user' }) }
const denyAllGuard: AuthGuard = { authenticate: async () => null }

const acceptAllGoogleTokens: GoogleIdTokenVerifier = {
  verify: async () => ({ email: 'yuki@example.com' }),
}
const rejectAllGoogleTokens: GoogleIdTokenVerifier = { verify: async () => null }

const allowAllRateLimiter: RateLimiter = { consume: async () => true }
const denyAllRateLimiter: RateLimiter = { consume: async () => false }

// Busy by default so unrelated tests never trigger a cleanup sweep as a side effect.
const busyCleanupLock: CleanupLock = { tryAcquire: async () => false, release: async () => {} }

const allowAllTurnstile: TurnstileVerifier = { verify: async () => true }
const denyAllTurnstile: TurnstileVerifier = { verify: async () => false }

const fakeSessionTokens: SessionTokenIssuer = {
  create: async (userId) => `session-for-${userId}`,
  verify: async (token) => (token.startsWith('session-for-') ? token.slice(12) : null),
}

const SESSION_VIEW = { id: 't1', senderLabel: 'yuki', expiresAt: Date.now() + 180_000, files: [] }
const FILE_VIEW = { id: 'f1', filename: 'a.pdf', contentType: 'application/pdf', size: 3 }

const makeTransferServiceStub = (overrides: Partial<TransferService> = {}): TransferService => ({
  createTransfer: async () => ({
    id: 't1',
    joinCode: 'AB123456',
    qrSecret: 'a-qr-secret',
    expiresAt: Date.now() + 180_000,
  }),
  addFile: async () => ({ status: 'ok', file: FILE_VIEW }),
  joinByCode: async () => ({ status: 'ok', session: SESSION_VIEW }),
  joinBySecret: async () => ({ status: 'ok', session: SESSION_VIEW }),
  getSession: async () => ({ status: 'ok', session: SESSION_VIEW }),
  getFile: async () => ({ status: 'ok', meta: FILE_VIEW, bytes: new Uint8Array([1, 2, 3]) }),
  extend: async () => ({ status: 'ok', session: SESSION_VIEW }),
  deleteTransfer: async () => ({ transferId: 't1', files: [] }),
  deleteExpiredSessions: async () => [],
  ...overrides,
})

/** No other real route exists yet — mount a throwaway one to exercise the shared middleware chain (auth guard, request logging). */
const createTestApp = (
  guard: AuthGuard,
  enabled: boolean,
  excludePaths: string[] = [],
  excludePathPatterns: AuthPathPatternExclusion[] = [],
) => {
  const app = createApp({
    auth: { guard, enabled, excludePaths, excludePathPatterns },
    googleIdTokens: acceptAllGoogleTokens,
    sessionTokens: fakeSessionTokens,
    transfers: makeTransferServiceStub(),
    rateLimiter: allowAllRateLimiter,
    cleanupLock: busyCleanupLock,
    turnstile: allowAllTurnstile,
  })
  app.get('/test-route', (c) => c.json({ ok: true }))
  return app
}

test('allows requests through when the auth guard is disabled', async () => {
  const app = createTestApp(denyAllGuard, false)

  const res = await app.request('/test-route')

  expect(res.status).toBe(200)
})

test('rejects unauthenticated requests once the auth guard is enabled', async () => {
  const app = createTestApp(denyAllGuard, true)

  const res = await app.request('/test-route')

  expect(res.status).toBe(401)
})

test('allows authenticated requests once the auth guard is enabled', async () => {
  const app = createTestApp(allowAllGuard, true)

  const res = await app.request('/test-route', { headers: { authorization: 'token' } })

  expect(res.status).toBe(200)
})

test('keeps excluded paths free access even when the auth guard is enabled', async () => {
  const app = createTestApp(denyAllGuard, true, ['/test-route'])

  const res = await app.request('/test-route')

  expect(res.status).toBe(200)
})

test('logs a matching started/completed pair, including for a rejected request', async () => {
  const info = vi.spyOn(console, 'info').mockImplementation(() => {})
  const app = createTestApp(denyAllGuard, true)

  const res = await app.request('/test-route')
  expect(res.status).toBe(401)

  expect(info).toHaveBeenCalledTimes(2)
  const [startedLine] = info.mock.calls[0] as [string]
  const [completedLine] = info.mock.calls[1] as [string]
  const started = JSON.parse(startedLine)
  const completed = JSON.parse(completedLine)

  expect(started).toMatchObject({
    message: 'request started',
    method: 'GET',
    path: '/test-route',
  })
  expect(completed).toMatchObject({
    message: 'request completed',
    method: 'GET',
    path: '/test-route',
    user: 'anonymous',
    status: 401,
  })
  expect(completed.requestId).toBe(started.requestId)
  expect(typeof completed.durationMs).toBe('number')

  info.mockRestore()
})

test('POST /api/auth/google issues a session token for a valid Google ID token', async () => {
  const app = createApp({
    auth: { guard: denyAllGuard, enabled: false, excludePaths: [], excludePathPatterns: [] },
    googleIdTokens: acceptAllGoogleTokens,
    sessionTokens: fakeSessionTokens,
    transfers: makeTransferServiceStub(),
    rateLimiter: allowAllRateLimiter,
    cleanupLock: busyCleanupLock,
    turnstile: allowAllTurnstile,
  })

  const res = await app.request('/api/auth/google', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ idToken: 'a-valid-google-id-token' }),
  })

  expect(res.status).toBe(200)
  expect(await res.json()).toEqual({ token: 'session-for-yuki@example.com' })
})

test('POST /api/auth/google logs the signed-in user and attributes the request to them', async () => {
  const info = vi.spyOn(console, 'info').mockImplementation(() => {})
  const app = createApp({
    auth: { guard: denyAllGuard, enabled: false, excludePaths: [], excludePathPatterns: [] },
    googleIdTokens: acceptAllGoogleTokens,
    sessionTokens: fakeSessionTokens,
    transfers: makeTransferServiceStub(),
    rateLimiter: allowAllRateLimiter,
    cleanupLock: busyCleanupLock,
    turnstile: allowAllTurnstile,
  })

  await app.request('/api/auth/google', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ idToken: 'a-valid-google-id-token' }),
  })

  const logs = info.mock.calls.map(([line]) => JSON.parse(line as string))
  expect(logs).toContainEqual(
    expect.objectContaining({ message: 'user signed in', user: 'yuki@example.com' }),
  )
  expect(logs.find((entry) => entry.message === 'request completed')).toMatchObject({
    user: 'yuki@example.com',
  })

  info.mockRestore()
})

test('POST /api/auth/google rejects an invalid Google ID token', async () => {
  const app = createApp({
    auth: { guard: denyAllGuard, enabled: false, excludePaths: [], excludePathPatterns: [] },
    googleIdTokens: rejectAllGoogleTokens,
    sessionTokens: fakeSessionTokens,
    transfers: makeTransferServiceStub(),
    rateLimiter: allowAllRateLimiter,
    cleanupLock: busyCleanupLock,
    turnstile: allowAllTurnstile,
  })

  const res = await app.request('/api/auth/google', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ idToken: 'not-actually-a-google-token' }),
  })

  expect(res.status).toBe(401)
})

test('POST /api/auth/google rejects a request with no idToken', async () => {
  const app = createApp({
    auth: { guard: denyAllGuard, enabled: false, excludePaths: [], excludePathPatterns: [] },
    googleIdTokens: acceptAllGoogleTokens,
    sessionTokens: fakeSessionTokens,
    transfers: makeTransferServiceStub(),
    rateLimiter: allowAllRateLimiter,
    cleanupLock: busyCleanupLock,
    turnstile: allowAllTurnstile,
  })

  const res = await app.request('/api/auth/google', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
  })

  expect(res.status).toBe(400)
})

test('POST /api/auth/google stays reachable even when the auth guard is enabled and it is not excluded', async () => {
  const app = createApp({
    auth: { guard: denyAllGuard, enabled: true, excludePaths: [], excludePathPatterns: [] },
    googleIdTokens: acceptAllGoogleTokens,
    sessionTokens: fakeSessionTokens,
    transfers: makeTransferServiceStub(),
    rateLimiter: allowAllRateLimiter,
    cleanupLock: busyCleanupLock,
    turnstile: allowAllTurnstile,
  })

  const res = await app.request('/api/auth/google', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ idToken: 'a-valid-google-id-token' }),
  })

  expect(res.status).toBe(200)
})

const appWithTransfers = (
  overrides: Partial<TransferService> = {},
  rateLimiter: RateLimiter = allowAllRateLimiter,
  cleanupLock: CleanupLock = busyCleanupLock,
  turnstile: TurnstileVerifier = allowAllTurnstile,
) =>
  createApp({
    auth: { guard: denyAllGuard, enabled: false, excludePaths: [], excludePathPatterns: [] },
    googleIdTokens: acceptAllGoogleTokens,
    sessionTokens: fakeSessionTokens,
    transfers: makeTransferServiceStub(overrides),
    rateLimiter,
    cleanupLock,
    turnstile,
  })

test('runs the expired-session sweep when it wins the cleanup lease', async () => {
  const deleteExpiredSessions = vi.fn(async () => [])
  const acquiringCleanupLock: CleanupLock = { tryAcquire: async () => true, release: vi.fn() }
  const app = appWithTransfers({ deleteExpiredSessions }, allowAllRateLimiter, acquiringCleanupLock)

  await app.request('/api/transfers/t1')

  expect(deleteExpiredSessions).toHaveBeenCalledTimes(1)
  expect(acquiringCleanupLock.release).toHaveBeenCalledTimes(1)
})

test('logs each session the expired-session sweep deletes', async () => {
  const info = vi.spyOn(console, 'info').mockImplementation(() => {})
  const deleteExpiredSessions = vi.fn(async () => [
    {
      transferId: 'expired-1',
      files: [{ id: 'f1', filename: 'a.pdf', contentType: 'x', size: 1 }],
    },
  ])
  const acquiringCleanupLock: CleanupLock = {
    tryAcquire: async () => true,
    release: async () => {},
  }
  const app = appWithTransfers({ deleteExpiredSessions }, allowAllRateLimiter, acquiringCleanupLock)

  await app.request('/api/transfers/t1')

  const deletedLog = info.mock.calls
    .map(([line]) => JSON.parse(line as string))
    .find((entry) => entry.message === 'transfer session deleted')
  expect(deletedLog).toMatchObject({
    transferId: 'expired-1',
    reason: 'expired',
    user: 'system',
    files: [{ id: 'f1', filename: 'a.pdf' }],
  })

  info.mockRestore()
})

test('skips the sweep when the cleanup lease is already held', async () => {
  const deleteExpiredSessions = vi.fn(async () => [])
  const app = appWithTransfers({ deleteExpiredSessions }, allowAllRateLimiter, busyCleanupLock)

  await app.request('/api/transfers/t1')

  expect(deleteExpiredSessions).not.toHaveBeenCalled()
})

test('POST /api/client-id issues an opaque client id', async () => {
  const app = appWithTransfers()

  const res = await app.request('/api/client-id', { method: 'POST' })

  expect(res.status).toBe(200)
  const { clientId } = (await res.json()) as { clientId: string }
  expect(typeof clientId).toBe('string')
  expect(clientId.length).toBeGreaterThan(0)
})

test('POST /api/client-id returns 429 once its own per-IP issue limit is exceeded', async () => {
  const app = appWithTransfers({}, denyAllRateLimiter)

  const res = await app.request('/api/client-id', { method: 'POST' })

  expect(res.status).toBe(429)
})

test('POST /api/transfers creates a session and returns its one-time code/secret', async () => {
  const app = appWithTransfers()

  const res = await app.request('/api/transfers', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ senderLabel: 'yuki' }),
  })

  expect(res.status).toBe(201)
  expect(await res.json()).toMatchObject({
    id: 't1',
    joinCode: 'AB123456',
    qrSecret: 'a-qr-secret',
  })
})

test('POST /api/transfers rejects with 403 when Turnstile verification fails', async () => {
  const app = appWithTransfers({}, allowAllRateLimiter, busyCleanupLock, denyAllTurnstile)

  const res = await app.request('/api/transfers', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ senderLabel: 'yuki', turnstileToken: 'a-token' }),
  })

  expect(res.status).toBe(403)
})

test('POST /api/transfers/:id/files stores an uploaded file', async () => {
  const app = appWithTransfers()
  const form = new FormData()
  form.append('file', new File(['abc'], 'a.pdf', { type: 'application/pdf' }))

  const res = await app.request('/api/transfers/t1/files', { method: 'POST', body: form })

  expect(res.status).toBe(201)
  expect(await res.json()).toEqual(FILE_VIEW)
})

test('POST /api/transfers/:id/files logs who uploaded which file, including the client id', async () => {
  const info = vi.spyOn(console, 'info').mockImplementation(() => {})
  const app = appWithTransfers()
  const form = new FormData()
  form.append('file', new File(['abc'], 'a.pdf', { type: 'application/pdf' }))

  await app.request('/api/transfers/t1/files', {
    method: 'POST',
    body: form,
    headers: { 'x-client-id': 'client-1' },
  })

  const logs = info.mock.calls.map(([line]) => JSON.parse(line as string))
  expect(logs).toContainEqual(
    expect.objectContaining({
      message: 'file uploaded',
      transferId: 't1',
      fileId: FILE_VIEW.id,
      filename: FILE_VIEW.filename,
      user: 'anonymous',
      clientId: 'client-1',
    }),
  )

  info.mockRestore()
})

test('POST /api/transfers/:id/files rejects a request with no file field', async () => {
  const app = appWithTransfers()

  const res = await app.request('/api/transfers/t1/files', { method: 'POST', body: new FormData() })

  expect(res.status).toBe(400)
})

test('POST /api/transfers/:id/files translates expired to 410 Gone', async () => {
  const app = appWithTransfers({ addFile: async () => ({ status: 'expired' }) })
  const form = new FormData()
  form.append('file', new File(['abc'], 'a.pdf'))

  const res = await app.request('/api/transfers/t1/files', { method: 'POST', body: form })

  expect(res.status).toBe(410)
})

test('POST /api/transfers/:id/files translates an over-limit file to 400 with a reason', async () => {
  const app = appWithTransfers({
    addFile: async () => ({ status: 'limit_exceeded', reason: 'too big' }),
  })
  const form = new FormData()
  form.append('file', new File(['abc'], 'a.pdf'))

  const res = await app.request('/api/transfers/t1/files', { method: 'POST', body: form })

  expect(res.status).toBe(400)
  expect(await res.json()).toMatchObject({ reason: 'too big' })
})

test('POST /api/transfers/join joins by one-time code', async () => {
  const app = appWithTransfers()

  const res = await app.request('/api/transfers/join', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-client-id': 'client-1' },
    body: JSON.stringify({ code: 'AB123456' }),
  })

  expect(res.status).toBe(200)
  expect(await res.json()).toEqual(SESSION_VIEW)
})

test('POST /api/transfers/join logs which client id joined which transfer', async () => {
  const info = vi.spyOn(console, 'info').mockImplementation(() => {})
  const app = appWithTransfers()

  await app.request('/api/transfers/join', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-client-id': 'client-1' },
    body: JSON.stringify({ code: 'AB123456' }),
  })

  const logs = info.mock.calls.map(([line]) => JSON.parse(line as string))
  expect(logs).toContainEqual(
    expect.objectContaining({
      message: 'transfer joined',
      transferId: SESSION_VIEW.id,
      method: 'code',
      clientId: 'client-1',
    }),
  )

  info.mockRestore()
})

test('POST /api/transfers/join rejects a request with no code', async () => {
  const app = appWithTransfers()

  const res = await app.request('/api/transfers/join', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-client-id': 'client-1' },
    body: JSON.stringify({}),
  })

  expect(res.status).toBe(400)
})

test('POST /api/transfers/join translates an unknown code to 404', async () => {
  const app = appWithTransfers({ joinByCode: async () => ({ status: 'not_found' }) })

  const res = await app.request('/api/transfers/join', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-client-id': 'client-1' },
    body: JSON.stringify({ code: 'ZZ999999' }),
  })

  expect(res.status).toBe(404)
})

test('POST /api/transfers/join rejects a request with no X-Client-Id header', async () => {
  const app = appWithTransfers()

  const res = await app.request('/api/transfers/join', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code: 'AB123456' }),
  })

  expect(res.status).toBe(400)
})

test('POST /api/transfers/join returns 429 once the (IP, client id) rate limit is exceeded', async () => {
  const app = appWithTransfers({}, denyAllRateLimiter)

  const res = await app.request('/api/transfers/join', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-client-id': 'client-1' },
    body: JSON.stringify({ code: 'AB123456' }),
  })

  expect(res.status).toBe(429)
})

test('GET /api/transfers/join/:secret joins via the QR secret', async () => {
  const app = appWithTransfers()

  const res = await app.request('/api/transfers/join/a-qr-secret')

  expect(res.status).toBe(200)
  expect(await res.json()).toEqual(SESSION_VIEW)
})

test('GET /api/transfers/join/:secret logs which client id joined which transfer', async () => {
  const info = vi.spyOn(console, 'info').mockImplementation(() => {})
  const app = appWithTransfers()

  await app.request('/api/transfers/join/a-qr-secret', { headers: { 'x-client-id': 'client-1' } })

  const logs = info.mock.calls.map(([line]) => JSON.parse(line as string))
  expect(logs).toContainEqual(
    expect.objectContaining({
      message: 'transfer joined',
      transferId: SESSION_VIEW.id,
      method: 'secret',
      clientId: 'client-1',
    }),
  )

  info.mockRestore()
})

test('GET /api/transfers/join/:secret translates an expired session to 410 Gone', async () => {
  const app = appWithTransfers({ joinBySecret: async () => ({ status: 'expired' }) })

  const res = await app.request('/api/transfers/join/an-expired-secret')

  expect(res.status).toBe(410)
})

test('GET /api/transfers/:id returns the session', async () => {
  const app = appWithTransfers()

  const res = await app.request('/api/transfers/t1')

  expect(res.status).toBe(200)
  expect(await res.json()).toEqual(SESSION_VIEW)
})

test('GET /api/transfers/:id/files returns just the file list', async () => {
  const app = appWithTransfers()

  const res = await app.request('/api/transfers/t1/files')

  expect(res.status).toBe(200)
  expect(await res.json()).toEqual({ files: SESSION_VIEW.files })
})

test('GET /api/transfers/:id/files/:fileId/download streams the file body with headers', async () => {
  const app = appWithTransfers()

  const res = await app.request('/api/transfers/t1/files/f1/download')

  expect(res.status).toBe(200)
  expect(res.headers.get('Content-Type')).toBe('application/pdf')
  expect(res.headers.get('Content-Length')).toBe('3')
  expect(res.headers.get('Content-Disposition')).toContain('a.pdf')
  expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]))
})

test('GET /api/transfers/:id/files/:fileId/download logs who downloaded which file, including the client id', async () => {
  const info = vi.spyOn(console, 'info').mockImplementation(() => {})
  const app = appWithTransfers()

  await app.request('/api/transfers/t1/files/f1/download', {
    headers: { 'x-client-id': 'client-1' },
  })

  const logs = info.mock.calls.map(([line]) => JSON.parse(line as string))
  expect(logs).toContainEqual(
    expect.objectContaining({
      message: 'file downloaded',
      transferId: 't1',
      fileId: FILE_VIEW.id,
      filename: FILE_VIEW.filename,
      user: 'anonymous',
      clientId: 'client-1',
    }),
  )

  info.mockRestore()
})

test('GET /api/transfers/:id/files/:fileId/download logs "unknown" when no client id is sent', async () => {
  const info = vi.spyOn(console, 'info').mockImplementation(() => {})
  const app = appWithTransfers()

  await app.request('/api/transfers/t1/files/f1/download')

  const logs = info.mock.calls.map(([line]) => JSON.parse(line as string))
  expect(logs).toContainEqual(
    expect.objectContaining({ message: 'file downloaded', clientId: 'unknown' }),
  )

  info.mockRestore()
})

test('GET /api/transfers/:id/files/:fileId/download translates not_found to 404', async () => {
  const app = appWithTransfers({ getFile: async () => ({ status: 'not_found' }) })

  const res = await app.request('/api/transfers/t1/files/missing/download')

  expect(res.status).toBe(404)
})

test('POST /api/transfers/:id/extend resets the expiry', async () => {
  const app = appWithTransfers()

  const res = await app.request('/api/transfers/t1/extend', { method: 'POST' })

  expect(res.status).toBe(200)
  expect(await res.json()).toEqual(SESSION_VIEW)
})

test('DELETE /api/transfers/:id deletes immediately', async () => {
  const app = appWithTransfers()

  const res = await app.request('/api/transfers/t1', { method: 'DELETE' })

  expect(res.status).toBe(204)
})

test('DELETE /api/transfers/:id logs which files were deleted and when', async () => {
  const info = vi.spyOn(console, 'info').mockImplementation(() => {})
  const app = appWithTransfers({
    deleteTransfer: async () => ({ transferId: 't1', files: [FILE_VIEW] }),
  })

  await app.request('/api/transfers/t1', {
    method: 'DELETE',
    headers: { 'x-client-id': 'client-1' },
  })

  const logs = info.mock.calls.map(([line]) => JSON.parse(line as string))
  const deletedLog = logs.find((entry) => entry.message === 'transfer session deleted')
  expect(deletedLog).toMatchObject({
    transferId: 't1',
    reason: 'explicit',
    user: 'anonymous',
    clientId: 'client-1',
    files: [{ id: FILE_VIEW.id, filename: FILE_VIEW.filename }],
  })
  expect(typeof deletedLog.timestamp).toBe('string')

  info.mockRestore()
})

test('Transfer routes are not exempt from the auth guard once it is enabled', async () => {
  const app = createApp({
    auth: { guard: denyAllGuard, enabled: true, excludePaths: [], excludePathPatterns: [] },
    googleIdTokens: acceptAllGoogleTokens,
    sessionTokens: fakeSessionTokens,
    transfers: makeTransferServiceStub(),
    rateLimiter: allowAllRateLimiter,
    cleanupLock: busyCleanupLock,
    turnstile: allowAllTurnstile,
  })

  const res = await app.request('/api/transfers', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ senderLabel: 'yuki' }),
  })

  expect(res.status).toBe(401)
})

test('a path-pattern exclusion only exempts the matching method, not every method on that path', async () => {
  const app = createTestApp(denyAllGuard, true, [], [{ method: 'GET', pattern: /^\/test-route$/ }])
  app.post('/test-route', (c) => c.json({ ok: true }))

  const excluded = await app.request('/test-route')
  const stillProtected = await app.request('/test-route', { method: 'POST' })

  expect(excluded.status).toBe(200)
  expect(stillProtected.status).toBe(401)
})

test('the real AUTH_EXCLUDE_PATHS/AUTH_EXCLUDE_PATH_PATTERNS keep Uploader routes protected and Downloader routes public', async () => {
  const app = createApp({
    auth: {
      guard: denyAllGuard,
      enabled: true,
      excludePaths: AUTH_EXCLUDE_PATHS,
      excludePathPatterns: AUTH_EXCLUDE_PATH_PATTERNS,
    },
    googleIdTokens: acceptAllGoogleTokens,
    sessionTokens: fakeSessionTokens,
    transfers: makeTransferServiceStub(),
    rateLimiter: allowAllRateLimiter,
    cleanupLock: busyCleanupLock,
    turnstile: allowAllTurnstile,
  })

  const protectedRequests = [
    () =>
      app.request('/api/transfers', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      }),
    () => app.request('/api/transfers/t1/files', { method: 'POST', body: new FormData() }),
    () => app.request('/api/transfers/t1/extend', { method: 'POST' }),
    () => app.request('/api/transfers/t1', { method: 'DELETE' }),
  ]
  for (const request of protectedRequests) {
    expect((await request()).status).toBe(401)
  }

  const publicRequests = [
    () => app.request('/api/client-id', { method: 'POST' }),
    () =>
      app.request('/api/transfers/join', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-client-id': 'c1' },
        body: JSON.stringify({ code: 'AB123456' }),
      }),
    () => app.request('/api/transfers/join/a-secret'),
    () => app.request('/api/transfers/t1'),
    () => app.request('/api/transfers/t1/files'),
    () => app.request('/api/transfers/t1/files/f1/download'),
  ]
  for (const request of publicRequests) {
    expect((await request()).status).not.toBe(401)
  }
})
