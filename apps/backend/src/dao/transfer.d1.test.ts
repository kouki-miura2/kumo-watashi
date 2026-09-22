import { expect, test } from 'vite-plus/test'

import { createTransferDao } from './transfer.d1.ts'

interface FakeSessionRow {
  id: string
  join_code_hash: string
  secret_hash: string
  sender_label: string
  created_at: number
  expires_at: number
}

interface FakeFileRow {
  id: string
  transfer_id: string
  filename: string
  content_type: string
  size: number
  created_at: number
}

/** A tiny in-memory stand-in for the two tables `dao/transfer.d1.ts` queries, dispatching on the
 * SQL text of each `prepare()` call. This exercises the DAO's actual query/bind/row-mapping logic
 * against something D1-shaped, without needing a real D1 instance (Miniflare/`wrangler d1`) in
 * the test suite. */
const makeFakeD1 = () => {
  const sessions: FakeSessionRow[] = []
  const files: FakeFileRow[] = []

  const makeStatement = (sql: string) => {
    let args: unknown[] = []
    const statement = {
      bind: (...values: unknown[]) => {
        args = values
        return statement
      },
      first: async <T>(): Promise<T | null> => {
        if (sql.includes('FROM transfer_sessions WHERE id = ?')) {
          return (sessions.find((s) => s.id === args[0]) ?? null) as T | null
        }
        if (sql.includes('WHERE join_code_hash = ?')) {
          return (sessions.find((s) => s.join_code_hash === args[0]) ?? null) as T | null
        }
        if (sql.includes('WHERE secret_hash = ?')) {
          return (sessions.find((s) => s.secret_hash === args[0]) ?? null) as T | null
        }
        throw new Error(`fake D1: unhandled first() query: ${sql}`)
      },
      run: async <T>() => {
        if (sql.startsWith('INSERT INTO transfer_sessions')) {
          sessions.push({
            id: args[0] as string,
            join_code_hash: args[1] as string,
            secret_hash: args[2] as string,
            sender_label: args[3] as string,
            created_at: args[4] as number,
            expires_at: args[5] as number,
          })
          return { success: true, meta: { changes: 1 } } as unknown as D1Result<T>
        }
        if (sql.startsWith('INSERT INTO transfer_files')) {
          files.push({
            id: args[0] as string,
            transfer_id: args[1] as string,
            filename: args[2] as string,
            content_type: args[3] as string,
            size: args[4] as number,
            created_at: args[5] as number,
          })
          return { success: true, meta: { changes: 1 } } as unknown as D1Result<T>
        }
        if (sql.startsWith('UPDATE transfer_sessions SET expires_at')) {
          const session = sessions.find((s) => s.id === args[1])
          if (session) session.expires_at = args[0] as number
          return { success: true, meta: { changes: session ? 1 : 0 } } as unknown as D1Result<T>
        }
        if (sql.startsWith('DELETE FROM transfer_files')) {
          const before = files.length
          for (let i = files.length - 1; i >= 0; i--) {
            if (files[i].transfer_id === args[0]) files.splice(i, 1)
          }
          return {
            success: true,
            meta: { changes: before - files.length },
          } as unknown as D1Result<T>
        }
        if (sql.startsWith('DELETE FROM transfer_sessions')) {
          const index = sessions.findIndex((s) => s.id === args[0])
          if (index >= 0) sessions.splice(index, 1)
          return { success: true, meta: { changes: index >= 0 ? 1 : 0 } } as unknown as D1Result<T>
        }
        throw new Error(`fake D1: unhandled run() query: ${sql}`)
      },
      all: async <T>() => {
        if (sql.includes('FROM transfer_files WHERE transfer_id = ?')) {
          const rows = files.filter((f) => f.transfer_id === args[0])
          return { success: true, meta: {}, results: rows } as unknown as D1Result<T>
        }
        throw new Error(`fake D1: unhandled all() query: ${sql}`)
      },
      raw: async () => {
        throw new Error('not implemented')
      },
    }
    return statement as unknown as D1PreparedStatement
  }

  const db = {
    prepare: (sql: string) => makeStatement(sql),
    batch: async (statements: D1PreparedStatement[]) => Promise.all(statements.map((s) => s.run())),
    exec: async () => {
      throw new Error('not implemented')
    },
    withSession: () => {
      throw new Error('not implemented')
    },
    dump: async () => new ArrayBuffer(0),
  }

  return { db: db as unknown as D1Database, sessions, files }
}

const RECORD = {
  id: 'transfer-1',
  joinCodeHash: 'join-hash',
  secretHash: 'secret-hash',
  senderLabel: 'yuki',
  createdAt: 0,
  expiresAt: 180_000,
  files: [],
}

test('finds a created session by id', async () => {
  const { db } = makeFakeD1()
  const dao = createTransferDao(db)
  await dao.create(RECORD)

  const found = await dao.findById('transfer-1')

  expect(found).toMatchObject({ id: 'transfer-1', senderLabel: 'yuki', files: [] })
})

test('returns null for an unknown id', async () => {
  const dao = createTransferDao(makeFakeD1().db)

  expect(await dao.findById('missing')).toBeNull()
})

test('finds a session by its join code hash', async () => {
  const { db } = makeFakeD1()
  const dao = createTransferDao(db)
  await dao.create({ ...RECORD, joinCodeHash: 'the-join-hash' })

  const found = await dao.findByJoinCodeHash('the-join-hash')

  expect(found?.id).toBe('transfer-1')
})

test('finds a session by its secret hash', async () => {
  const { db } = makeFakeD1()
  const dao = createTransferDao(db)
  await dao.create({ ...RECORD, secretHash: 'the-secret-hash' })

  const found = await dao.findBySecretHash('the-secret-hash')

  expect(found?.id).toBe('transfer-1')
})

test('appends a file to an existing session', async () => {
  const { db } = makeFakeD1()
  const dao = createTransferDao(db)
  await dao.create(RECORD)

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
  const dao = createTransferDao(makeFakeD1().db)

  const result = await dao.addFile('missing', {
    id: 'file-1',
    filename: 'a.pdf',
    contentType: 'application/pdf',
    size: 100,
  })

  expect(result).toBeNull()
})

test('updates expiresAt for an existing session', async () => {
  const { db } = makeFakeD1()
  const dao = createTransferDao(db)
  await dao.create({ ...RECORD, expiresAt: 1000 })

  const updated = await dao.updateExpiresAt('transfer-1', 2000)

  expect(updated?.expiresAt).toBe(2000)
  expect((await dao.findById('transfer-1'))?.expiresAt).toBe(2000)
})

test('returns null when extending a session that does not exist', async () => {
  const dao = createTransferDao(makeFakeD1().db)

  expect(await dao.updateExpiresAt('missing', 2000)).toBeNull()
})

test('removes a session and its files so neither can be found again', async () => {
  const { db, files } = makeFakeD1()
  const dao = createTransferDao(db)
  await dao.create(RECORD)
  await dao.addFile('transfer-1', {
    id: 'file-1',
    filename: 'a.pdf',
    contentType: 'application/pdf',
    size: 100,
  })

  await dao.delete('transfer-1')

  expect(await dao.findById('transfer-1')).toBeNull()
  expect(files).toHaveLength(0)
})
