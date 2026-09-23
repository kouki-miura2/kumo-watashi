import type { TransferDao, TransferSessionRecord } from '../dao/transfer.interface.ts'

export interface TransferFileMeta {
  id: string
  filename: string
  contentType: string
  size: number
}

export interface TransferSession {
  id: string
  senderLabel: string
  createdAt: number
  expiresAt: number
  files: TransferFileMeta[]
}

export interface CreateTransferInput {
  senderLabel: string
  /** Plaintext one-time code, e.g. `4A7T93C9` — hashed before it ever reaches the DAO. */
  joinCode: string
  /** Plaintext QR secret — hashed before it ever reaches the DAO. */
  qrSecret: string
  ttlMs: number
}

export interface TransferRepository {
  create: (input: CreateTransferInput) => Promise<TransferSession>
  findById: (id: string) => Promise<TransferSession | null>
  findByJoinCode: (joinCode: string) => Promise<TransferSession | null>
  findByQrSecret: (qrSecret: string) => Promise<TransferSession | null>
  addFile: (transferId: string, file: TransferFileMeta) => Promise<TransferSession | null>
  extend: (id: string, expiresAt: number) => Promise<TransferSession | null>
  delete: (id: string) => Promise<void>
  findExpiredIds: (nowMs: number) => Promise<string[]>
}

const sha256Hex = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

const toDomain = (record: TransferSessionRecord): TransferSession => ({
  id: record.id,
  senderLabel: record.senderLabel,
  createdAt: record.createdAt,
  expiresAt: record.expiresAt,
  files: record.files,
})

/** Maps between the DAO's raw, hash-only storage shape and the domain `TransferSession` — the
 * only layer that knows a join code/secret needs hashing before it reaches storage (see
 * docs/spec.md section 16). */
export const createTransferRepository = (dao: TransferDao): TransferRepository => ({
  create: async (input) => {
    const now = Date.now()
    const record: TransferSessionRecord = {
      id: crypto.randomUUID(),
      joinCodeHash: await sha256Hex(input.joinCode),
      secretHash: await sha256Hex(input.qrSecret),
      senderLabel: input.senderLabel,
      createdAt: now,
      expiresAt: now + input.ttlMs,
      files: [],
    }
    await dao.create(record)
    return toDomain(record)
  },
  findById: async (id) => {
    const record = await dao.findById(id)
    return record && toDomain(record)
  },
  findByJoinCode: async (joinCode) => {
    const record = await dao.findByJoinCodeHash(await sha256Hex(joinCode))
    return record && toDomain(record)
  },
  findByQrSecret: async (qrSecret) => {
    const record = await dao.findBySecretHash(await sha256Hex(qrSecret))
    return record && toDomain(record)
  },
  addFile: async (transferId, file) => {
    const record = await dao.addFile(transferId, file)
    return record && toDomain(record)
  },
  extend: async (id, expiresAt) => {
    const record = await dao.updateExpiresAt(id, expiresAt)
    return record && toDomain(record)
  },
  delete: (id) => dao.delete(id),
  findExpiredIds: (nowMs) => dao.findExpiredIds(nowMs),
})
