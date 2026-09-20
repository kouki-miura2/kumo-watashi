import { expect, test } from 'vite-plus/test'

import { createStatusRepository } from './status.memory.ts'

test('createStatusRepository resolves ok', async () => {
  const repository = createStatusRepository()

  await expect(repository.getStatus()).resolves.toEqual({ status: 'ok' })
})
