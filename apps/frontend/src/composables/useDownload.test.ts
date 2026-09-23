import { afterEach, expect, test, vi } from 'vite-plus/test'

import { downloadWithProgress } from './useDownload.ts'

const makeResponse = (
  chunks: Uint8Array[],
  options: { contentLength?: number; ok?: boolean } = {},
) => {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk)
      controller.close()
    },
  })
  const headers = new Headers()
  if (options.contentLength !== undefined) {
    headers.set('Content-Length', String(options.contentLength))
  }
  return new Response(stream, { status: options.ok === false ? 500 : 200, headers })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

test('resolves to a Blob containing every streamed chunk', async () => {
  const chunks = [new Uint8Array([1, 2, 3]), new Uint8Array([4, 5])]
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => makeResponse(chunks)),
  )

  const blob = await downloadWithProgress('/file', vi.fn(), new AbortController().signal)

  expect(blob.size).toBe(5)
})

test('reports progress as a percentage of Content-Length', async () => {
  const chunks = [new Uint8Array(50), new Uint8Array(50)]
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => makeResponse(chunks, { contentLength: 100 })),
  )
  const onProgress = vi.fn()

  await downloadWithProgress('/file', onProgress, new AbortController().signal)

  expect(onProgress).toHaveBeenNthCalledWith(1, 50)
  expect(onProgress).toHaveBeenNthCalledWith(2, 100)
})

test('never calls onProgress when Content-Length is missing', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => makeResponse([new Uint8Array(10)])),
  )
  const onProgress = vi.fn()

  await downloadWithProgress('/file', onProgress, new AbortController().signal)

  expect(onProgress).not.toHaveBeenCalled()
})

test('throws when the response is not ok', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => makeResponse([], { ok: false })),
  )

  await expect(
    downloadWithProgress('/file', vi.fn(), new AbortController().signal),
  ).rejects.toThrow('ダウンロードに失敗しました')
})
