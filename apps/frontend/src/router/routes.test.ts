import { expect, test } from 'vite-plus/test'
import { createMemoryHistory, createRouter } from 'vue-router'

import { routes } from './routes.ts'

test('resolves the home route', () => {
  const router = createRouter({ history: createMemoryHistory(), routes })

  const resolved = router.resolve('/')

  expect(resolved.name).toBe('home')
})

test('resolves the sample route', () => {
  const router = createRouter({ history: createMemoryHistory(), routes })

  const resolved = router.resolve('/sample')

  expect(resolved.name).toBe('sample')
})

test('has no match for an unknown path', () => {
  const router = createRouter({ history: createMemoryHistory(), routes })

  const resolved = router.resolve('/does-not-exist')

  expect(resolved.matched).toHaveLength(0)
})
