import { expect, test } from 'vite-plus/test'

import { extractQrSecret } from './qr.ts'

test('extracts the secret from a downloader URL', () => {
  expect(extractQrSecret('https://example.com/downloader?secret=abc123')).toBe('abc123')
})

test('accepts a bare 64-char hex secret', () => {
  const secret = 'a'.repeat(64)
  expect(extractQrSecret(secret)).toBe(secret)
})

test('accepts a bare secret with surrounding whitespace', () => {
  const secret = 'b'.repeat(64)
  expect(extractQrSecret(`  ${secret}  `)).toBe(secret)
})

test('is case-insensitive for the bare hex form', () => {
  const secret = 'A'.repeat(64)
  expect(extractQrSecret(secret)).toBe(secret)
})

test('returns null for a URL with no secret query param', () => {
  expect(extractQrSecret('https://example.com/downloader')).toBeNull()
})

test('returns null for text that is neither a URL nor a 64-char hex string', () => {
  expect(extractQrSecret('not a secret')).toBeNull()
  expect(extractQrSecret('a'.repeat(63))).toBeNull()
  expect(extractQrSecret('g'.repeat(64))).toBeNull()
})
