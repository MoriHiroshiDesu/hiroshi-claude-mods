import { expect, test } from 'claude-code/testing'
import type { FsEntry } from 'claude-code'

import { moreLabel, project, spreadOut } from '../hooks/focus'
import type { FocusRow } from '../hooks/focus'
import { emptyTree, expand, visibleRows, withChildren } from '../hooks/tree'

const file = (name: string): FsEntry => ({ name, kind: 'file', size: 1, mtimeMs: 0, isLink: false })
const dir = (name: string): FsEntry => ({ name, kind: 'dir', size: 0, mtimeMs: 0, isLink: false })
const fifty = Array.from({ length: 50 }, (_, i) => file(`f${String(i).padStart(2, '0')}.ts`))

// /w: a file deep in src/a/b, fifty files, then README.md at the bottom; every folder read and open.
function deepTree() {
  let t = withChildren(emptyTree('/w'), '/w', [dir('src'), ...fifty, file('README.md')])
  t = withChildren(t, '/w/src', [dir('a'), file('z.ts')])
  t = withChildren(t, '/w/src/a', [dir('b')])
  t = withChildren(t, '/w/src/a/b', [file('x.ts'), file('y.ts')])
  return expand(t, ['/w/src', '/w/src/a', '/w/src/a/b'])
}

const shown = (rows: FocusRow[]) =>
  rows.map(row => `${'  '.repeat(row.depth)}${row.kind === 'more' ? moreLabel(row.count, row.what) : `${row.isOpen ? '▾ ' : ''}${row.label}`}`)

test('two files far apart in the tree show together, the rest summed up', () => {
  const t = deepTree()
  expect(visibleRows(t).length).toBe(57)
  const rows = project(t, ['/w/src/a/b/x.ts', '/w/README.md'])
  expect(shown(rows)).toEqual(['▾ src/a/b', '  x.ts', '  ⋯ 1 arquivo', '⋯ 50 arquivos', 'README.md'])
  expect(rows.length).toBeLessThan(10)
})

test('hidden folders and files together are items, folders alone are folders', () => {
  let t = withChildren(emptyTree('/w'), '/w', [dir('a'), dir('b'), dir('c'), file('m.ts'), file('n.ts')])
  t = withChildren(t, '/w/c', [file('k.ts')])
  expect(shown(project(t, ['/w/c/k.ts']))).toEqual(['⋯ 2 pastas', '▾ c', '  k.ts', '⋯ 2 arquivos'])
  expect(shown(project(t, ['/w/n.ts']))).toEqual(['⋯ 4 itens', 'n.ts'])
})

test('a folder that is a target itself shows closed', () => {
  const t = deepTree()
  expect(shown(project(t, ['/w/src/a']))).toEqual(['▾ src', '  a', '  ⋯ 1 arquivo', '⋯ 51 arquivos'])
})

test('focus only shapes the drawing: the tree is left as it was', () => {
  const t = deepTree()
  const before = JSON.stringify(t)
  project(t, ['/w/src/a/b/x.ts', '/w/README.md'])
  expect(JSON.stringify(t)).toBe(before)
  expect(project(t, [])).toEqual([])
  expect(project(t, ['/elsewhere/x.ts', '/w'])).toEqual([])
})

test('files are spread out when the rows between them outnumber the room', () => {
  const t = deepTree()
  expect(spreadOut(t, ['/w/src/a/b/x.ts', '/w/README.md'], 20)).toBe(true)
  expect(spreadOut(t, ['/w/src/a/b/x.ts', '/w/README.md'], 60)).toBe(false)
  expect(spreadOut(t, ['/w/src/a/b/x.ts', '/w/src/a/b/y.ts'], 20)).toBe(false)
  expect(spreadOut(t, ['/w/README.md'], 1)).toBe(false) // one file is never spread out
})
