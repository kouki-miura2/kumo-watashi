const STORAGE_KEY = 'kumo-watashi:client-id'

let cached: string | null = null

const readStorage = (): string | null => {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

const writeStorage = (value: string): void => {
  try {
    localStorage.setItem(STORAGE_KEY, value)
  } catch {
    // Best-effort only — if storage is unavailable (private browsing, quota, ...) the id just
    // isn't persisted across reloads; a fresh one is minted next time instead.
  }
}

/** Mints (once, then cached in memory + localStorage) the opaque per-device id the Downloader
 * must send as `X-Client-Id` when joining by one-time code (docs/spec.md section 10) — keys the
 * backend's rate limit on (IP, client id) instead of IP alone, so one user's failed attempts
 * don't throttle everyone else behind the same NAT/proxy. Uses a bare `fetch`, not `apiClient`,
 * so it never recurses back into `apiClient`'s own header-injection logic. */
export const getClientId = async (baseUrl: string): Promise<string> => {
  if (cached) return cached

  const fromStorage = readStorage()
  if (fromStorage) {
    cached = fromStorage
    return fromStorage
  }

  const res = await fetch(`${baseUrl}/api/client-id`, { method: 'POST' })
  if (!res.ok) throw new Error(`failed to obtain client id: ${res.status}`)
  const { clientId } = (await res.json()) as { clientId: string }

  cached = clientId
  writeStorage(clientId)
  return clientId
}
