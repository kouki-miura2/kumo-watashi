import type { FileBlobStore } from '../repository/file-blob-store.interface.ts'
import type { TransferRepository, TransferSession } from '../repository/transfer.repository.ts'

// docs/spec.md section 11
const MAX_FILES = 20
const MAX_FILE_SIZE = 100 * 1024 * 1024
const MAX_TOTAL_SIZE = 500 * 1024 * 1024

// docs/spec.md section 5 — fixed 3-minute lifetime, no extension beyond calling `extend` again.
const TRANSFER_TTL_MS = 3 * 60 * 1000

// docs/spec.md section 14 — candidate charset avoiding characters easily confused with digits.
const JOIN_CODE_LETTERS = 'ABCDEFGHJKMNPQRSTUVWXYZ'
const JOIN_CODE_DIGITS = '0123456789'

const randomChars = (chars: string, length: number): string =>
  Array.from(crypto.getRandomValues(new Uint32Array(length)), (n) => chars[n % chars.length]).join(
    '',
  )

/** docs/spec.md section 13.1 — 2 letters + 6 digits, e.g. `K7M429Q8`. */
const generateJoinCode = (): string =>
  randomChars(JOIN_CODE_LETTERS, 2) + randomChars(JOIN_CODE_DIGITS, 6)

/** docs/spec.md section 12 — 256-bit random secret embedded in the QR's URL. */
const generateQrSecret = (): string =>
  Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('')

/** docs/spec.md section 13.1 — hyphens and case are display-only; normalize before lookup. */
const normalizeJoinCode = (code: string): string => code.replace(/[^A-Za-z0-9]/g, '').toUpperCase()

export interface TransferFileView {
  id: string
  filename: string
  contentType: string
  size: number
}

export interface TransferSessionView {
  id: string
  senderLabel: string
  expiresAt: number
  files: TransferFileView[]
}

export interface CreateTransferResult {
  id: string
  /** Plaintext — returned once, at creation, for the Uploader to display. Never retrievable again. */
  joinCode: string
  /** Plaintext — returned once, at creation, for the Uploader's QR code. Never retrievable again. */
  qrSecret: string
  expiresAt: number
}

export interface AddFileInput {
  filename: string
  contentType: string
  size: number
  bytes: Uint8Array
}

export type TransferLookupResult =
  | { status: 'ok'; session: TransferSessionView }
  | { status: 'not_found' }
  | { status: 'expired' }

export type AddFileResult =
  | { status: 'ok'; file: TransferFileView }
  | { status: 'not_found' }
  | { status: 'expired' }
  | { status: 'limit_exceeded'; reason: string }

export type GetFileResult =
  | { status: 'ok'; meta: TransferFileView; bytes: Uint8Array }
  | { status: 'not_found' }
  | { status: 'expired' }

export interface TransferService {
  /** Uploader only — creates a session and returns its one-time join code/QR secret. */
  createTransfer: (senderLabel: string) => Promise<CreateTransferResult>
  /** Uploader only — stores one file's bytes against an existing, unexpired session. */
  addFile: (transferId: string, file: AddFileInput) => Promise<AddFileResult>
  /** Downloader only — join via the human-typed one-time code. */
  joinByCode: (code: string) => Promise<TransferLookupResult>
  /** Downloader only — join via the QR's embedded secret. */
  joinBySecret: (secret: string) => Promise<TransferLookupResult>
  getSession: (id: string) => Promise<TransferLookupResult>
  getFile: (transferId: string, fileId: string) => Promise<GetFileResult>
  /** Uploader only — resets the 3-minute TTL from now. */
  extend: (id: string) => Promise<TransferLookupResult>
  deleteTransfer: (id: string) => Promise<void>
}

const isExpired = (session: TransferSession): boolean => session.expiresAt <= Date.now()

const toView = (session: TransferSession): TransferSessionView => ({
  id: session.id,
  senderLabel: session.senderLabel,
  expiresAt: session.expiresAt,
  files: session.files,
})

const toLookupResult = (session: TransferSession | null): TransferLookupResult => {
  if (!session) return { status: 'not_found' }
  if (isExpired(session)) return { status: 'expired' }
  return { status: 'ok', session: toView(session) }
}

/** Business logic and orchestration for Transfer Sessions (docs/spec.md section 4) — the only
 * layer that decides "not found" / "expired" / "over limit", never an HTTP status. */
export const createTransferService = (
  repository: TransferRepository,
  blobStore: FileBlobStore,
): TransferService => ({
  createTransfer: async (senderLabel) => {
    const joinCode = generateJoinCode()
    const qrSecret = generateQrSecret()
    const session = await repository.create({
      senderLabel,
      joinCode,
      qrSecret,
      ttlMs: TRANSFER_TTL_MS,
    })
    return { id: session.id, joinCode, qrSecret, expiresAt: session.expiresAt }
  },

  addFile: async (transferId, file) => {
    const session = await repository.findById(transferId)
    if (!session) return { status: 'not_found' }
    if (isExpired(session)) return { status: 'expired' }
    if (session.files.length >= MAX_FILES) {
      return { status: 'limit_exceeded', reason: `1回の転送は最大${MAX_FILES}ファイルまでです` }
    }
    if (file.size > MAX_FILE_SIZE) {
      return {
        status: 'limit_exceeded',
        reason: `1ファイルは最大${MAX_FILE_SIZE / (1024 * 1024)}MBまでです`,
      }
    }
    const currentTotal = session.files.reduce((sum, f) => sum + f.size, 0)
    if (currentTotal + file.size > MAX_TOTAL_SIZE) {
      return {
        status: 'limit_exceeded',
        reason: `合計サイズは最大${MAX_TOTAL_SIZE / (1024 * 1024)}MBまでです`,
      }
    }

    const fileId = crypto.randomUUID()
    await blobStore.put(fileId, file.bytes)
    const updated = await repository.addFile(transferId, {
      id: fileId,
      filename: file.filename,
      contentType: file.contentType,
      size: file.size,
    })
    if (!updated) return { status: 'not_found' }
    return {
      status: 'ok',
      file: { id: fileId, filename: file.filename, contentType: file.contentType, size: file.size },
    }
  },

  joinByCode: async (code) =>
    toLookupResult(await repository.findByJoinCode(normalizeJoinCode(code))),
  joinBySecret: async (secret) => toLookupResult(await repository.findByQrSecret(secret)),
  getSession: async (id) => toLookupResult(await repository.findById(id)),

  getFile: async (transferId, fileId) => {
    const session = await repository.findById(transferId)
    if (!session) return { status: 'not_found' }
    if (isExpired(session)) return { status: 'expired' }
    const meta = session.files.find((f) => f.id === fileId)
    if (!meta) return { status: 'not_found' }
    const bytes = await blobStore.get(fileId)
    if (!bytes) return { status: 'not_found' }
    return { status: 'ok', meta, bytes }
  },

  extend: async (id) => {
    const session = await repository.findById(id)
    if (!session) return { status: 'not_found' }
    if (isExpired(session)) return { status: 'expired' }
    return toLookupResult(await repository.extend(id, Date.now() + TRANSFER_TTL_MS))
  },

  deleteTransfer: async (id) => {
    const session = await repository.findById(id)
    if (session) await Promise.all(session.files.map((f) => blobStore.delete(f.id)))
    await repository.delete(id)
  },
})
