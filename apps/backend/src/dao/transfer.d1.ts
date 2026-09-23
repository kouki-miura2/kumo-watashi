import type {
  TransferDao,
  TransferFileRecord,
  TransferSessionRecord,
} from './transfer.interface.ts'

interface SessionRow {
  id: string
  join_code_hash: string
  secret_hash: string
  sender_label: string
  created_at: number
  expires_at: number
}

interface FileRow {
  id: string
  transfer_id: string
  filename: string
  content_type: string
  size: number
}

const toFileRecord = (row: FileRow): TransferFileRecord => ({
  id: row.id,
  filename: row.filename,
  contentType: row.content_type,
  size: row.size,
})

/** Cloudflare D1 implementation (docs/spec.md section 23) — metadata only, durable across
 * isolates unlike `transfer.memory.ts`. File bodies live separately in R2, see
 * `repository/file-blob-store.r2.ts`. */
export const createTransferDao = (db: D1Database): TransferDao => {
  const loadFiles = async (transferId: string): Promise<TransferFileRecord[]> => {
    const { results } = await db
      .prepare(
        'SELECT id, transfer_id, filename, content_type, size FROM transfer_files WHERE transfer_id = ?',
      )
      .bind(transferId)
      .all<FileRow>()
    return results.map(toFileRecord)
  }

  const loadSession = async (row: SessionRow | null): Promise<TransferSessionRecord | null> => {
    if (!row) return null
    return {
      id: row.id,
      joinCodeHash: row.join_code_hash,
      secretHash: row.secret_hash,
      senderLabel: row.sender_label,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      files: await loadFiles(row.id),
    }
  }

  return {
    create: async (record) => {
      await db
        .prepare(
          `INSERT INTO transfer_sessions (id, join_code_hash, secret_hash, sender_label, created_at, expires_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          record.id,
          record.joinCodeHash,
          record.secretHash,
          record.senderLabel,
          record.createdAt,
          record.expiresAt,
        )
        .run()
    },

    findById: async (id) => {
      const row = await db
        .prepare('SELECT * FROM transfer_sessions WHERE id = ?')
        .bind(id)
        .first<SessionRow>()
      return loadSession(row)
    },

    findByJoinCodeHash: async (joinCodeHash) => {
      const row = await db
        .prepare('SELECT * FROM transfer_sessions WHERE join_code_hash = ?')
        .bind(joinCodeHash)
        .first<SessionRow>()
      return loadSession(row)
    },

    findBySecretHash: async (secretHash) => {
      const row = await db
        .prepare('SELECT * FROM transfer_sessions WHERE secret_hash = ?')
        .bind(secretHash)
        .first<SessionRow>()
      return loadSession(row)
    },

    addFile: async (transferId, file) => {
      const session = await db
        .prepare('SELECT * FROM transfer_sessions WHERE id = ?')
        .bind(transferId)
        .first<SessionRow>()
      if (!session) return null

      await db
        .prepare(
          `INSERT INTO transfer_files (id, transfer_id, filename, content_type, size, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(file.id, transferId, file.filename, file.contentType, file.size, Date.now())
        .run()

      return loadSession(session)
    },

    updateExpiresAt: async (id, expiresAt) => {
      const result = await db
        .prepare('UPDATE transfer_sessions SET expires_at = ? WHERE id = ?')
        .bind(expiresAt, id)
        .run()
      if (result.meta.changes === 0) return null

      const row = await db
        .prepare('SELECT * FROM transfer_sessions WHERE id = ?')
        .bind(id)
        .first<SessionRow>()
      return loadSession(row)
    },

    delete: async (id) => {
      await db.batch([
        db.prepare('DELETE FROM transfer_files WHERE transfer_id = ?').bind(id),
        db.prepare('DELETE FROM transfer_sessions WHERE id = ?').bind(id),
      ])
    },

    findExpiredIds: async (nowMs) => {
      const { results } = await db
        .prepare('SELECT id FROM transfer_sessions WHERE expires_at <= ?')
        .bind(nowMs)
        .all<{ id: string }>()
      return results.map((row) => row.id)
    },
  }
}
