import { expect, test } from 'vite-plus/test'
import { createMemoryHistory, createRouter } from 'vue-router'

import { routes } from './routes.ts'

test('resolves the home route', () => {
  const router = createRouter({ history: createMemoryHistory(), routes })

  const resolved = router.resolve('/')

  expect(resolved.name).toBe('home')
})

test('resolves the uploader route', () => {
  const router = createRouter({ history: createMemoryHistory(), routes })

  const resolved = router.resolve('/uploader')

  expect(resolved.name).toBe('uploader')
})

test('resolves the downloader route', () => {
  const router = createRouter({ history: createMemoryHistory(), routes })

  const resolved = router.resolve('/downloader')

  expect(resolved.name).toBe('downloader')
})

test('has no match for an unknown path', () => {
  const router = createRouter({ history: createMemoryHistory(), routes })

  const resolved = router.resolve('/does-not-exist')

  expect(resolved.matched).toHaveLength(0)
})
