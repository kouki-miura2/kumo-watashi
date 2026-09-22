import { expect, test } from 'vite-plus/test'

import type { TransferDao, TransferSessionRecord } from '../dao/transfer.interface.ts'
import { createTransferRepository } from './transfer.repository.ts'

/** Single-record fake: real hashing happens inside the repository, so a lookup by hash need only
 * compare against whatever `create`/`addFile`/`extend` last stored — no need to reimplement the
 * real memory DAO's multi-record storage here. */
const makeFakeDao = () => {
  let stored: TransferSessionRecord | null = null
  const dao: TransferDao = {
    create: async (record) => {
      stored = record
    },
    findById: async (id) => (stored?.id === id ? stored : null),
    findByJoinCodeHash: async (hash) => (stored?.joinCodeHash === hash ? stored : null),
    findBySecretHash: async (hash) => (stored?.secretHash === hash ? stored : null),
    addFile: async (transferId, file) => {
      if (stored?.id !== transferId) return null
      stored.files.push(file)
      return stored
    },
    updateExpiresAt: async (id, expiresAt) => {
      if (stored?.id !== id) return null
      stored.expiresAt = expiresAt
      return stored
    },
    delete: async (id) => {
      if (stored?.id === id) stored = null
    },
  }
  return { dao, getStored: () => stored }
}

const CREATE_INPUT = { senderLabel: 'yuki', joinCode: 'K7M429Q8', qrSecret: 'a-256-bit-secret' }

test('creates a session with a generated id and no plaintext secret in storage', async () => {
  const { dao, getStored } = makeFakeDao()
  const repository = createTransferRepository(dao)

  const session = await repository.create({ ...CREATE_INPUT, ttlMs: 180_000 })

  expect(session.id).toEqual(expect.any(String))
  expect(session.senderLabel).toBe('yuki')
  expect(session.expiresAt).toBe(session.createdAt + 180_000)
  expect(session.files).toEqual([])

  const record = getStored()
  expect(record?.joinCodeHash).not.toBe(CREATE_INPUT.joinCode)
  expect(record?.secretHash).not.toBe(CREATE_INPUT.qrSecret)
  expect(record?.joinCodeHash).toHaveLength(64)
})

test('finds a session by its plaintext join code', async () => {
  const { dao } = makeFakeDao()
  const repository = createTransferRepository(dao)
  const created = await repository.create({ ...CREATE_INPUT, ttlMs: 180_000 })

  const found = await repository.findByJoinCode('K7M429Q8')

  expect(found?.id).toBe(created.id)
})

test('does not find a session for the wrong join code', async () => {
  const { dao } = makeFakeDao()
  const repository = createTransferRepository(dao)
  await repository.create({ ...CREATE_INPUT, ttlMs: 180_000 })

  expect(await repository.findByJoinCode('WRONGCOD')).toBeNull()
})

test('finds a session by its plaintext QR secret', async () => {
  const { dao } = makeFakeDao()
  const repository = createTransferRepository(dao)
  const created = await repository.create({ ...CREATE_INPUT, ttlMs: 180_000 })

  const found = await repository.findByQrSecret('a-256-bit-secret')

  expect(found?.id).toBe(created.id)
})

test('does not find a session for the wrong QR secret', async () => {
  const { dao } = makeFakeDao()
  const repository = createTransferRepository(dao)
  await repository.create({ ...CREATE_INPUT, ttlMs: 180_000 })

  expect(await repository.findByQrSecret('wrong-secret')).toBeNull()
})

test('returns null for an unknown id', async () => {
  const { dao } = makeFakeDao()
  const repository = createTransferRepository(dao)

  expect(await repository.findById('missing')).toBeNull()
})

test('appends a file and returns it in the session', async () => {
  const { dao } = makeFakeDao()
  const repository = createTransferRepository(dao)
  const created = await repository.create({ ...CREATE_INPUT, ttlMs: 180_000 })

  const updated = await repository.addFile(created.id, {
    id: 'file-1',
    filename: 'a.pdf',
    contentType: 'application/pdf',
    size: 100,
  })

  expect(updated?.files).toEqual([
    { id: 'file-1', filename: 'a.pdf', contentType: 'application/pdf', size: 100 },
  ])
})

test('returns null when adding a file to an unknown transfer', async () => {
  const { dao } = makeFakeDao()
  const repository = createTransferRepository(dao)

  const result = await repository.addFile('missing', {
    id: 'file-1',
    filename: 'a.pdf',
    contentType: 'application/pdf',
    size: 100,
  })

  expect(result).toBeNull()
})

test('extends a session’s expiry', async () => {
  const { dao } = makeFakeDao()
  const repository = createTransferRepository(dao)
  const created = await repository.create({ ...CREATE_INPUT, ttlMs: 180_000 })

  const updated = await repository.extend(created.id, created.expiresAt + 180_000)

  expect(updated?.expiresAt).toBe(created.expiresAt + 180_000)
})

test('deletes a session so it can no longer be found', async () => {
  const { dao } = makeFakeDao()
  const repository = createTransferRepository(dao)
  const created = await repository.create({ ...CREATE_INPUT, ttlMs: 180_000 })

  await repository.delete(created.id)

  expect(await repository.findById(created.id)).toBeNull()
})
