import { expect, test } from 'vite-plus/test'

import type { FileBlobStore } from '../repository/file-blob-store.interface.ts'
import type {
  CreateTransferInput,
  TransferRepository,
  TransferSession,
} from '../repository/transfer.repository.ts'
import { createTransferService } from './transfer.service.ts'

type FakeSession = TransferSession & { joinCode: string; qrSecret: string }

/** Plaintext-keyed fake — the service normalizes/generates codes, the repository's own hashing is
 * covered by transfer.repository.test.ts, so this fake just needs plaintext equality. */
const makeFakeRepository = () => {
  const sessions = new Map<string, FakeSession>()
  let nextId = 1

  const repository: TransferRepository = {
    create: async (input: CreateTransferInput) => {
      const now = Date.now()
      const session: FakeSession = {
        id: `session-${nextId++}`,
        senderLabel: input.senderLabel,
        createdAt: now,
        expiresAt: now + input.ttlMs,
        files: [],
        joinCode: input.joinCode,
        qrSecret: input.qrSecret,
      }
      sessions.set(session.id, session)
      return session
    },
    findById: async (id) => sessions.get(id) ?? null,
    findByJoinCode: async (joinCode) =>
      [...sessions.values()].find((s) => s.joinCode === joinCode) ?? null,
    findByQrSecret: async (qrSecret) =>
      [...sessions.values()].find((s) => s.qrSecret === qrSecret) ?? null,
    addFile: async (transferId, file) => {
      const session = sessions.get(transferId)
      if (!session) return null
      session.files.push(file)
      return session
    },
    extend: async (id, expiresAt) => {
      const session = sessions.get(id)
      if (!session) return null
      session.expiresAt = expiresAt
      return session
    },
    delete: async (id) => {
      sessions.delete(id)
    },
    findExpiredIds: async (nowMs) =>
      [...sessions.values()].filter((s) => s.expiresAt <= nowMs).map((s) => s.id),
  }

  return { repository, sessions }
}

const makeFakeBlobStore = (): { blobStore: FileBlobStore; blobs: Map<string, Uint8Array> } => {
  const blobs = new Map<string, Uint8Array>()
  return {
    blobs,
    blobStore: {
      put: async (key, bytes) => {
        blobs.set(key, bytes)
      },
      get: async (key) => blobs.get(key) ?? null,
      delete: async (key) => {
        blobs.delete(key)
      },
    },
  }
}

const FILE = {
  filename: 'a.pdf',
  contentType: 'application/pdf',
  size: 100,
  bytes: new Uint8Array([1]),
}

test('creates a transfer with a well-formed join code and QR secret', async () => {
  const { repository } = makeFakeRepository()
  const { blobStore } = makeFakeBlobStore()
  const service = createTransferService(repository, blobStore)

  const result = await service.createTransfer('yuki')

  // docs/spec.md section 14 — both pools exclude characters easily confused with each other.
  expect(result.joinCode).toMatch(/^[ACDEFHJKLMNPQRTUVWXY3479]{8}$/)
  expect(result.joinCode.split('').filter((c) => /[A-Z]/.test(c))).toHaveLength(4)
  expect(result.joinCode.split('').filter((c) => /[0-9]/.test(c))).toHaveLength(4)
  expect(result.qrSecret).toMatch(/^[0-9a-f]{64}$/)
  expect(result.id).toEqual(expect.any(String))
})

test("the join code's four letters land at random positions, not always the first four", async () => {
  const { repository } = makeFakeRepository()
  const { blobStore } = makeFakeBlobStore()
  const service = createTransferService(repository, blobStore)

  const codes = await Promise.all(
    Array.from({ length: 50 }, () => service.createTransfer('yuki').then((r) => r.joinCode)),
  )

  // Regression test: letters were previously always generated at positions 0-3. With 50 samples
  // and C(8,4) = 70 equally likely position-sets, this fails by chance with probability (1/70)^49.
  expect(codes.some((code) => !/^[A-Z]{4}/.test(code))).toBe(true)
})

