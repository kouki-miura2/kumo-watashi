import { expect, test, vi } from 'vite-plus/test'

import { apiClient } from './client.ts'

test('exposes a typed RPC method for each backend route', () => {
  expect(apiClient.sample[':id'].$get).toBeTypeOf('function')
})

test('sends requests with an abort signal so they time out', async () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'))

  await apiClient.sample[':id'].$get({ param: { id: '1' } })

  expect(fetchSpy).toHaveBeenCalledTimes(1)
  const [, init] = fetchSpy.mock.calls[0] as [RequestInfo, RequestInit]
  expect(init.signal).toBeInstanceOf(AbortSignal)

  fetchSpy.mockRestore()
})
