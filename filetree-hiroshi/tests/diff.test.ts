import { expect, test } from 'claude-code/testing'

import { clipHunks, countLines, hunksOf, layout, normalizeChange, recordChange } from '../hooks/diff'
import type { Hunk } from '../types'

const hunk = (newStart: number, lines: string[]): Hunk => ({ oldStart: newStart, newStart, lines })

test('an Edit result gives its hunks', () => {
  const result = {
    filePath: '/w/a.ts',
    structuredPatch: [{ oldStart: 4, oldLines: 2, newStart: 4, newLines: 2, lines: [' keep', '-old', '+new', '\\ No newline at end of file'] }],
  }
  expect(hunksOf(result)).toEqual([{ oldStart: 4, newStart: 4, lines: [' keep', '-old', '+new'] }])
  expect(hunksOf(undefined)).toEqual([])
  expect(hunksOf({ structuredPatch: [{ oldStart: 'x' }] })).toEqual([])
})

test('a new file written whole is one hunk of added lines', () => {
  expect(hunksOf({ type: 'create', content: 'a\nb\n', structuredPatch: [] })).toEqual([{ oldStart: 0, newStart: 1, lines: ['+a', '+b'] }])
  expect(hunksOf({ type: 'update', content: 'a\n', structuredPatch: [] })).toEqual([])
})

test('a file written again moves to the top, its new hunks first, the counts summed', () => {
  let changes = recordChange([], '/w/a.ts', false, 1, [hunk(1, ['-x', '+y'])])
  changes = recordChange(changes, '/w/b.ts', false, 2, [hunk(1, ['+b'])])
  changes = changes.map(c => (c.path === '/w/a.ts' ? { ...c, expanded: false } : c))
  changes = recordChange(changes, '/w/a.ts', false, 3, [hunk(9, ['+z', '+w'])])
  expect(changes.map(c => c.path)).toEqual(['/w/a.ts', '/w/b.ts'])
  expect(changes[0]).toMatchObject({ added: 3, removed: 1, expanded: false, at: 3 })
  expect(changes[0]?.hunks.map(h => h.newStart)).toEqual([9, 1])
  expect(countLines(changes[0]?.hunks ?? [])).toEqual([3, 1])
})

test('a cut hunk keeps a header that counts only the lines kept', () => {
  const clip = clipHunks([hunk(10, [' a', '-b', '+c', '+d', ' e']), hunk(40, ['+f'])], 3)
  expect(clip.source).toBe('@@ -10,2 +10,2 @@\n a\n-b\n+c')
  expect(clip).toMatchObject({ shown: 3, rest: 3, parts: 1 })
  expect(clipHunks([hunk(1, ['+\tx'])], 5).source).toBe('@@ -1,0 +1,1 @@\n+  x')
})

test('the section opens the newest file and fits the rows it has', () => {
  let changes = recordChange([], '/w/old.ts', false, 1, [hunk(1, ['+1', '+2'])])
  changes = recordChange(changes, '/w/new.ts', false, 2, [hunk(1, Array.from({ length: 30 }, (_, i) => `+${i}`))])
  const { blocks, left } = layout(changes, 10)
  expect(blocks.map(b => [b.change.path, b.isOpen])).toEqual([['/w/new.ts', true], ['/w/old.ts', false]])
  expect(blocks.reduce((sum, b) => sum + b.rows, 0)).toBeLessThanOrEqual(10)
  expect(blocks[0]?.rest).toBeGreaterThan(0)
  expect(left).toBe(0)
})

test('files that do not fit are counted, and a person-opened older file shows its lines', () => {
  let changes = recordChange([], '/w/a.ts', false, 1, [hunk(1, ['+a'])])
  changes = recordChange(changes, '/w/b.ts', false, 2, [hunk(1, ['+b'])])
  changes = recordChange(changes, '/w/c.ts', false, 3, [hunk(1, ['+c'])])
  // two rows: the newest file's header and one of its lines; the other two are counted
  expect(layout(changes, 2).left).toBe(2)
  const opened = changes.map(c => (c.path === '/w/a.ts' ? { ...c, expanded: true } : c.path === '/w/c.ts' ? { ...c, expanded: false } : c))
  const { blocks } = layout(opened, 10)
  expect(blocks.map(b => [b.change.path, b.isOpen, b.shown])).toEqual([['/w/c.ts', false, 0], ['/w/b.ts', false, 0], ['/w/a.ts', true, 1]])
})

test('a change kept by an older version of the mod is brought to today\'s shape', () => {
  expect(normalizeChange({ path: '/w/a.ts', outside: false, at: 5 })).toEqual({ path: '/w/a.ts', outside: false, at: 5, hunks: [], added: 0, removed: 0 })
  const old = normalizeChange({ path: '/w/b.ts' } as any)
  expect(layout([old], 5).blocks.map(b => b.rows)).toEqual([1])
})
