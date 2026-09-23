import { nextTick, onScopeDispose, ref, watch, type Ref } from 'vue'

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string
          action?: string
          callback: (token: string) => void
          'error-callback'?: () => void
          'expired-callback'?: () => void
        },
      ) => string
      reset: (widgetId: string) => void
      remove: (widgetId: string) => void
    }
  }
}

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js'

let scriptReady: Promise<void> | null = null

/** Loads the Turnstile script once — mirrors `stores/auth.ts`'s `loadGoogleScript`. */
const loadTurnstileScript = (): Promise<void> => {
  scriptReady ??= new Promise((resolve, reject) => {
    if (window.turnstile) {
      resolve()
      return
    }
    const script = document.createElement('script')
    script.src = SCRIPT_SRC
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load Turnstile'))
    document.head.appendChild(script)
  })
  return scriptReady
}

export interface UseTurnstileOptions {
  /** No fallback default: this repo is OSS, and a widget is pinned to the domain(s) it was
   * registered for, so reusing someone else's wouldn't work anyway — every deployer creates their
   * own (Cloudflare dashboard → Turnstile → Add widget). `undefined` shows `onError` instead of
   * rendering. */
  siteKey: string | undefined
  action: string
  container: Ref<HTMLElement | null>
  /** Widget mounts while this is `true` and unmounts (clearing the token) otherwise — bind it to,
   * e.g., `computed(() => isAuthenticated.value && phase.value === 'select')` so the widget only
   * exists while its container is actually on screen. */
  active: Ref<boolean>
  onError?: (message: string) => void
}

/** docs/spec.md section 9 — gates Transfer Session creation behind a bot check. Owns the widget's
 * whole lifecycle (script load, render, teardown) so the view only ever reads `token`. */
export const useTurnstile = (options: UseTurnstileOptions) => {
  const token = ref('')
  let widgetId: string | null = null

  const remove = () => {
    if (widgetId && window.turnstile) window.turnstile.remove(widgetId)
    widgetId = null
    token.value = ''
  }

  const render = async () => {
    if (!options.siteKey) {
      options.onError?.(
        'Turnstileが設定されていません。VITE_TURNSTILE_SITE_KEY を設定してください。',
      )
      return
    }
    try {
      await loadTurnstileScript()
    } catch (error) {
      console.error('Failed to load Turnstile:', error)
      options.onError?.('ボット確認の読み込みに失敗しました。ページを再読み込みしてください。')
      return
    }
    if (!options.container.value || !window.turnstile) return
    widgetId = window.turnstile.render(options.container.value, {
      sitekey: options.siteKey,
      action: options.action,
      callback: (t) => {
        token.value = t
      },
      'error-callback': () => {
        token.value = ''
      },
      'expired-callback': () => {
        token.value = ''
      },
    })
  }

  // `immediate: true` — without it, a consumer that mounts with `active` already `true` (e.g. an
  // HMR remount while already authenticated, where Pinia's auth state survives the remount but
  // local `phase` resets to its default) would never see a false→true transition, so the widget
  // would never render and `token` would stay empty forever.
  watch(
    options.active,
    async (shouldRender) => {
      if (shouldRender) {
        await nextTick()
        await render()
      } else {
        remove()
      }
    },
    { immediate: true },
  )

  onScopeDispose(remove)

  return { token }
}
