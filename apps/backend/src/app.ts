import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { validator } from 'hono/validator'
import { createLogger } from 'utils'

import type { AuthGuard, AuthenticatedUser } from './repository/auth-guard.interface.ts'
import type { CleanupLock } from './repository/cleanup-lock.interface.ts'
import type { GoogleIdTokenVerifier } from './repository/google-id-token-verifier.interface.ts'
import type { RateLimiter } from './repository/rate-limiter.interface.ts'
import type { SessionTokenIssuer } from './repository/session-token.interface.ts'
import type { TurnstileVerifier } from './repository/turnstile-verifier.interface.ts'
import type { TransferService } from './service/transfer.service.ts'

export interface AuthPathPatternExclusion {
  method: string
  pattern: RegExp
}

export interface AuthConfig {
  guard: AuthGuard
  /** Off by default (free access). When on, applies to every route except `excludePaths` /
   * `excludePathPatterns`. */
  enabled: boolean
  /** Exact-path exemptions — only for routes with no `:param` segments. */
  excludePaths: string[]
  /** Method+pattern exemptions, for routes with `:param` segments (e.g. `/api/transfers/:id`).
   * `method` must match too: a path-only pattern couldn't tell an excluded `GET` apart from a
   * protected `POST`/`DELETE` on the exact same resolved path (docs/implementation-plan.md). */
  excludePathPatterns: AuthPathPatternExclusion[]
}

export interface AppDependencies {
  auth: AuthConfig
  googleIdTokens: GoogleIdTokenVerifier
  sessionTokens: SessionTokenIssuer
  transfers: TransferService
  rateLimiter: RateLimiter
  cleanupLock: CleanupLock
  turnstile: TurnstileVerifier
}

type Variables = { user: AuthenticatedUser | null; requestId: string }

// Structurally exempt from the auth guard, regardless of `excludePaths`: this is how a client
// gets a session in the first place, so it can never itself require one.
const GOOGLE_SIGN_IN_PATH = '/api/auth/google'

// docs/spec.md section 21 — Downloaders never log in, so these routes (plus GOOGLE_SIGN_IN_PATH
// and /api/client-id below) must stay reachable once the auth guard is enabled. Exported so
// worker.ts/server.ts share one definition instead of maintaining their own copy.
export const AUTH_EXCLUDE_PATHS: string[] = ['/api/client-id', '/api/transfers/join']

// `GET` on each of these path shapes is also used by a *protected* method (`DELETE`/`POST`) on
// the exact same resolved path — e.g. `GET /api/transfers/:id` (Downloader poll, excluded) vs.
// `DELETE /api/transfers/:id` (Uploader delete, protected) — so the method must be checked too,
// not just the path.
export const AUTH_EXCLUDE_PATH_PATTERNS: AuthPathPatternExclusion[] = [
  { method: 'GET', pattern: /^\/api\/transfers\/join\/[^/]+$/ },
  { method: 'GET', pattern: /^\/api\/transfers\/[^/]+$/ },
  { method: 'GET', pattern: /^\/api\/transfers\/[^/]+\/files$/ },
  { method: 'GET', pattern: /^\/api\/transfers\/[^/]+\/files\/[^/]+\/download$/ },
]

