import { expect, test } from 'vite-plus/test'

import type { SampleRepository } from '../repository/sample.repository.ts'
import { createSampleService } from './sample.service.ts'

test('getSample builds a response view from the repository entity', async () => {
  const repository: SampleRepository = { findById: async (id) => ({ id, label: 'A label' }) }
  const service = createSampleService(repository)

  await expect(service.getSample('1')).resolves.toEqual({
    id: '1',
    message: 'Sample "A label"',
  })
})

test('getSample resolves null when the repository finds nothing', async () => {
  const repository: SampleRepository = { findById: async () => null }
  const service = createSampleService(repository)

  await expect(service.getSample('missing')).resolves.toBeNull()
})
