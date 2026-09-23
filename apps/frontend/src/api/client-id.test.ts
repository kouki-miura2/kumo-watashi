import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test'

/** `getClientId` caches its result both in a module-level variable and in `localStorage`, so each
 * test resets the module (fresh in-memory cache) and stubs a throwaway `localStorage`/`fetch`
 * pair rather than sharing state across tests. */
const makeStorage = (): Storage => {
  const data = new Map<string, string>()
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value)
    },
    removeItem: (key) => {
      data.delete(key)
    },
    clear: () => data.clear(),
    key: () => null,
    get length() {
      return data.size
    },
  }
}

beforeEach(() => {
  vi.resetModules()
  vi.stubGlobal('localStorage', makeStorage())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

test('mints a client id via POST /api/client-id when none is cached', async () => {
  const fetchMock = vi.fn(
    async () => new Response(JSON.stringify({ clientId: 'abc123' }), { status: 200 }),
  )
  vi.stubGlobal('fetch', fetchMock)
  const { getClientId } = await import('./client-id.ts')

  const clientId = await getClientId('http://localhost:8787')

  expect(clientId).toBe('abc123')
  expect(fetchMock).toHaveBeenCalledWith('http://localhost:8787/api/client-id', { method: 'POST' })
})

test('reuses the in-memory cache without calling fetch again', async () => {
  const fetchMock = vi.fn(
    async () => new Response(JSON.stringify({ clientId: 'abc123' }), { status: 200 }),
  )
  vi.stubGlobal('fetch', fetchMock)
  const { getClientId } = await import('./client-id.ts')

  await getClientId('http://localhost:8787')
  await getClientId('http://localhost:8787')

  expect(fetchMock).toHaveBeenCalledTimes(1)
})

test('reuses a value already in localStorage instead of minting a new one', async () => {
  localStorage.setItem('kumo-watashi:client-id', 'from-storage')
  const fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  const { getClientId } = await import('./client-id.ts')

  const clientId = await getClientId('http://localhost:8787')

  expect(clientId).toBe('from-storage')
  expect(fetchMock).not.toHaveBeenCalled()
})

test('persists a freshly minted id to localStorage', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ clientId: 'new-id' }), { status: 200 })),
  )
  const { getClientId } = await import('./client-id.ts')

  await getClientId('http://localhost:8787')

  expect(localStorage.getItem('kumo-watashi:client-id')).toBe('new-id')
})

test('throws when the server rejects the mint request', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(null, { status: 429 })),
  )
  const { getClientId } = await import('./client-id.ts')

  await expect(getClientId('http://localhost:8787')).rejects.toThrow()
})