// 4 random bytes as hex: short enough to scan by eye in logs, still ~4 billion values so
// collisions within one log stream are practically a non-issue.
const generateRequestId = (): string =>
  Array.from(crypto.getRandomValues(new Uint8Array(4)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')

// docs/spec.md section 10 — an opaque per-device id, unrelated to auth/session. Minted once per
// client and re-sent on every join attempt so the rate limit below can key on (IP, client id)
// instead of IP alone, which would otherwise punish every user behind the same NAT/proxy for one
// abuser's attempts. 16 random bytes as hex (128 bit) — not a credential, just a limiter key.
const generateClientId = (): string =>
  Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')

const CLIENT_ID_HEADER = 'x-client-id'
const getClientIp = (request: Request): string =>
  request.headers.get('cf-connecting-ip') ?? 'unknown'
// docs/spec.md section 8.2 — logged (when present) alongside every domain event so an anonymous
// Downloader's join/download calls can be correlated without requiring login. Not enforced outside
// the join-by-code route; "unknown" just means the caller didn't send one.
const getClientId = (request: Request): string => request.headers.get(CLIENT_ID_HEADER) ?? 'unknown'

// docs/spec.md section 10 — minting is itself throttled by IP alone: a client id is never
// verified, so without this an attacker could just mint a fresh one per join attempt to dodge
// the per-(IP, client id) limit below. Legitimate clients mint once and reuse it, so this limit
// is generous compared to the join-attempt one.
const CLIENT_ID_ISSUE_LIMIT = 20
const CLIENT_ID_ISSUE_WINDOW_MS = 60 * 1000

// docs/spec.md section 15 — one-time code brute-force protection, required alongside the 1-minute
// TTL and the code's own limited entropy.
const JOIN_ATTEMPT_LIMIT = 10
const JOIN_ATTEMPT_WINDOW_MS = 60 * 1000

// docs/spec.md section 5.1 — crash-safety upper bound for the cleanup lease (see
// `repository/cleanup-lock.interface.ts`). The happy path releases well before this; it only
// matters if an isolate is evicted mid-sweep.
const CLEANUP_LEASE_MS = 30 * 1000

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
      // docs/spec.md section 5.1 — opportunistic physical cleanup of expired sessions, run
      // instead of a Cron Trigger (see docs/implementation-plan.md for why: Cron's Free-plan CPU
      // budget per invocation is only 10ms, too tight for an unbounded delete sweep). Whichever
      // request wins the lease runs the sweep; every other concurrent request sees it already
      // held and proceeds immediately without waiting — never blocks on this.
      .use('*', async (_c, next) => {
        if (await deps.cleanupLock.tryAcquire(CLEANUP_LEASE_MS)) {
          try {
            const deleted = await deps.transfers.deleteExpiredSessions()
            for (const transfer of deleted) {
              logger.info('transfer session deleted', {
                transferId: transfer.transferId,
                reason: 'expired',
                user: 'system',
                files: transfer.files.map((f) => ({ id: f.id, filename: f.filename })),
              })
            }
          } finally {
            await deps.cleanupLock.release()
          }
        }
        await next()
      })
      .use('*', async (c, next) => {
        const isExcluded =
          c.req.path === GOOGLE_SIGN_IN_PATH ||
          deps.auth.excludePaths.includes(c.req.path) ||
          deps.auth.excludePathPatterns.some(
            ({ method, pattern }) => c.req.method === method && pattern.test(c.req.path),
          )

        if (deps.auth.enabled && !isExcluded) {
          const user = await deps.auth.guard.authenticate(c.req.raw)
          if (!user) return c.json({ error: 'Unauthorized' }, 401)
          c.set('user', user)
        } else {
          c.set('user', null)
        }
        await next()
      })
      // Exchanges a Google ID token (from Google Identity Services on the client) for our own
      // short-lived session token. Google verification happens inside `googleIdTokens`, which
      // returns the verified email as-is — docs/spec.md section 8.2 deliberately logs it
      // unanonymized so the operator can tell their own use apart from an authorized third
      // party's or an unauthorized one's.
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

          // Lets the "request completed" audit line above attribute this request to the signed-in
          // user, and gives a dedicated, easy-to-grep event for "who logged in and when".
          c.set('user', { id: googleUser.email })
          logger.info('user signed in', { requestId: c.get('requestId'), user: googleUser.email })

          const token = await deps.sessionTokens.create(googleUser.email)
          return c.json({ token })
        },
      )
      // docs/spec.md section 10 — mints an opaque client id the Downloader must send back as
      // `X-Client-Id` on join attempts. Unauthenticated by design (Downloaders don't log in), so
      // the only abuse control here is throttling issuance itself by IP.
      .post('/api/client-id', async (c) => {
        const ip = getClientIp(c.req.raw)
        const allowed = await deps.rateLimiter.consume(
          `client-id:${ip}`,
          CLIENT_ID_ISSUE_LIMIT,
          CLIENT_ID_ISSUE_WINDOW_MS,
        )
        if (!allowed) return c.json({ error: 'Too Many Requests' }, 429)
        return c.json({ clientId: generateClientId() })
      })
      // Uploader only — creates a Transfer Session and returns its one-time join code/QR secret.
      // Neither is retrievable again after this response (docs/spec.md section 16). Turnstile
      // gated (docs/spec.md section 9) — this is the one operation the spec calls out as worth
      // the friction, since it's what actually consumes R2/D1 quota.
      .post(
        '/api/transfers',
        validator('json', (value) => {
          const body = value as Record<string, unknown> | null
          const senderLabel = body?.senderLabel
          const turnstileToken = body?.turnstileToken
          return {
            senderLabel:
              typeof senderLabel === 'string' && senderLabel.trim() ? senderLabel.trim() : '匿名',
            turnstileToken: typeof turnstileToken === 'string' ? turnstileToken : '',
          }
        }),
        async (c) => {
          const { senderLabel, turnstileToken } = c.req.valid('json')
          const verified = await deps.turnstile.verify(turnstileToken, getClientIp(c.req.raw))
          if (!verified) return c.json({ error: 'Forbidden' }, 403)

          const result = await deps.transfers.createTransfer(senderLabel)
          return c.json(result, 201)
        },
      )
      // Uploader only — stores one file's bytes against an existing, unexpired session.
      .post('/api/transfers/:id/files', async (c) => {
        const transferId = c.req.param('id')
        const body = await c.req.parseBody()
        const file = body.file
        if (!(file instanceof File)) return c.json({ error: 'Bad Request' }, 400)

        const result = await deps.transfers.addFile(transferId, {
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
        // Who: the authenticated user once the auth guard is enabled (still "anonymous" while it
        // stays off by default, matching every other route today).
        logger.info('file uploaded', {
          requestId: c.get('requestId'),
          transferId,
          fileId: result.file.id,
          filename: result.file.filename,
          size: result.file.size,
          user: c.get('user')?.id ?? 'anonymous',
          clientId: getClientId(c.req.raw),
        })
        return c.json(result.file, 201)
      })
      // Downloader only — join via the QR's embedded secret (docs/spec.md section 21).
      .get('/api/transfers/join/:secret', async (c) => {
        const result = await deps.transfers.joinBySecret(c.req.param('secret'))
        if (result.status === 'not_found') return c.json({ error: 'Not Found' }, 404)
        if (result.status === 'expired') return c.json({ error: 'Gone' }, 410)
        // Ties this client id to the transferId it joined — without this, a later "file
        // downloaded" log's clientId can't be correlated back to which session it belongs to.
        logger.info('transfer joined', {
          requestId: c.get('requestId'),
          transferId: result.session.id,
          method: 'secret',
          clientId: getClientId(c.req.raw),
        })
        return c.json(result.session)
      })
      // Downloader only — join via the human-typed one-time code (docs/spec.md section 21).
      // Rate limited per (IP, client id) pair (section 10/15): brute-forcing the code is the one
      // join path where this is required, since QR secrets have too much entropy to guess.
      .post(
        '/api/transfers/join',
        validator('json', (value, c) => {
          const code = (value as Record<string, unknown> | null)?.code
          if (typeof code !== 'string' || !code) return c.json({ error: 'Bad Request' }, 400)
          return { code }
        }),
        async (c) => {
          const clientId = c.req.header(CLIENT_ID_HEADER)
          if (!clientId) return c.json({ error: 'Bad Request' }, 400)

          const ip = getClientIp(c.req.raw)
          const allowed = await deps.rateLimiter.consume(
            `join-code:${ip}:${clientId}`,
            JOIN_ATTEMPT_LIMIT,
            JOIN_ATTEMPT_WINDOW_MS,
          )
          if (!allowed) return c.json({ error: 'Too Many Requests' }, 429)

          const { code } = c.req.valid('json')
          const result = await deps.transfers.joinByCode(code)
          if (result.status === 'not_found') return c.json({ error: 'Not Found' }, 404)
          if (result.status === 'expired') return c.json({ error: 'Gone' }, 410)
          logger.info('transfer joined', {
            requestId: c.get('requestId'),
            transferId: result.session.id,
            method: 'code',
            clientId,
          })
          return c.json(result.session)
        },
      )
      // Downloader only — status/metadata poll. HTTP + polling, no WebSocket/Durable Objects in
      // the MVP.
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
        const transferId = c.req.param('id')
        const result = await deps.transfers.getFile(transferId, c.req.param('fileId'))
        if (result.status === 'not_found') return c.json({ error: 'Not Found' }, 404)
        if (result.status === 'expired') return c.json({ error: 'Gone' }, 410)

        logger.info('file downloaded', {
          requestId: c.get('requestId'),
          transferId,
          fileId: result.meta.id,
          filename: result.meta.filename,
          user: c.get('user')?.id ?? 'anonymous',
          clientId: getClientId(c.req.raw),
        })

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
      // Uploader only — resets the 1-minute TTL from now.
      .post('/api/transfers/:id/extend', async (c) => {
        const result = await deps.transfers.extend(c.req.param('id'))
        if (result.status === 'not_found') return c.json({ error: 'Not Found' }, 404)
        if (result.status === 'expired') return c.json({ error: 'Gone' }, 410)
        return c.json(result.session)
      })
      // Uploader only — deletes immediately instead of waiting out the TTL.
      .delete('/api/transfers/:id', async (c) => {
        const deleted = await deps.transfers.deleteTransfer(c.req.param('id'))
        logger.info('transfer session deleted', {
          requestId: c.get('requestId'),
          transferId: deleted.transferId,
          reason: 'explicit',
          user: c.get('user')?.id ?? 'anonymous',
          clientId: getClientId(c.req.raw),
          files: deleted.files.map((f) => ({ id: f.id, filename: f.filename })),
        })
        return c.body(null, 204)
      })
  )
}

/** Hono RPC contract consumed by `apps/frontend` via `hc<AppType>()`. */
export type AppType = ReturnType<typeof createApp>
