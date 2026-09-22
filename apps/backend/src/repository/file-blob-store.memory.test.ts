import { expect, test } from 'vite-plus/test'

import { createFileBlobStore } from './file-blob-store.memory.ts'

test('returns the bytes it was given for a key', async () => {
  const store = createFileBlobStore()
  const bytes = new Uint8Array([1, 2, 3])

  await store.put('a', bytes)

  expect(await store.get('a')).toEqual(bytes)
})

test('returns null for a key that was never put', async () => {
  const store = createFileBlobStore()

  expect(await store.get('missing')).toBeNull()
})

test('removes the bytes for a key so they can no longer be read', async () => {
  const store = createFileBlobStore()
  await store.put('a', new Uint8Array([1]))

  await store.delete('a')

  expect(await store.get('a')).toBeNull()
})
