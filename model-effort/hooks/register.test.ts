import { expect, test } from 'claude-code/testing'

import { effortColor, modelColor, modelName } from './register'

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

test('modelColor is green up to sonnet and red from opus up', () => {
  expect(modelColor('claude-haiku-5-5')).toBe('success')
  expect(modelColor('claude-sonnet-5-5')).toBe('success')
  expect(modelColor('sonnet')).toBe('success')
  expect(modelColor('claude-opus-5-5[1m]')).toBe('error')
  expect(modelColor('claude-fable-5-1')).toBe('error')
  expect(modelColor('default')).toBeUndefined()
})

test('effortColor is green up to high and red above it', () => {
  expect(effortColor('low')).toBe('success')
  expect(effortColor('medium')).toBe('success')
  expect(effortColor('high')).toBe('success')
  expect(effortColor('xhigh')).toBe('error')
  expect(effortColor('max')).toBe('error')
  expect(effortColor('')).toBeUndefined()
})
