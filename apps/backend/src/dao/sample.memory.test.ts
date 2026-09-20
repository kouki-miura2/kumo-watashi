import { expect, test } from 'vite-plus/test'

import { createSampleDao } from './sample.memory.ts'

test('findById resolves a seeded record', async () => {
  const dao = createSampleDao()

  await expect(dao.findById('1')).resolves.toEqual({
    id: '1',
    label: 'First sample record',
  })
})

test('findById resolves null for an unknown id', async () => {
  const dao = createSampleDao()

  await expect(dao.findById('missing')).resolves.toBeNull()
})
