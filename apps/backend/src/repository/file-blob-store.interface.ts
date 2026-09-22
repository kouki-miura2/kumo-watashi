/** Raw file bytes, keyed by an opaque id — separate from `TransferDao`'s metadata-only records,
 * mirroring docs/spec.md section 22's R2 (file body) / D1 (metadata) split. A leaf abstraction
 * like `SessionTokenIssuer`: no repository/service mapping needed above it, just swappable
 * implementations per runtime (`.memory.ts` now, a `.r2.ts` later). */
export interface FileBlobStore {
  put: (key: string, bytes: Uint8Array) => Promise<void>
  get: (key: string) => Promise<Uint8Array | null>
  delete: (key: string) => Promise<void>
}
