import { expect, test } from 'claude-code/testing'
import type { GitInfo } from '../types'

import { clip, linesColumn, load, parseColumns, parseCommit, parseStatus, placeColumn, rowSegments, treeColumn } from './register'

const FS = '\x1f'

const base: GitInfo = {
  head: 'main', isDetached: false, ahead: 0, behind: 0, staged: 0, modified: 0, untracked: 0, deleted: 0,
}
const commit = { hash: 'abc1234', subject: 'feat: x', author: 'me', when: '2 hours ago', added: 12, removed: 3 }
const text = (segs: { text: string }[]) => segs.map(seg => seg.text).join('')

test('parseStatus reads branch and ahead/behind', () => {
  const out = '# branch.oid abcdef1234567890\n# branch.head main\n# branch.upstream origin/main\n# branch.ab +2 -1\n'
  expect(parseStatus(out)).toMatchObject({ head: 'main', isDetached: false, ahead: 2, behind: 1 })
})

test('parseStatus counts each path once, by kind', () => {
  const out = [
    '# branch.head main',
    '1 M. N... 100644 100644 100644 a b staged.ts',
    '1 A. N... 000000 100644 100644 a b added.ts',
    '1 .M N... 100644 100644 100644 a b edited.ts',
    '1 MM N... 100644 100644 100644 a b both.ts',
    '2 R. N... 100644 100644 100644 a b R100 new.ts\told.ts',
    '1 .D N... 100644 100644 000000 a b gone.ts',
    '1 D. N... 100644 000000 000000 a b gone-staged.ts',
    'u UU N... 100644 100644 100644 100644 a b c conflict.ts',
    '? one.txt',
    '? two.txt',
  ].join('\n')
  expect(parseStatus(out)).toMatchObject({ staged: 3, modified: 3, untracked: 2, deleted: 2 })
})

test('parseStatus shows the short hash when HEAD is detached', () => {
  const out = '# branch.oid abcdef1234567890\n# branch.head (detached)\n'
  expect(parseStatus(out)).toMatchObject({ head: 'abcdef1', isDetached: true })
})

test('parseCommit sums lines added and removed, skipping binary files', () => {
  const out = `abc123${FS}feat: x${FS}Hiroshi${FS}2 hours ago\n\n10\t2\ta.ts\n-\t-\timg.png\n3\t0\tb.ts\n`
  expect(parseCommit(out)).toEqual({
    hash: 'abc123', subject: 'feat: x', author: 'Hiroshi', when: '2 hours ago', added: 13, removed: 2,
  })
})

test('parseCommit is undefined for an empty log', () => {
  expect(parseCommit('')).toBeUndefined()
})

test('clip cuts with an ellipsis', () => {
  expect(clip('abcdef', 4)).toBe('abc…')
  expect(clip('abc', 4)).toBe('abc')
})

test('column 1 tells the main checkout from a linked worktree', () => {
  expect(text(placeColumn(base))).toBe('⎇ main')
  expect(text(placeColumn({ ...base, worktree: 'feat-x', head: 'feat/x' }))).toBe('❖ feat-x ⎇ feat/x')
  expect(text(placeColumn({ ...base, worktree: 'dark-mode', head: 'refactor/dark-mode' }))).toBe('❖ ⎇ refactor/dark-mode')
  expect(text(placeColumn({ ...base, worktree: 'main', head: 'main' }))).toBe('❖ ⎇ main')
  expect(text(placeColumn({ ...base, worktree: 'mode', head: 'refactor/dark-mode' }))).toBe('❖ mode ⎇ refactor/dark-mode')
  expect(text(placeColumn({ ...base, ahead: 2, behind: 1 }))).toBe('⎇ main ↑2 ↓1')
  expect(placeColumn({ ...base, worktree: 'w' })[0]?.color).toBe('magenta')
  expect(placeColumn(base)[0]?.color).toBe('cyan')
})

