import type { AppType } from 'backend/src/app.ts'
import { hc } from 'hono/client'

import { getClientId } from './client-id.ts'

const baseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8787'
const REQUEST_TIMEOUT_MS = 3_000

/** Hono RPC client. Request/response types are inferred from `AppType`, never hand-written.
 * Attaches the session token from `stores/auth.ts` when one exists — a dynamic import so this
 * module (loaded before Pinia is installed) never statically depends on a store. Also attaches
 * `X-Client-Id` on every request: `POST /api/transfers/join` requires it (docs/spec.md section
 * 10), and every other route logs it when present so the same anonymous Downloader's join/list/
 * download calls can be correlated in the audit log (docs/spec.md section 8.2) without requiring
 * login. `getClientId` uses a bare `fetch`, not this client, so there's no circularity minting it. */
export const apiClient = hc<AppType>(baseUrl, {
  fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
    const { useAuthStore } = await import('../stores/auth.ts')
    const { token } = useAuthStore()

    const headers = new Headers(init?.headers)
    if (token) headers.set('authorization', `Bearer ${token}`)
    headers.set('x-client-id', await getClientId(baseUrl))

    return fetch(input, { ...init, headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
  },
})
