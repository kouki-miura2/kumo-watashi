import { expect, test, vi } from 'vite-plus/test'

import { createApp } from './app.ts'
import type { AuthGuard } from './repository/auth-guard.interface.ts'
import type { SampleService } from './service/sample.service.ts'

const sampleService: SampleService = {
  getSample: async (id) => (id === '1' ? { id, message: 'Sample "First sample record"' } : null),
}
const allowAllGuard: AuthGuard = { authenticate: async () => ({ id: 'test-user' }) }
const denyAllGuard: AuthGuard = { authenticate: async () => null }

test('GET /sample/:id returns the service response when the auth guard is disabled', async () => {
  const app = createApp({
    sampleService,
    auth: { guard: denyAllGuard, enabled: false, excludePaths: [] },
  })

  const res = await app.request('/sample/1')

  expect(await res.json()).toEqual({ id: '1', message: 'Sample "First sample record"' })
})

test('GET /sample/:id returns 404 for an unknown id', async () => {
  const app = createApp({
    sampleService,
    auth: { guard: denyAllGuard, enabled: false, excludePaths: [] },
  })

  const res = await app.request('/sample/missing')

  expect(res.status).toBe(404)
})

test('rejects unauthenticated requests once the auth guard is enabled', async () => {
  const app = createApp({
    sampleService,
    auth: { guard: denyAllGuard, enabled: true, excludePaths: [] },
  })

  const res = await app.request('/sample/1')

  expect(res.status).toBe(401)
})

test('allows authenticated requests once the auth guard is enabled', async () => {
  const app = createApp({
    sampleService,
    auth: { guard: allowAllGuard, enabled: true, excludePaths: [] },
  })

  const res = await app.request('/sample/1', { headers: { authorization: 'token' } })

  expect(await res.json()).toEqual({ id: '1', message: 'Sample "First sample record"' })
})

test('keeps excluded paths free access even when the auth guard is enabled', async () => {
  const app = createApp({
    sampleService,
    auth: { guard: denyAllGuard, enabled: true, excludePaths: ['/sample/1'] },
  })

  const res = await app.request('/sample/1')

  expect(await res.json()).toEqual({ id: '1', message: 'Sample "First sample record"' })
})

test('logs a matching started/completed pair, including for a rejected request', async () => {
  const info = vi.spyOn(console, 'info').mockImplementation(() => {})
  const app = createApp({
    sampleService,
    auth: { guard: denyAllGuard, enabled: true, excludePaths: [] },
  })

  const res = await app.request('/sample/1')
  expect(res.status).toBe(401)

  expect(info).toHaveBeenCalledTimes(2)
  const [startedLine] = info.mock.calls[0] as [string]
  const [completedLine] = info.mock.calls[1] as [string]
  const started = JSON.parse(startedLine)
  const completed = JSON.parse(completedLine)

  expect(started).toMatchObject({
    message: 'request started',
    method: 'GET',
    path: '/sample/1',
  })
  expect(completed).toMatchObject({
    message: 'request completed',
    method: 'GET',
    path: '/sample/1',
    user: 'anonymous',
    status: 401,
  })
  expect(completed.requestId).toBe(started.requestId)
  expect(typeof completed.durationMs).toBe('number')

  info.mockRestore()
})
