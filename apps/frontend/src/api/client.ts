import type { AppType } from 'backend/src/app.ts'
import { hc } from 'hono/client'

const baseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8787'
const REQUEST_TIMEOUT_MS = 3_000

/** Hono RPC client. Request/response types are inferred from `AppType`, never hand-written.
 * Attaches the session token from `stores/auth.ts` when one exists — a dynamic import so this
 * module (loaded before Pinia is installed) never statically depends on a store. */
export const apiClient = hc<AppType>(baseUrl, {
  fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
    const { useAuthStore } = await import('../stores/auth.ts')
    const { token } = useAuthStore()

    const headers = new Headers(init?.headers)
    if (token) headers.set('authorization', `Bearer ${token}`)

    return fetch(input, { ...init, headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
  },
})
