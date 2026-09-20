import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { createLogger } from 'utils'

import type { StatusRepository } from './repositories/status.interface.ts'

export interface AppDependencies {
  statusRepository: StatusRepository
}

/** Runtime-agnostic app: no Cloudflare Workers or Node-specific APIs here. See `worker.ts` / `server.ts` for entrypoints. */
export const createApp = (deps: AppDependencies) => {
  const logger = createLogger({ prefix: 'backend' })

  return new Hono()
    .use('*', cors())
    .use('*', async (c, next) => {
      logger.info(c.req.method, c.req.path)
      await next()
    })
    .get('/', async (c) => c.json(await deps.statusRepository.getStatus()))
}

/** Hono RPC contract consumed by `apps/frontend` via `hc<AppType>()`. */
export type AppType = ReturnType<typeof createApp>
