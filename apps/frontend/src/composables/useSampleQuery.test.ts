import { QueryClient } from '@tanstack/vue-query'
import { afterEach, expect, test, vi } from 'vite-plus/test'
import { effectScope } from 'vue'

vi.mock('../api/client.ts', () => ({
  apiClient: { sample: { ':id': { $get: vi.fn() } } },
}))

import { apiClient } from '../api/client.ts'
import { useSampleQuery } from './useSampleQuery.ts'

type SampleResponse = Awaited<ReturnType<(typeof apiClient.sample)[':id']['$get']>>

const mockedGet = vi.mocked(apiClient.sample[':id'].$get)

/** Runs the composable inside its own effect scope, mirroring the lifetime it'd have in a component. */
const runSampleQuery = (id: string) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const scope = effectScope()
  const query = scope.run(() => useSampleQuery(id, queryClient))
  if (!query) throw new Error('effectScope.run returned undefined')
  return { query, dispose: () => scope.stop() }
}

afterEach(() => {
  vi.restoreAllMocks()
})

test('resolves the sample response from the API client', async () => {
  mockedGet.mockResolvedValue({
    ok: true,
    json: async () => ({ id: '1', message: 'Sample "A label"' }),
  } as unknown as SampleResponse)

  const { query, dispose } = runSampleQuery('1')

  await vi.waitFor(() => expect(query.isSuccess.value).toBe(true))
  expect(query.data.value).toEqual({ id: '1', message: 'Sample "A label"' })
  expect(mockedGet).toHaveBeenCalledWith({ param: { id: '1' } })

  dispose()
})

test('surfaces a non-ok response as an error', async () => {
  mockedGet.mockResolvedValue({ ok: false, status: 404 } as unknown as SampleResponse)

  const { query, dispose } = runSampleQuery('missing')

  await vi.waitFor(() => expect(query.isError.value).toBe(true))
  expect(query.error.value?.message).toBe('Request failed: 404')

  dispose()
})
