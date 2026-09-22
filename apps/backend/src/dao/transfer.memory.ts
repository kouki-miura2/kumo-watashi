import type { TransferDao, TransferSessionRecord } from './transfer.interface.ts'

/** Per-isolate in-memory store — resets on restart/isolate recycle, same caveat as the ephemeral
 * session secret in `worker.ts`. Fine for a 3-minute-TTL resource; swap in a `.d1.ts` DAO behind
 * the same interface once cross-isolate durability is needed. */
export const createTransferDao = (): TransferDao => {
  const sessions = new Map<string, TransferSessionRecord>()

  return {
    create: async (record) => {
      sessions.set(record.id, record)
    },
    findById: async (id) => sessions.get(id) ?? null,
    findByJoinCodeHash: async (joinCodeHash) =>
      [...sessions.values()].find((s) => s.joinCodeHash === joinCodeHash) ?? null,
    findBySecretHash: async (secretHash) =>
      [...sessions.values()].find((s) => s.secretHash === secretHash) ?? null,
    addFile: async (transferId, file) => {
      const session = sessions.get(transferId)
      if (!session) return null
      session.files.push(file)
      return session
    },
    updateExpiresAt: async (id, expiresAt) => {
      const session = sessions.get(id)
      if (!session) return null
      session.expiresAt = expiresAt
      return session
    },
    delete: async (id) => {
      sessions.delete(id)
    },
  }
}
