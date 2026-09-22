import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { apiClient } from '../api/client.ts'
import { useNotificationStore } from './notification.ts'

interface GoogleCredentialResponse {
  credential: string
}

interface GoogleButtonOptions {
  type: 'standard' | 'icon'
  theme: 'outline' | 'filled_blue' | 'filled_black'
  size: 'large' | 'medium' | 'small'
  shape: 'rectangular' | 'pill' | 'circle' | 'square'
  text: 'signin_with' | 'signup_with' | 'continue_with' | 'signin'
  width: number
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string
            callback: (response: GoogleCredentialResponse) => void
          }) => void
          renderButton: (parent: HTMLElement, options: GoogleButtonOptions) => void
        }
      }
    }
  }
}

// No fallback here on purpose: this project is OSS, so a hardcoded default would silently point
// every fork/clone at the original author's own Google Cloud OAuth client. Each deployer creates
// their own (Google Cloud Console → APIs & Services → Credentials) and sets it via
// `VITE_GOOGLE_CLIENT_ID` — see README.md.
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined
const GSI_SCRIPT_SRC = 'https://accounts.google.com/gsi/client'

let gsiReady: Promise<void> | null = null

/** Loads the Google Identity Services script once, however many views need it. */
const loadGoogleScript = (): Promise<void> => {
  gsiReady ??= new Promise((resolve, reject) => {
    if (window.google?.accounts.id) {
      resolve()
      return
    }
    const script = document.createElement('script')
    script.src = GSI_SCRIPT_SRC
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load Google Identity Services'))
    document.head.appendChild(script)
  })
  return gsiReady
}

/** Reads the email out of the ID token for display only — the backend independently verifies
 * the token's signature; this client-side decode is never trusted for anything security-sensitive. */
const decodeEmail = (idToken: string): string | null => {
  try {
    const payload = idToken.split('.')[1] ?? ''
    const json: unknown = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))
    const email = (json as { email?: unknown }).email
    return typeof email === 'string' ? email : null
  } catch {
    return null
  }
}

/** Global auth state: whether the user has completed Google Sign-In, and our own short-lived
 * session token (sent as `Authorization: Bearer <token>` by `src/api/client.ts`). */
export const useAuthStore = defineStore('auth', () => {
  const notification = useNotificationStore()
  const token = ref<string | null>(null)
  const email = ref<string | null>(null)
  const isAuthenticated = computed(() => token.value !== null)

  // No try/catch swallows a failure here silently — Google's own script invokes this callback,
  // so an uncaught error here would otherwise never reach the user.
  const handleCredential = async (response: GoogleCredentialResponse) => {
    try {
      const res = await apiClient.api.auth.google.$post({ json: { idToken: response.credential } })
      if (!res.ok) {
        notification.show('ログインに失敗しました。もう一度お試しください。')
        return
      }
      const body = await res.json()
      token.value = body.token
      email.value = decodeEmail(response.credential)
    } catch (error) {
      console.error('Google sign-in failed:', error)
      notification.show(
        'サーバーに接続できませんでした。バックエンドが起動しているか確認してください。',
      )
    }
  }

  /** Mounts Google's own "Sign in with Google" button into `el`; the callback exchanges the
   * resulting ID token for our session token via `POST /api/auth/google`. */
  const renderSignInButton = async (el: HTMLElement) => {
    if (!GOOGLE_CLIENT_ID) {
      notification.show(
        'Google Sign-Inが設定されていません。VITE_GOOGLE_CLIENT_ID を設定してください。',
      )
      return
    }
    await loadGoogleScript()
    window.google?.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: handleCredential,
    })
    window.google?.accounts.id.renderButton(el, {
      type: 'standard',
      theme: 'outline',
      size: 'large',
      shape: 'rectangular',
      text: 'signin_with',
      width: 320,
    })
  }

  const signOut = () => {
    token.value = null
    email.value = null
  }

  return { token, email, isAuthenticated, renderSignInButton, signOut }
})
