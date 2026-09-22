import type { FileBlobStore } from './file-blob-store.interface.ts'

/** Per-isolate in-memory blob store — same durability caveat as `dao/transfer.memory.ts`. Swap in
 * a `.r2.ts` implementation behind the same interface once cross-isolate durability is needed. */
export const createFileBlobStore = (): FileBlobStore => {
  const blobs = new Map<string, Uint8Array>()

  return {
    put: async (key, bytes) => {
      blobs.set(key, bytes)
    },
    get: async (key) => blobs.get(key) ?? null,
    delete: async (key) => {
      blobs.delete(key)
    },
  }
}
