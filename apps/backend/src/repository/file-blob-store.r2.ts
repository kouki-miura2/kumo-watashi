import type { FileBlobStore } from './file-blob-store.interface.ts'

/** Cloudflare R2 implementation (docs/spec.md section 22/23) — durable across isolates, unlike
 * `file-blob-store.memory.ts`. Objects are keyed by the file id alone; no bucket prefix needed
 * since ids are already globally unique (`crypto.randomUUID()`). */
export const createFileBlobStore = (bucket: R2Bucket): FileBlobStore => ({
  put: async (key, bytes) => {
    await bucket.put(key, bytes)
  },
  get: async (key) => {
    const object = await bucket.get(key)
    if (!object) return null
    return new Uint8Array(await object.arrayBuffer())
  },
  delete: async (key) => {
    await bucket.delete(key)
  },
})
