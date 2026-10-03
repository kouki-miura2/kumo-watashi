import { AUTH_EXCLUDE_PATH_PATTERNS, AUTH_EXCLUDE_PATHS, createApp } from 'backend/src/app.ts'
import { createSessionTokenAuthGuard } from 'backend/src/repository/auth-guard.session-token.ts'
import { createGoogleIdTokenVerifier } from 'backend/src/repository/google-id-token-verifier.jose.ts'
import { createSessionTokenIssuer } from 'backend/src/repository/session-token.jose.ts'
import { createTransferRepository } from 'backend/src/repository/transfer.repository.ts'
import { createTurnstileVerifier } from 'backend/src/repository/turnstile-verifier.cloudflare.ts'
import { createTransferService } from 'backend/src/service/transfer.service.ts'

import { createTransferDao } from './dao/transfer.d1.ts'
import { createCleanupLock } from './repository/cleanup-lock.d1.ts'
import { createFileBlobStore } from './repository/file-blob-store.r2.ts'
import { createRateLimiter } from './repository/rate-limiter.d1.ts'

// `SESSION_SECRET`/`TURNSTILE_SECRET_KEY` are real secrets, not declared in `wrangler.jsonc`'s
// `vars` — set them via `.dev.vars` (untracked) locally, `wrangler secret put <NAME>` in
// production. `TURNSTILE_SECRET_KEY` isn't redeclared here: once it's in `.dev.vars` (or bound
// as a deployed secret), `wrangler types` already adds it to the generated `Env` as required —
// redeclaring it `?:` here would conflict. The runtime check below still guards the case where
// it genuinely isn't set yet.
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
    const sessionTokens = createSessionTokenIssuer(sessionSecret)

    if (!env.TURNSTILE_SECRET_KEY) {
      throw new Error('TURNSTILE_SECRET_KEY is required — set it via `wrangler secret put`')
    }

    const app = createApp({
      auth: {
        guard: createSessionTokenAuthGuard(sessionTokens),
        enabled: true,
        excludePaths: AUTH_EXCLUDE_PATHS,
        excludePathPatterns: AUTH_EXCLUDE_PATH_PATTERNS,
      },
      googleIdTokens: createGoogleIdTokenVerifier(env.GOOGLE_CLIENT_ID),
      sessionTokens,
      // `env.DB`/`env.FILES` only exist inside the per-request `env`, not at module scope, so
      // this can't be built once and reused across requests — but D1/R2 are durable stores, so
      // there's nothing to lose by reconstructing this thin wrapper on every request.
      transfers: createTransferService(
        createTransferRepository(createTransferDao(env.DB)),
        createFileBlobStore(env.FILES),
      ),
      rateLimiter: createRateLimiter(env.DB),
      cleanupLock: createCleanupLock(env.DB),
      turnstile: createTurnstileVerifier(
        env.TURNSTILE_SECRET_KEY,
        env.TURNSTILE_HOSTNAMES.split(',')
          .map((hostname) => hostname.trim())
          .filter(Boolean),
      ),
    })

    return app.fetch(request, env, ctx)
  },
}
