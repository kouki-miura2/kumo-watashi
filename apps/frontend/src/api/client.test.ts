import { expect, test } from 'vite-plus/test'

import { apiClient } from './client.ts'

test('exposes a typed RPC method for each backend route', () => {
  expect(apiClient.sample[':id'].$get).toBeTypeOf('function')
})
