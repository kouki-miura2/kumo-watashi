import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { createLogger } from 'utils'

import type { AuthGuard, AuthenticatedUser } from './repository/auth-guard.interface.ts'
import type { SampleService } from './service/sample.service.ts'

export interface AuthConfig {
  guard: AuthGuard
  /** Off by default (free access). When on, applies to every route except `excludePaths`. */
  enabled: boolean
  excludePaths: string[]
}

export interface AppDependencies {
  sampleService: SampleService
  auth: AuthConfig
}

type Variables = { user: AuthenticatedUser | null; requestId: string }

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
        if (deps.auth.enabled && !deps.auth.excludePaths.includes(c.req.path)) {
          const user = await deps.auth.guard.authenticate(c.req.raw)
          if (!user) return c.json({ error: 'Unauthorized' }, 401)
          c.set('user', user)
        } else {
          c.set('user', null)
        }
        await next()
      })
      // Reference implementation of one endpoint through the app -> service -> repository -> dao
      // layering: `worker.ts` / `server.ts` wire the concrete dependencies, this route only talks
      // to `SampleService`. Build real routes the same way, then delete this route and the
      // `service/sample.*`, `repository/sample.*`, `dao/sample.*` files once they're not needed
      // as a reference anymore.
      .get('/sample/:id', async (c) => {
        const sample = await deps.sampleService.getSample(c.req.param('id'))
        if (!sample) return c.json({ error: 'Not Found' }, 404)
        return c.json(sample)
      })
  )
}

/** Hono RPC contract consumed by `apps/frontend` via `hc<AppType>()`. */
export type AppType = ReturnType<typeof createApp>
