import { expect, test } from 'claude-code/testing'

import { isInline, tailOf } from './register'

test('isInline takes the tool-diet line and a clear, and leaves other statuses alone', () => {
  expect(isInline('10 tools on demand')).toBe(true)
  expect(isInline(undefined)).toBe(true)
  expect(isInline('polling')).toBe(false)
})

test('tailOf draws the held text after a separator, and nothing when none is held', () => {
  expect(tailOf('10 tools on demand')).toBe('  ·  ⚠ 10 tools on demand')
  expect(tailOf(undefined)).toBeUndefined()
})
