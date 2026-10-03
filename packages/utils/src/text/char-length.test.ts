import { expect, test } from 'vite-plus/test'

import { charLength, truncateChars } from './char-length.ts'

test('counts full-width and half-width characters as one each', () => {
  expect(charLength('はなこ')).toBe(3)
  expect(charLength('abc')).toBe(3)
  expect(charLength('ﾊﾅｺ')).toBe(3)
})

test('counts a surrogate pair as one character', () => {
  expect(charLength('𠮷野家')).toBe(3)
})

test('counts a combined emoji as one character', () => {
  expect(charLength('👨‍👩‍👧')).toBe(1)
})

test('truncateChars keeps the first N characters without splitting one', () => {
  expect(truncateChars('はなこ', 2)).toBe('はな')
  expect(truncateChars('👨‍👩‍👧abc', 2)).toBe('👨‍👩‍👧a')
  expect(truncateChars('abc', 5)).toBe('abc')
})
