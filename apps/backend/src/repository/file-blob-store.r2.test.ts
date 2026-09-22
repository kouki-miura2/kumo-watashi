import { expect, test } from 'vite-plus/test'

import { createFileBlobStore } from './file-blob-store.r2.ts'

const makeFakeBucket = () => {
  const objects = new Map<string, Uint8Array>()
  const bucket: Partial<R2Bucket> = {
    put: async (key, value) => {
      const bytes = value instanceof Uint8Array ? value : new Uint8Array(value as ArrayBuffer)
      objects.set(key, bytes)
      return null as unknown as R2Object
    },
    get: async (key) => {
      const bytes = objects.get(key)
      if (!bytes) return null
      return { arrayBuffer: async () => bytes.buffer } as unknown as R2ObjectBody
    },
    delete: async (keys) => {
      for (const key of Array.isArray(keys) ? keys : [keys]) objects.delete(key)
    },
  }
  return bucket as R2Bucket
}

test('returns the bytes it was given for a key', async () => {
  const store = createFileBlobStore(makeFakeBucket())

  await store.put('a', new Uint8Array([1, 2, 3]))

  expect(await store.get('a')).toEqual(new Uint8Array([1, 2, 3]))
})

test('returns null for a key that was never put', async () => {
  const store = createFileBlobStore(makeFakeBucket())

  expect(await store.get('missing')).toBeNull()
})

test('removes the bytes for a key so they can no longer be read', async () => {
  const store = createFileBlobStore(makeFakeBucket())
  await store.put('a', new Uint8Array([1]))

  await store.delete('a')

  expect(await store.get('a')).toBeNull()
})