test('column 2 colors each kind and skips the empty ones', () => {
  const segs = treeColumn({ ...base, staged: 1, modified: 2, untracked: 3, deleted: 4 })
  expect(text(segs)).toBe('●1 ~2 ?3 ✖4')
  expect(segs.filter(seg => seg.color !== undefined).map(seg => seg.color)).toEqual(['green', 'yellow', 'cyan', 'red'])
  expect(text(treeColumn({ ...base, modified: 2 }))).toBe('~2')
  expect(text(treeColumn(base))).toBe('✓')
})

test('column 4 is the last commit lines, green then red', () => {
  const segs = linesColumn(commit)
  expect(text(segs)).toBe('+12 -3')
  expect(segs.map(seg => seg.color)).toEqual(['green', undefined, 'red'])
})

test('the row has the four columns and fits the width, the subject giving way', () => {
  const long = { ...base, modified: 1, commit: { ...commit, subject: 'x'.repeat(200) } }
  const row = text(rowSegments(long, 80))
  expect(row.length).toBeLessThanOrEqual(80)
  expect(row.startsWith('⎇ main │ ~1 │ abc1234 xxx')).toBe(true)
  expect(row.endsWith('… · 2 hours ago │ +12 -3')).toBe(true)
  expect(text(rowSegments({ ...base, commit }, 200))).toBe('⎇ main │ ✓ │ abc1234 feat: x · 2 hours ago │ +12 -3')
})

test('a repository with no commit shows that in place of columns 3 and 4', () => {
  expect(text(rowSegments(base, 80))).toBe('⎇ main │ ✓ │ sem commits')
})

test('load tells a linked worktree from the main checkout and is null outside a repo', async () => {
  const run = (gitDir: string) => async (argv: string[]) => {
    if (argv[2] === 'status') return { exitCode: 0, stdout: '# branch.oid abc\n# branch.head feat\n' }
    if (argv[2] === 'rev-parse') return { exitCode: 0, stdout: `${gitDir}\n/r/.git\n/w/feat-x\n` }
    return { exitCode: 0, stdout: `abc${FS}msg${FS}me${FS}now\n` }
  }
  expect((await load(run('/r/.git/worktrees/feat-x')))?.worktree).toBe('feat-x')
  expect((await load(run('/r/.git')))?.worktree).toBeUndefined()
  expect(await load(async () => ({ exitCode: 128, stdout: '' }))).toBeNull()
})

test('parseColumns keeps the order given, drops unknown names and repeats', () => {
  expect(parseColumns('commit, branch')).toEqual(['commit', 'branch'])
  expect(parseColumns('Branch,nope,branch,LINES')).toEqual(['branch', 'lines'])
})

test('parseColumns falls back to all four columns when nothing valid is left', () => {
  const all = ['branch', 'changes', 'commit', 'lines']
  expect(parseColumns(undefined)).toEqual(all)
  expect(parseColumns('')).toEqual(all)
  expect(parseColumns('nope')).toEqual(all)
})

test('the row shows only the chosen columns, in the chosen order', () => {
  const row = { ...base, modified: 1, commit }
  expect(text(rowSegments(row, 200, ['branch', 'lines']))).toBe('⎇ main │ +12 -3')
  expect(text(rowSegments(row, 200, ['commit', 'branch']))).toBe('abc1234 feat: x · 2 hours ago │ ⎇ main')
  expect(text(rowSegments(row, 200, ['changes']))).toBe('~1')
})

test('a chosen subject still gives way to the width', () => {
  const long = { ...base, commit: { ...commit, subject: 'x'.repeat(200) } }
  const out = text(rowSegments(long, 60, ['branch', 'commit']))
  expect(out.length).toBeLessThanOrEqual(60)
  expect(out.endsWith('… · 2 hours ago')).toBe(true)
})

test('with no commit, "sem commits" stands for the commit column and lines vanish', () => {
  expect(text(rowSegments(base, 80, ['branch', 'commit', 'lines']))).toBe('⎇ main │ sem commits')
  expect(text(rowSegments(base, 80, ['lines']))).toBe('')
})
