import { expect, test } from 'claude-code/testing'

import { label, modelName } from './register'

test('modelName reads the new id shape', () => {
  expect(modelName('claude-sonnet-5-5')).toBe('sonnet 5.5')
  expect(modelName('claude-haiku-5-5')).toBe('haiku 5.5')
  expect(modelName('claude-fable-5-1')).toBe('fable 5.1')
})

test('modelName reads the old id shape and drops the date', () => {
  expect(modelName('claude-3-5-sonnet-20241022')).toBe('sonnet 3.5')
  expect(modelName('claude-opus-4-1-20250805')).toBe('opus 4.1')
})

test('modelName keeps an alias and the context suffix', () => {
  expect(modelName('sonnet')).toBe('sonnet')
  expect(modelName('claude-opus-5-5[1m]')).toBe('opus 5.5 1m')
})

test('label joins model and effort, and is empty with no model', () => {
  expect(label('claude-sonnet-5-5', 'high')).toBe('sonnet 5.5 · high')
  expect(label('claude-sonnet-5-5', '')).toBe('sonnet 5.5')
  expect(label('', 'high')).toBe('')
})