test('adds a file and stores its bytes in the blob store', async () => {
  const { repository } = makeFakeRepository()
  const { blobStore, blobs } = makeFakeBlobStore()
  const service = createTransferService(repository, blobStore)
  const { id } = await service.createTransfer('yuki')

  const result = await service.addFile(id, FILE)

  expect(result).toMatchObject({
    status: 'ok',
    file: { filename: 'a.pdf', contentType: 'application/pdf', size: 100 },
  })
  if (result.status === 'ok') {
    expect(blobs.get(result.file.id)).toEqual(FILE.bytes)
  }
})

test('rejects adding a file to a transfer that does not exist', async () => {
  const { repository } = makeFakeRepository()
  const { blobStore } = makeFakeBlobStore()
  const service = createTransferService(repository, blobStore)

  const result = await service.addFile('missing', FILE)

  expect(result).toEqual({ status: 'not_found' })
})

test('rejects adding a file once the transfer has expired', async () => {
  const { repository, sessions } = makeFakeRepository()
  const { blobStore } = makeFakeBlobStore()
  const service = createTransferService(repository, blobStore)
  const { id } = await service.createTransfer('yuki')
  sessions.get(id)!.expiresAt = Date.now() - 1

  const result = await service.addFile(id, FILE)

  expect(result).toEqual({ status: 'expired' })
})

test('rejects a file over the per-file size limit', async () => {
  const { repository } = makeFakeRepository()
  const { blobStore } = makeFakeBlobStore()
  const service = createTransferService(repository, blobStore)
  const { id } = await service.createTransfer('yuki')

  const result = await service.addFile(id, { ...FILE, size: 200 * 1024 * 1024 })

  expect(result.status).toBe('limit_exceeded')
})

test('rejects a file once the transfer already has the maximum file count', async () => {
  const { repository } = makeFakeRepository()
  const { blobStore } = makeFakeBlobStore()
  const service = createTransferService(repository, blobStore)
  const { id } = await service.createTransfer('yuki')
  for (let i = 0; i < 5; i++) {
    const added = await service.addFile(id, { ...FILE, filename: `f${i}.pdf` })
    expect(added.status).toBe('ok')
  }

  const result = await service.addFile(id, FILE)

  expect(result.status).toBe('limit_exceeded')
})

test('rejects a file that would push the transfer over the total size limit', async () => {
  const { repository } = makeFakeRepository()
  const { blobStore } = makeFakeBlobStore()
  const service = createTransferService(repository, blobStore)
  const { id } = await service.createTransfer('yuki')
  await service.addFile(id, { ...FILE, size: 400 * 1024 * 1024 })

  const result = await service.addFile(id, { ...FILE, size: 200 * 1024 * 1024 })

  expect(result.status).toBe('limit_exceeded')
})

test('joins by join code, ignoring hyphens and case', async () => {
  const { repository } = makeFakeRepository()
  const { blobStore } = makeFakeBlobStore()
  const service = createTransferService(repository, blobStore)
  const created = await service.createTransfer('yuki')
  const hyphenated = `${created.joinCode.slice(0, 4)}-${created.joinCode.slice(4)}`.toLowerCase()

  const result = await service.joinByCode(hyphenated)

  expect(result).toEqual({
    status: 'ok',
    session: { id: created.id, senderLabel: 'yuki', expiresAt: created.expiresAt, files: [] },
  })
})

test('rejects an unknown join code', async () => {
  const { repository } = makeFakeRepository()
  const { blobStore } = makeFakeBlobStore()
  const service = createTransferService(repository, blobStore)

  expect(await service.joinByCode('AA000000')).toEqual({ status: 'not_found' })
})

test('joins by QR secret', async () => {
  const { repository } = makeFakeRepository()
  const { blobStore } = makeFakeBlobStore()
  const service = createTransferService(repository, blobStore)
  const created = await service.createTransfer('yuki')

  const result = await service.joinBySecret(created.qrSecret)

  expect(result).toMatchObject({ status: 'ok', session: { id: created.id } })
})

test('reports expired for a session past its TTL', async () => {
  const { repository, sessions } = makeFakeRepository()
  const { blobStore } = makeFakeBlobStore()
  const service = createTransferService(repository, blobStore)
  const created = await service.createTransfer('yuki')
  sessions.get(created.id)!.expiresAt = Date.now() - 1

  expect(await service.joinByCode(created.joinCode)).toEqual({ status: 'expired' })
  expect(await service.getSession(created.id)).toEqual({ status: 'expired' })
})

