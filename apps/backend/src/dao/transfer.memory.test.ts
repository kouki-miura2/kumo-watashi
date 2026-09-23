import { expect, test } from 'vite-plus/test'

import type { TransferSessionRecord } from './transfer.interface.ts'
import { createTransferDao } from './transfer.memory.ts'

const makeRecord = (overrides: Partial<TransferSessionRecord> = {}): TransferSessionRecord => ({
  id: 'transfer-1',
  joinCodeHash: 'join-hash',
  secretHash: 'secret-hash',
  senderLabel: 'yuki',
  createdAt: 0,
  expiresAt: 180_000,
  files: [],
  ...overrides,
})

test('finds a created session by id', async () => {
  const dao = createTransferDao()
  await dao.create(makeRecord())

  const found = await dao.findById('transfer-1')

  expect(found).toMatchObject({ id: 'transfer-1', senderLabel: 'yuki' })
})

test('returns null for an unknown id', async () => {
  const dao = createTransferDao()

  expect(await dao.findById('missing')).toBeNull()
})

test('finds a session by its join code hash', async () => {
  const dao = createTransferDao()
  await dao.create(makeRecord({ joinCodeHash: 'the-join-hash' }))

  const found = await dao.findByJoinCodeHash('the-join-hash')

  expect(found?.id).toBe('transfer-1')
})

test('finds a session by its secret hash', async () => {
  const dao = createTransferDao()
  await dao.create(makeRecord({ secretHash: 'the-secret-hash' }))

  const found = await dao.findBySecretHash('the-secret-hash')

  expect(found?.id).toBe('transfer-1')
})

test('appends a file to an existing session', async () => {
  const dao = createTransferDao()
  await dao.create(makeRecord())

  const updated = await dao.addFile('transfer-1', {
    id: 'file-1',
    filename: 'a.pdf',
    contentType: 'application/pdf',
    size: 100,
  })

  expect(updated?.files).toEqual([
    { id: 'file-1', filename: 'a.pdf', contentType: 'application/pdf', size: 100 },
  ])
})

test('returns null when adding a file to a session that does not exist', async () => {
  const dao = createTransferDao()

  const result = await dao.addFile('missing', {
    id: 'file-1',
    filename: 'a.pdf',
    contentType: 'application/pdf',
    size: 100,
  })

  expect(result).toBeNull()
})

test('updates expiresAt for an existing session', async () => {
  const dao = createTransferDao()
  await dao.create(makeRecord({ expiresAt: 1000 }))

  const updated = await dao.updateExpiresAt('transfer-1', 2000)

  expect(updated?.expiresAt).toBe(2000)
  expect((await dao.findById('transfer-1'))?.expiresAt).toBe(2000)
})

test('returns null when extending a session that does not exist', async () => {
  const dao = createTransferDao()

  expect(await dao.updateExpiresAt('missing', 2000)).toBeNull()
})

test('removes a session so it can no longer be found', async () => {
  const dao = createTransferDao()
  await dao.create(makeRecord())

  await dao.delete('transfer-1')

  expect(await dao.findById('transfer-1')).toBeNull()
})

test('finds only the sessions whose expiresAt has already passed', async () => {
  const dao = createTransferDao()
  await dao.create(makeRecord({ id: 'expired-1', expiresAt: 1000 }))
  await dao.create(makeRecord({ id: 'still-active', expiresAt: 5000 }))

  const expired = await dao.findExpiredIds(2000)

  expect(expired).toEqual(['expired-1'])
})
