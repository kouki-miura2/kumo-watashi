/** Pulls the QR secret out of whatever the camera decoded — either the bare secret or a
 * `.../downloader?secret=...`-style URL (native camera apps open the link directly; our own
 * scanner extracts it manually via this). Shared with `QrScanner.vue`'s consumer so both paths
 * agree on what counts as a valid secret. */
export const extractQrSecret = (data: string): string | null => {
  try {
    const fromQuery = new URL(data).searchParams.get('secret')
    if (fromQuery) return fromQuery
  } catch {
    // Not a URL — fall through to treating the raw text as the secret itself.
  }
  const trimmed = data.trim()
  return /^[0-9a-f]{64}$/i.test(trimmed) ? trimmed : null
}
