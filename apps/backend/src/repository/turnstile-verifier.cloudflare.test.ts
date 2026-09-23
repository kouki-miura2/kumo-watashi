import { expect, test, vi } from 'vite-plus/test'

import { createTurnstileVerifier } from './turnstile-verifier.cloudflare.ts'

const mockFetch = (body: unknown, ok = true) =>
  vi.fn(
    async (..._args: Parameters<typeof fetch>) =>
      new Response(JSON.stringify(body), { status: ok ? 200 : 500 }),
  )

test('accepts a token that siteverify reports as successful for the expected action', async () => {
  vi.stubGlobal(
    'fetch',
    mockFetch({ success: true, action: 'create_transfer', hostname: 'example.com' }),
  )
  const verifier = createTurnstileVerifier('secret', ['example.com'])

  expect(await verifier.verify('a-token', '203.0.113.5')).toBe(true)

  vi.unstubAllGlobals()
})

test('sends the token, secret, and remote ip to siteverify', async () => {
  const fetchMock = mockFetch({ success: true, action: 'create_transfer', hostname: 'example.com' })
  vi.stubGlobal('fetch', fetchMock)
  const verifier = createTurnstileVerifier('the-secret', [])

  await verifier.verify('the-token', '203.0.113.5')

  expect(fetchMock).toHaveBeenCalledTimes(1)
  const [url, init] = fetchMock.mock.calls[0]!
  expect(url).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify')
  const body = new URLSearchParams(init!.body as string)
  expect(body.get('secret')).toBe('the-secret')
  expect(body.get('response')).toBe('the-token')
  expect(body.get('remoteip')).toBe('203.0.113.5')

  vi.unstubAllGlobals()
})

test('rejects when siteverify reports failure', async () => {
  vi.stubGlobal('fetch', mockFetch({ success: false }))
  const verifier = createTurnstileVerifier('secret', [])

  expect(await verifier.verify('a-token', undefined)).toBe(false)

  vi.unstubAllGlobals()
})

test('rejects a token solved for a different action', async () => {
  vi.stubGlobal(
    'fetch',
    mockFetch({ success: true, action: 'some-other-action', hostname: 'example.com' }),
  )
  const verifier = createTurnstileVerifier('secret', [])

  expect(await verifier.verify('a-token', undefined)).toBe(false)

  vi.unstubAllGlobals()
})

test('rejects a hostname outside the expected list when one is configured', async () => {
  vi.stubGlobal(
    'fetch',
    mockFetch({ success: true, action: 'create_transfer', hostname: 'attacker.example' }),
  )
  const verifier = createTurnstileVerifier('secret', ['example.com'])

  expect(await verifier.verify('a-token', undefined)).toBe(false)

  vi.unstubAllGlobals()
})

test('skips the hostname check when no expected hostnames are configured', async () => {
  vi.stubGlobal(
    'fetch',
    mockFetch({ success: true, action: 'create_transfer', hostname: 'anything.example' }),
  )
  const verifier = createTurnstileVerifier('secret', [])

  expect(await verifier.verify('a-token', undefined)).toBe(true)

  vi.unstubAllGlobals()
})

test('rejects an empty token without calling siteverify', async () => {
  const fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  const verifier = createTurnstileVerifier('secret', [])

  expect(await verifier.verify('', undefined)).toBe(false)
  expect(fetchMock).not.toHaveBeenCalled()

  vi.unstubAllGlobals()
})

test('fails closed on a network error', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw new Error('network down')
    }),
  )
  const verifier = createTurnstileVerifier('secret', [])

  expect(await verifier.verify('a-token', undefined)).toBe(false)

  vi.unstubAllGlobals()
})

test('fails closed on a non-2xx upstream response', async () => {
  vi.stubGlobal('fetch', mockFetch({}, false))
  const verifier = createTurnstileVerifier('secret', [])

  expect(await verifier.verify('a-token', undefined)).toBe(false)

  vi.unstubAllGlobals()
})
