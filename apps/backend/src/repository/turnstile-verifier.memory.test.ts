import { expect, test } from 'vite-plus/test'

import { createTurnstileVerifier, TEST_PASS_TOKEN } from './turnstile-verifier.memory.ts'

test('accepts the fixed test-pass token', async () => {
  const verifier = createTurnstileVerifier()

  expect(await verifier.verify(TEST_PASS_TOKEN, undefined)).toBe(true)
})

test('rejects anything else, including empty', async () => {
  const verifier = createTurnstileVerifier()

  expect(await verifier.verify('wrong-token', undefined)).toBe(false)
  expect(await verifier.verify('', undefined)).toBe(false)
})
