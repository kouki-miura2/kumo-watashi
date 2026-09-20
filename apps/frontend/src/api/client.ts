import type { AppType } from 'backend/src/app.ts'
import { hc } from 'hono/client'

const baseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8787'

/** Hono RPC client. Request/response types are inferred from `AppType`, never hand-written. */
export const apiClient = hc<AppType>(baseUrl)
