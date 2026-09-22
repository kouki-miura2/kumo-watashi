import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { validator } from 'hono/validator'
import { createLogger } from 'utils'

import type { AuthGuard, AuthenticatedUser } from './repository/auth-guard.interface.ts'
import type { GoogleIdTokenVerifier } from './repository/google-id-token-verifier.interface.ts'
import type { SessionTokenIssuer } from './repository/session-token.interface.ts'
import type { TransferService } from './service/transfer.service.ts'

export interface AuthConfig {
  guard: AuthGuard
  /** Off by default (free access). When on, applies to every route except `excludePaths`. */
  enabled: boolean
  excludePaths: string[]
}

export interface AppDependencies {
  auth: AuthConfig
  googleIdTokens: GoogleIdTokenVerifier
  sessionTokens: SessionTokenIssuer
  transfers: TransferService
}

type Variables = { user: AuthenticatedUser | null; requestId: string }

// Structurally exempt from the auth guard, regardless of `excludePaths`: this is how a client
// gets a session in the first place, so it can never itself require one.
const GOOGLE_SIGN_IN_PATH = '/api/auth/google'

// 4 random bytes as hex: short enough to scan by eye in logs, still ~4 billion values so
// collisions within one log stream are practically a non-issue.
const generateRequestId = (): string =>
  Array.from(crypto.getRandomValues(new Uint8Array(4)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')

/** Runtime-agnostic app: no Cloudflare Workers or Node-specific APIs here. See `worker.ts` / `server.ts` for entrypoints. */
export const createApp = (deps: AppDependencies) => {
  const logger = createLogger({ format: 'json' })

  return (
    new Hono<{ Variables: Variables }>()
      .use('*', cors())
      // Audit trail: start/end pair per request, joined by requestId (needed since concurrent
      // requests to the same method+path would otherwise be indistinguishable in the log stream).
      // Wraps the auth guard so a rejected (401) request is still logged, not just successful ones.
      .use('*', async (c, next) => {
        const requestId = generateRequestId()
        c.set('requestId', requestId)
        const startedAt = Date.now()

        logger.info('request started', { requestId, method: c.req.method, path: c.req.path })

        try {
          await next()
        } finally {
          logger.info('request completed', {
            requestId,
            method: c.req.method,
            path: c.req.path,
            user: c.get('user')?.id ?? 'anonymous',
            status: c.res.status,
            durationMs: Date.now() - startedAt,
          })
        }
      })
      .use('*', async (c, next) => {
        if (
          deps.auth.enabled &&
          c.req.path !== GOOGLE_SIGN_IN_PATH &&
          !deps.auth.excludePaths.includes(c.req.path)
        ) {
          const user = await deps.auth.guard.authenticate(c.req.raw)
          if (!user) return c.json({ error: 'Unauthorized' }, 401)
          c.set('user', user)
        } else {
          c.set('user', null)
        }
        await next()
      })
      // Exchanges a Google ID token (from Google Identity Services on the client) for our own
      // short-lived session token. Google verification + anonymization happens inside
      // `googleIdTokens` — this route never sees the raw Google subject.
      .post(
        GOOGLE_SIGN_IN_PATH,
        validator('json', (value, c) => {
          const idToken = (value as Record<string, unknown> | null)?.idToken
          if (typeof idToken !== 'string' || !idToken) {
            return c.json({ error: 'Bad Request' }, 400)
          }
          return { idToken }
        }),
        async (c) => {
          const { idToken } = c.req.valid('json')
          const googleUser = await deps.googleIdTokens.verify(idToken)
          if (!googleUser) return c.json({ error: 'Unauthorized' }, 401)

          const token = await deps.sessionTokens.create(googleUser.id)
          return c.json({ token })
        },
      )
      // Uploader only — creates a Transfer Session and returns its one-time join code/QR secret.
      // Neither is retrievable again after this response (docs/spec.md section 16).
      .post(
        '/api/transfers',
        validator('json', (value) => {
          const senderLabel = (value as Record<string, unknown> | null)?.senderLabel
          return {
            senderLabel:
              typeof senderLabel === 'string' && senderLabel.trim() ? senderLabel.trim() : '匿名',
          }
        }),
        async (c) => {
          const { senderLabel } = c.req.valid('json')
          const result = await deps.transfers.createTransfer(senderLabel)
          return c.json(result, 201)
        },
      )
      // Uploader only — stores one file's bytes against an existing, unexpired session.
      .post('/api/transfers/:id/files', async (c) => {
        const body = await c.req.parseBody()
        const file = body.file
        if (!(file instanceof File)) return c.json({ error: 'Bad Request' }, 400)

        const result = await deps.transfers.addFile(c.req.param('id'), {
          filename: file.name,
          contentType: file.type || 'application/octet-stream',
          size: file.size,
          bytes: new Uint8Array(await file.arrayBuffer()),
        })

        if (result.status === 'not_found') return c.json({ error: 'Not Found' }, 404)
        if (result.status === 'expired') return c.json({ error: 'Gone' }, 410)
        if (result.status === 'limit_exceeded') {
          return c.json({ error: 'Bad Request', reason: result.reason }, 400)
        }
        return c.json(result.file, 201)
      })
      // Downloader only — join via the QR's embedded secret (docs/spec.md section 21).
      .get('/api/transfers/join/:secret', async (c) => {
        const result = await deps.transfers.joinBySecret(c.req.param('secret'))
        if (result.status === 'not_found') return c.json({ error: 'Not Found' }, 404)
        if (result.status === 'expired') return c.json({ error: 'Gone' }, 410)
        return c.json(result.session)
      })
      // Downloader only — join via the human-typed one-time code (docs/spec.md section 21).
      .post(
        '/api/transfers/join',
        validator('json', (value, c) => {
          const code = (value as Record<string, unknown> | null)?.code
          if (typeof code !== 'string' || !code) return c.json({ error: 'Bad Request' }, 400)
          return { code }
        }),
        async (c) => {
          const { code } = c.req.valid('json')
          const result = await deps.transfers.joinByCode(code)
          if (result.status === 'not_found') return c.json({ error: 'Not Found' }, 404)
          if (result.status === 'expired') return c.json({ error: 'Gone' }, 410)
          return c.json(result.session)
        },
      )
      // Downloader only — status/metadata poll (docs/spec.md section 36: HTTP + polling, no
      // WebSocket/Durable Objects in the MVP).
      .get('/api/transfers/:id', async (c) => {
        const result = await deps.transfers.getSession(c.req.param('id'))
        if (result.status === 'not_found') return c.json({ error: 'Not Found' }, 404)
        if (result.status === 'expired') return c.json({ error: 'Gone' }, 410)
        return c.json(result.session)
      })
      .get('/api/transfers/:id/files', async (c) => {
        const result = await deps.transfers.getSession(c.req.param('id'))
        if (result.status === 'not_found') return c.json({ error: 'Not Found' }, 404)
        if (result.status === 'expired') return c.json({ error: 'Gone' }, 410)
        return c.json({ files: result.session.files })
      })
      // Downloader only — streams the file body directly (no R2 presigned URL yet, see
      // dao/transfer.memory.ts).
      .get('/api/transfers/:id/files/:fileId/download', async (c) => {
        const result = await deps.transfers.getFile(c.req.param('id'), c.req.param('fileId'))
        if (result.status === 'not_found') return c.json({ error: 'Not Found' }, 404)
        if (result.status === 'expired') return c.json({ error: 'Gone' }, 410)

        // RFC 5987 filename* alongside an ASCII fallback, since `filename` names are frequently
        // Japanese and plain `Content-Disposition` filenames must stay in the header's charset.
        const asciiFallback = result.meta.filename.replace(/[^\x20-\x7e]/g, '_')
        // `Uint8Array`'s storage type param defaults to the wider `ArrayBufferLike`; every byte
        // source here (`file.arrayBuffer()`, the in-memory blob store) is a real `ArrayBuffer`.
        return c.body(result.bytes as Uint8Array<ArrayBuffer>, 200, {
          'Content-Type': result.meta.contentType || 'application/octet-stream',
          'Content-Length': String(result.meta.size),
          'Content-Disposition': `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(result.meta.filename)}`,
        })
      })
      // Uploader only — resets the 3-minute TTL from now.
      .post('/api/transfers/:id/extend', async (c) => {
        const result = await deps.transfers.extend(c.req.param('id'))
        if (result.status === 'not_found') return c.json({ error: 'Not Found' }, 404)
        if (result.status === 'expired') return c.json({ error: 'Gone' }, 410)
        return c.json(result.session)
      })
      // Uploader only — deletes immediately instead of waiting out the TTL.
      .delete('/api/transfers/:id', async (c) => {
        await deps.transfers.deleteTransfer(c.req.param('id'))
        return c.body(null, 204)
      })
  )
}

/** Hono RPC contract consumed by `apps/frontend` via `hc<AppType>()`. */
export type AppType = ReturnType<typeof createApp>
