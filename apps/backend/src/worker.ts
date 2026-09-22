import { createApp } from './app.ts'
import { createTransferDao } from './dao/transfer.d1.ts'
import { createAuthGuard } from './repository/auth-guard.header.ts'
import { createFileBlobStore } from './repository/file-blob-store.r2.ts'
import { createGoogleIdTokenVerifier } from './repository/google-id-token-verifier.jose.ts'
import { createSessionTokenIssuer } from './repository/session-token.jose.ts'
import { createTransferRepository } from './repository/transfer.repository.ts'
import { createTransferService } from './service/transfer.service.ts'

// `SESSION_SECRET` is a real secret, not declared in `wrangler.jsonc`'s `vars` — set it via
// `.dev.vars` (untracked) locally, `wrangler secret put SESSION_SECRET` in production.
interface WorkerEnv extends Env {
  SESSION_SECRET?: string
}

// Per-isolate fallback so `wrangler dev` works before anyone sets up `.dev.vars` — sessions just
// reset if the isolate restarts. Set `SESSION_SECRET` for real once this ships anywhere shared.
let ephemeralSessionSecret: string | undefined

export default {
  fetch: (request: Request, env: WorkerEnv, ctx: ExecutionContext) => {
    const sessionSecret =
      env.SESSION_SECRET ?? (ephemeralSessionSecret ??= crypto.randomUUID() + crypto.randomUUID())

    const app = createApp({
      auth: { guard: createAuthGuard(), enabled: false, excludePaths: [] },
      googleIdTokens: createGoogleIdTokenVerifier(env.GOOGLE_CLIENT_ID, sessionSecret),
      sessionTokens: createSessionTokenIssuer(sessionSecret),
      // `env.DB`/`env.FILES` only exist inside the per-request `env`, not at module scope, so
      // unlike the Node build (server.ts) this can't be built once and reused across requests —
      // but D1/R2 are durable stores, not in-memory ones, so there's nothing to lose by
      // reconstructing this thin wrapper on every request.
      transfers: createTransferService(
        createTransferRepository(createTransferDao(env.DB)),
        createFileBlobStore(env.FILES),
      ),
    })

    return app.fetch(request, env, ctx)
  },
}
