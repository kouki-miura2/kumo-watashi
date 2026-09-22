import type { QueryClient } from '@tanstack/vue-query'
import { useQuery } from '@tanstack/vue-query'
import type { MaybeRefOrGetter } from 'vue'
import { toValue } from 'vue'

import { apiClient } from '../api/client.ts'

/** `queryClient` is only needed in tests, to run the query outside of a mounted app. */
export const useSampleQuery = (id: MaybeRefOrGetter<string>, queryClient?: QueryClient) =>
  useQuery(
    {
      queryKey: ['sample', id],
      queryFn: async () => {
        const res = await apiClient.sample[':id'].$get({ param: { id: toValue(id) } })
        if (!res.ok) throw new Error(`Request failed: ${res.status}`)
        return res.json()
      },
      staleTime: 10_000,
    },
    queryClient,
  )
