import { expect, test } from 'claude-code/testing'
import type { FsEntry } from 'claude-code'

import { dirname, emptyTree, fitRow, inside, needsListing, sortEntries, toggle, visibleRows, withChildren } from '../hooks/tree'

const file = (name: string): FsEntry => ({ name, kind: 'file', size: 1, mtimeMs: 0, isLink: false })
const dir = (name: string): FsEntry => ({ name, kind: 'dir', size: 0, mtimeMs: 0, isLink: false })
const names = (rows: { node: { name: string }; depth: number }[]) => rows.map(r => `${'  '.repeat(r.depth)}${r.node.name}`)

test('folders come first, then files, in natural order; .git is never listed', () => {
  const sorted = sortEntries([file('file10.ts'), dir('src'), file('File2.ts'), dir('.git'), dir('assets'), file('.env')])
  expect(sorted.map(e => e.name)).toEqual(['assets', 'src', '.env', 'File2.ts', 'file10.ts'])
})

test('the rows are the root children and the open folders below them', () => {
  let t = withChildren(emptyTree('/w'), '/w', [dir('src'), file('README.md')])
  t = withChildren(t, '/w/src', [file('a.ts'), dir('lib')])
  expect(names(visibleRows(t))).toEqual(['src', 'README.md'])
  t = toggle(t, '/w/src')
  expect(names(visibleRows(t))).toEqual(['src', '  lib', '  a.ts', 'README.md'])
  expect(t.cursor).toBe('/w/src')
  t = toggle(t, '/w/src')
  expect(names(visibleRows(t))).toEqual(['src', 'README.md'])
})

test('a folder needs reading until it was listed, even when empty', () => {
  let t = withChildren(emptyTree('/w'), '/w', [dir('empty')])
  expect(needsListing(t, '/w/empty')).toBe(true)
  t = withChildren(t, '/w/empty', [])
  expect(needsListing(t, '/w/empty')).toBe(false)
})

test('a new listing drops what is gone, with everything below it', () => {
  let t = withChildren(emptyTree('/w'), '/w', [dir('old'), file('keep.ts')])
  t = withChildren(t, '/w/old', [file('x.ts')])
  t = toggle(t, '/w/old')
  t = withChildren(t, '/w', [file('keep.ts')])
  expect(Object.keys(t.nodes).sort()).toEqual(['/w', '/w/keep.ts'])
  expect(t.expanded).toEqual(['/w'])
  expect(t.cursor).toBe('/w')
})

test('a listing keeps what an unchanged child had read', () => {
  let t = withChildren(emptyTree('/w'), '/w', [dir('src')])
  t = withChildren(t, '/w/src', [file('a.ts')])
  t = withChildren(t, '/w', [dir('src'), file('new.ts')])
  expect(t.nodes['/w/src']?.children).toEqual(['/w/src/a.ts'])
})

test('paths: parent folder and inside the root', () => {
  expect(dirname('/w/src/a.ts')).toBe('/w/src')
  expect(dirname('/w')).toBe('/')
  expect(inside('/w', '/w/src/a.ts')).toBe(true)
  expect(inside('/w', '/w')).toBe(true)
  expect(inside('/w', '/work/a.ts')).toBe(false)
})

test('a row fits its width: the name cut with an ellipsis, the tail kept flush right', () => {
  expect(fitRow('  ▸ ', 'src', '+12 -3', 20)).toEqual({ name: 'src', pad: '       ', tail: '+12 -3' })
  expect(fitRow('  ', 'a-very-long-file-name.ts', '+1', 20)).toEqual({ name: 'a-very-long-fi…', pad: ' ', tail: '+1' })
  // too narrow for the tail: it goes, and the name takes what is left
  expect(fitRow('          ', 'name.ts', '+100 -200', 16)).toEqual({ name: 'name.…', pad: '', tail: '' })
  expect(fitRow('', 'short', '', 20)).toEqual({ name: 'short', pad: '', tail: '' })
})