test('returns file bytes and metadata together', async () => {
  const { repository } = makeFakeRepository()
  const { blobStore } = makeFakeBlobStore()
  const service = createTransferService(repository, blobStore)
  const { id } = await service.createTransfer('yuki')
  const added = await service.addFile(id, FILE)
  if (added.status !== 'ok') throw new Error('setup failed')

  const result = await service.getFile(id, added.file.id)

  expect(result).toEqual({ status: 'ok', meta: added.file, bytes: FILE.bytes })
})

test('reports not_found for an unknown file id', async () => {
  const { repository } = makeFakeRepository()
  const { blobStore } = makeFakeBlobStore()
  const service = createTransferService(repository, blobStore)
  const { id } = await service.createTransfer('yuki')

  expect(await service.getFile(id, 'missing')).toEqual({ status: 'not_found' })
})

test('extend pushes the expiry forward from now', async () => {
  const { repository } = makeFakeRepository()
  const { blobStore } = makeFakeBlobStore()
  const service = createTransferService(repository, blobStore)
  const { id } = await service.createTransfer('yuki')

  const result = await service.extend(id)

  expect(result.status).toBe('ok')
  if (result.status === 'ok') {
    expect(result.session.expiresAt).toBeGreaterThan(Date.now())
  }
})

test('cannot extend an already-expired session', async () => {
  const { repository, sessions } = makeFakeRepository()
  const { blobStore } = makeFakeBlobStore()
  const service = createTransferService(repository, blobStore)
  const { id } = await service.createTransfer('yuki')
  sessions.get(id)!.expiresAt = Date.now() - 1

  expect(await service.extend(id)).toEqual({ status: 'expired' })
})

test('deleting a transfer removes its files from the blob store too, and reports what was deleted', async () => {
  const { repository } = makeFakeRepository()
  const { blobStore, blobs } = makeFakeBlobStore()
  const service = createTransferService(repository, blobStore)
  const { id } = await service.createTransfer('yuki')
  const added = await service.addFile(id, FILE)
  if (added.status !== 'ok') throw new Error('setup failed')

  const deleted = await service.deleteTransfer(id)

  expect(await service.getSession(id)).toEqual({ status: 'not_found' })
  expect(blobs.has(added.file.id)).toBe(false)
  expect(deleted).toEqual({ transferId: id, files: [added.file] })
})

test('deleting an unknown transfer reports no files deleted', async () => {
  const { repository } = makeFakeRepository()
  const { blobStore } = makeFakeBlobStore()
  const service = createTransferService(repository, blobStore)

  expect(await service.deleteTransfer('missing')).toEqual({ transferId: 'missing', files: [] })
})

test('deleteExpiredSessions physically removes only sessions past their TTL', async () => {
  const { repository, sessions } = makeFakeRepository()
  const { blobStore, blobs } = makeFakeBlobStore()
  const service = createTransferService(repository, blobStore)
  const expired = await service.createTransfer('yuki')
  const active = await service.createTransfer('yuki')
  const addedToExpired = await service.addFile(expired.id, FILE)
  if (addedToExpired.status !== 'ok') throw new Error('setup failed')
  sessions.get(expired.id)!.expiresAt = Date.now() - 1

  const deleted = await service.deleteExpiredSessions()

  expect(deleted).toEqual([{ transferId: expired.id, files: [addedToExpired.file] }])
  expect(await service.getSession(expired.id)).toEqual({ status: 'not_found' })
  expect(blobs.has(addedToExpired.file.id)).toBe(false)
  expect(await service.getSession(active.id)).toMatchObject({ status: 'ok' })
})

test('deleteExpiredSessions is a no-op when nothing has expired', async () => {
  const { repository } = makeFakeRepository()
  const { blobStore } = makeFakeBlobStore()
  const service = createTransferService(repository, blobStore)
  await service.createTransfer('yuki')

  expect(await service.deleteExpiredSessions()).toEqual([])
})
