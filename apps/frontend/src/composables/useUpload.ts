/** Thrown when the upload route rejects the session token (expired or otherwise invalid) — lets
 * callers prompt for re-login instead of showing a generic upload-failure message. */
export class UnauthorizedError extends Error {
  constructor() {
    super('Unauthorized')
  }
}

/** XHR, not fetch, because it's the only API exposing upload byte progress. Used by UploaderView
 * for each picked file. Unlike `apiClient` (`src/api/client.ts`), this doesn't attach the session
 * token itself — the upload route is authenticated (it's an Uploader-only route, not one of
 * `AUTH_EXCLUDE_PATHS`), so callers must pass it via `headers`. */
export const uploadFileWithProgress = (
  url: string,
  file: File,
  onProgress: (percent: number) => void,
  signal: AbortSignal,
  headers: Record<string, string> = {},
): Promise<void> =>
  new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url)
    for (const [name, value] of Object.entries(headers)) {
      xhr.setRequestHeader(name, value)
    }
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve()
        return
      }
      if (xhr.status === 401) {
        reject(new UnauthorizedError())
        return
      }
      let reason = 'アップロードに失敗しました'
      try {
        const body = JSON.parse(xhr.responseText) as { reason?: string }
        if (body.reason) reason = body.reason
      } catch {
        // Non-JSON error body — keep the generic message.
      }
      reject(new Error(reason))
    }
    xhr.onerror = () => reject(new Error('アップロードに失敗しました'))
    xhr.onabort = () => reject(new DOMException('Aborted', 'AbortError'))
    signal.addEventListener('abort', () => xhr.abort())
    const formData = new FormData()
    formData.append('file', file)
    xhr.send(formData)
  })
