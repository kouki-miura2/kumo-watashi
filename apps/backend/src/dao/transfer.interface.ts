export interface TransferFileRecord {
  id: string
  filename: string
  contentType: string
  size: number
}

export interface TransferSessionRecord {
  id: string
  /** SHA-256 hex of the human-typed join code — see docs/spec.md section 16. */
  joinCodeHash: string
  /** SHA-256 hex of the QR's 256-bit secret — see docs/spec.md section 16. */
  secretHash: string
  senderLabel: string
  createdAt: number
  expiresAt: number
  files: TransferFileRecord[]
}

export interface TransferDao {
  create: (record: TransferSessionRecord) => Promise<void>
  findById: (id: string) => Promise<TransferSessionRecord | null>
  findByJoinCodeHash: (joinCodeHash: string) => Promise<TransferSessionRecord | null>
  findBySecretHash: (secretHash: string) => Promise<TransferSessionRecord | null>
  addFile: (transferId: string, file: TransferFileRecord) => Promise<TransferSessionRecord | null>
  updateExpiresAt: (id: string, expiresAt: number) => Promise<TransferSessionRecord | null>
  delete: (id: string) => Promise<void>
}
