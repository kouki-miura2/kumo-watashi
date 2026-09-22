/// <reference types="node" />
import { serve } from '@hono/node-server'

import { createApp } from './app.ts'
import { createTransferDao } from './dao/transfer.memory.ts'
import { createAuthGuard } from './repository/auth-guard.header.ts'
import { createFileBlobStore } from './repository/file-blob-store.memory.ts'
import { createGoogleIdTokenVerifier } from './repository/google-id-token-verifier.jose.ts'
import { createSessionTokenIssuer } from './repository/session-token.jose.ts'
import { createTransferRepository } from './repository/transfer.repository.ts'
import { createTransferService } from './service/transfer.service.ts'

// `SESSION_SECRET` is a real secret — set it via a `.env` (untracked) for a persistent local
// session across restarts. Falls back to a random one so this still runs with zero setup;
// sessions just reset on every restart.
const sessionSecret = process.env.SESSION_SECRET ?? crypto.randomUUID() + crypto.randomUUID()

// No fallback here on purpose: this project is OSS, so a hardcoded default would silently point
// every fork/clone at the original author's own Google Cloud OAuth client. Each deployer creates
// their own (Google Cloud Console → APIs & Services → Credentials) and sets it via `.env`.
const googleClientId = process.env.GOOGLE_CLIENT_ID
if (!googleClientId) {
  throw new Error('GOOGLE_CLIENT_ID is required — set it in .env (see README.md)')
}

const app = createApp({
  auth: { guard: createAuthGuard(), enabled: false, excludePaths: [] },
  googleIdTokens: createGoogleIdTokenVerifier(googleClientId, sessionSecret),
  sessionTokens: createSessionTokenIssuer(sessionSecret),
  // In-memory, unlike worker.ts's D1/R2-backed pair — this process is long-lived (unlike a
  // Workers isolate), so a plain Map already survives for the life of the server; wire up
  // real persistence here too if this entrypoint ever needs to survive a restart.
  transfers: createTransferService(
    createTransferRepository(createTransferDao()),
    createFileBlobStore(),
  ),
})
const port = Number(process.env.PORT ?? 8787)

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Listening on http://localhost:${info.port}`)
})
