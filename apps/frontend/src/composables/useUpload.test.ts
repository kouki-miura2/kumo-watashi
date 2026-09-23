import { afterEach, expect, test, vi } from 'vite-plus/test'

import { uploadFileWithProgress } from './useUpload.ts'

/** A hand-rolled stand-in for the browser's `XMLHttpRequest`, which doesn't exist in the plain
 * Node environment these tests run in (see apps/frontend/AGENTS.md) — exposes just enough of the
 * surface `uploadFileWithProgress` actually touches. */
class FakeXhr {
  static instances: FakeXhr[] = []
  status = 0
  responseText = ''
  upload: {
    onprogress: ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null
  } = {
    onprogress: null,
  }
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  onabort: (() => void) | null = null
  method = ''
  url = ''
  body: FormData | null = null
  headers: Record<string, string> = {}

  open(method: string, url: string) {
    this.method = method
    this.url = url
  }

  setRequestHeader(name: string, value: string) {
    this.headers[name] = value
  }

  send(body: FormData) {
    this.body = body
    FakeXhr.instances.push(this)
  }

  abort() {
    this.onabort?.()
  }
}

afterEach(() => {
  FakeXhr.instances = []
  vi.unstubAllGlobals()
})

const send = (file = new File(['abc'], 'a.pdf'), headers?: Record<string, string>) => {
  vi.stubGlobal('XMLHttpRequest', FakeXhr)
  const onProgress = vi.fn()
  const controller = new AbortController()
  const promise = uploadFileWithProgress('/upload', file, onProgress, controller.signal, headers)
  return { promise, onProgress, controller, xhr: () => FakeXhr.instances.at(-1)! }
}

test('resolves once the request completes with a 2xx status', async () => {
  const { promise, xhr } = send()

  xhr().status = 201
  xhr().onload?.()

  await expect(promise).resolves.toBeUndefined()
  expect(xhr().method).toBe('POST')
  expect(xhr().url).toBe('/upload')
})

test('sets each given header before sending — the upload route is authenticated, so callers rely on this to attach the session token', async () => {
  const { promise, xhr } = send(undefined, { Authorization: 'Bearer abc123' })

  xhr().status = 201
  xhr().onload?.()

  await promise
  expect(xhr().headers).toEqual({ Authorization: 'Bearer abc123' })
})

test('reports upload progress as it arrives', () => {
  const { onProgress, xhr } = send()

  xhr().upload.onprogress?.({ lengthComputable: true, loaded: 50, total: 200 })

  expect(onProgress).toHaveBeenCalledWith(25)
})

test('rejects with the server-provided reason on a non-2xx response', async () => {
  const { promise, xhr } = send()

  xhr().status = 400
  xhr().responseText = JSON.stringify({ reason: '1ファイルは最大100MBまでです' })
  xhr().onload?.()

  await expect(promise).rejects.toThrow('1ファイルは最大100MBまでです')
})

test('rejects with a generic message when the error body is not JSON', async () => {
  const { promise, xhr } = send()

  xhr().status = 500
  xhr().responseText = 'not json'
  xhr().onload?.()

  await expect(promise).rejects.toThrow('アップロードに失敗しました')
})

test('rejects on a network error', async () => {
  const { promise, xhr } = send()

  xhr().onerror?.()

  await expect(promise).rejects.toThrow('アップロードに失敗しました')
})

test('rejects with an AbortError when the signal aborts', async () => {
  const { promise, controller } = send()

  controller.abort()

  await expect(promise).rejects.toMatchObject({ name: 'AbortError' })
})
