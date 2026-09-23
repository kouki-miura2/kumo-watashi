/** fetch + a manual read loop, not XHR, because it's the only way to both stream the body into a
 * Blob (rather than buffering the whole response before `onload`) and observe byte progress. Used
 * by DownloaderView for each file it downloads. */
export const downloadWithProgress = async (
  url: string,
  onProgress: (percent: number) => void,
  signal: AbortSignal,
): Promise<Blob> => {
  const res = await fetch(url, { signal })
  if (!res.ok || !res.body) throw new Error('ダウンロードに失敗しました')
  const total = Number(res.headers.get('Content-Length') ?? 0)
  const reader = res.body.getReader()
  const chunks: BlobPart[] = []
  let loaded = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    loaded += value.length
    if (total > 0) onProgress(Math.round((loaded / total) * 100))
  }
  return new Blob(chunks)
}

/** Triggers the browser's native "save to disk" via a throwaway anchor click — the only DOM-only
 * piece of the download flow, kept alongside `downloadWithProgress` since callers always need
 * both in sequence. */
export const saveBlob = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}
