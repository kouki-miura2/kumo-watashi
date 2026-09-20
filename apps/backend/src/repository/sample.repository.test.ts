import { expect, test } from 'vite-plus/test'

import type { SampleDao } from '../dao/sample.interface.ts'
import { createSampleRepository } from './sample.repository.ts'

test('findById maps a found record to the Sample domain entity', async () => {
  const dao: SampleDao = { findById: async (id) => ({ id, label: 'A label' }) }
  const repository = createSampleRepository(dao)

  await expect(repository.findById('1')).resolves.toEqual({
    id: '1',
    label: 'A label',
  })
})

test('findById resolves null when the dao finds nothing', async () => {
  const dao: SampleDao = { findById: async () => null }
  const repository = createSampleRepository(dao)

  await expect(repository.findById('missing')).resolves.toBeNull()
})
