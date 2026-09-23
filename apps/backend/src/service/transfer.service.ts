import type { FileBlobStore } from '../repository/file-blob-store.interface.ts'
import type { TransferRepository, TransferSession } from '../repository/transfer.repository.ts'

// docs/spec.md section 11
const MAX_FILES = 5
const MAX_FILE_SIZE = 100 * 1024 * 1024
const MAX_TOTAL_SIZE = 500 * 1024 * 1024

// docs/spec.md section 5 — fixed 1-minute lifetime, no extension beyond calling `extend` again.
const TRANSFER_TTL_MS = 1 * 60 * 1000

// docs/spec.md section 14 — characters excluded from both pools because they're easily confused
// with one another: I/1, O/0, S/5, B/8, G/6, Z/2.
const JOIN_CODE_LETTERS = 'ACDEFHJKLMNPQRTUVWXY'
const JOIN_CODE_DIGITS = '3479'
const JOIN_CODE_LENGTH = 8
const JOIN_CODE_LETTER_COUNT = 4

const randomChars = (chars: string, length: number): string =>
  Array.from(crypto.getRandomValues(new Uint32Array(length)), (n) => chars[n % chars.length]).join(
    '',
  )

/** Fisher-Yates using `crypto.getRandomValues`, not `Math.random` — used to pick which positions
 * in the join code are letters, so guessing the code can't lean on "letters are always first". */
const shuffledIndices = (length: number): number[] => {
  const indices = Array.from({ length }, (_, i) => i)
  const randomness = crypto.getRandomValues(new Uint32Array(length))
  for (let i = indices.length - 1; i > 0; i--) {
    const j = randomness[i]! % (i + 1)
    ;[indices[i], indices[j]] = [indices[j]!, indices[i]!]
  }
  return indices
}

/** docs/spec.md section 13.1 — 8 characters, `JOIN_CODE_LETTER_COUNT` of them letters at random
 * positions (not fixed at the front) and the rest digits, e.g. `4A7TR3C9`. */
const generateJoinCode = (): string => {
  const letterPositions = new Set(
    shuffledIndices(JOIN_CODE_LENGTH).slice(0, JOIN_CODE_LETTER_COUNT),
  )
  return Array.from({ length: JOIN_CODE_LENGTH }, (_, i) =>
    letterPositions.has(i) ? randomChars(JOIN_CODE_LETTERS, 1) : randomChars(JOIN_CODE_DIGITS, 1),
  ).join('')
}

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
  /** Uploader only — resets the 1-minute TTL from now. */
  extend: (id: string) => Promise<TransferLookupResult>
  /** Returns the files that were deleted alongside the session (empty if the session didn't
   * exist), so callers can log exactly what was removed. */
  deleteTransfer: (id: string) => Promise<DeletedTransfer>
  /** docs/spec.md section 5.1 — physically deletes every session whose TTL has already passed
   * (D1 rows + R2 objects), run opportunistically from `app.ts`'s cleanup-lock middleware rather
   * than a Cron Trigger. Returns one entry per session deleted, for audit logging. */
  deleteExpiredSessions: () => Promise<DeletedTransfer[]>
}

export interface DeletedTransfer {
  transferId: string
  files: TransferFileView[]
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
): TransferService => {
  const deleteById = async (id: string): Promise<DeletedTransfer> => {
    const session = await repository.findById(id)
    const files = session?.files ?? []
    if (session) await Promise.all(files.map((f) => blobStore.delete(f.id)))
    await repository.delete(id)
    return { transferId: id, files }
  }

  return {
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
        file: {
          id: fileId,
          filename: file.filename,
          contentType: file.contentType,
          size: file.size,
        },
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

    deleteTransfer: deleteById,

    deleteExpiredSessions: async () => {
      const ids = await repository.findExpiredIds(Date.now())
      return Promise.all(ids.map(deleteById))
    },
  }
}
