import { afterEach, expect, test, vi } from 'vite-plus/test'
import { effectScope, ref } from 'vue'

import { useTurnstile } from './useTurnstile.ts'

afterEach(() => {
  vi.unstubAllGlobals()
})

test('renders immediately when `active` starts out already true, not only on a later false→true transition', async () => {
  // Regression test: an HMR remount while already authenticated (Pinia's auth state survives the
  // remount, but the view's local `phase` resets to its default) can hand `useTurnstile` an
  // `active` ref that's already `true` at setup — there's never a later transition to react to.
  const render = vi.fn(() => 'widget-1')
  const remove = vi.fn()
  vi.stubGlobal('window', { turnstile: { render, remove } })

  const scope = effectScope()
  await scope.run(async () => {
    const container = ref({} as HTMLElement)
    useTurnstile({
      siteKey: 'test-site-key',
      action: 'create_transfer',
      container,
      active: ref(true),
    })

    await vi.waitFor(() => expect(render).toHaveBeenCalledWith(container.value, expect.anything()))
  })
  scope.stop()
})
