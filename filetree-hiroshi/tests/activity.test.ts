import { expect, test } from 'claude-code/testing'

import { ACTIVE_MS, activeFolders, gitChanges, mark, markOf, pathWords, shownPath } from '../hooks/activity'
import { noGit } from '../hooks/git'

test('a path is active while a call runs or shortly after, then recent', () => {
  let acts = mark({}, ['/w/a.ts'], 'read', 1000, 1)
  expect(markOf(acts['/w/a.ts'], 1000 + ACTIVE_MS * 10)).toBe('active') // still running
  acts = mark(acts, ['/w/a.ts'], 'read', 2000, -1)
  expect(markOf(acts['/w/a.ts'], 2000 + ACTIVE_MS - 1)).toBe('active')
  expect(markOf(acts['/w/a.ts'], 2000 + ACTIVE_MS)).toBe('recent')
  expect(markOf(undefined, 0)).toBeUndefined()
})

test('a read right after a write keeps the write tone while it is active', () => {
  let acts = mark({}, ['/w/a.ts'], 'write', 1000, 0)
  acts = mark(acts, ['/w/a.ts'], 'read', 2000, 0)
  expect(acts['/w/a.ts']?.tone).toBe('write')
  acts = mark(acts, ['/w/a.ts'], 'read', 2000 + ACTIVE_MS, 0)
  expect(acts['/w/a.ts']?.tone).toBe('read')
})

test('folders above an active path carry its tone, a write winning', () => {
  let acts = mark({}, ['/w/src/lib/a.ts'], 'read', 0, 0)
  acts = mark(acts, ['/w/src/b.ts'], 'write', 0, 0)
  const dirs = activeFolders(acts, 10, '/w')
  expect([...dirs.entries()].sort()).toEqual([['/w/src', 'write'], ['/w/src/lib', 'read']])
  expect(activeFolders(acts, ACTIVE_MS + 10, '/w').size).toBe(0)
})

test('a change is named from the session folder, from ~, or in full', () => {
  expect(shownPath('/w/src/a.ts', '/w', '/home/u')).toBe('src/a.ts')
  expect(shownPath('/home/u/.config/x.toml', '/w', '/home/u')).toBe('~/.config/x.toml')
  expect(shownPath('/etc/hosts', '/w', '/home/u')).toBe('/etc/hosts')
})

test('the words of a shell command that may be files', () => {
  expect(pathWords("sed -n 1,40p src/main.ts | head -5 && cat 'README.md' > /tmp/out.txt")).toEqual(['src/main.ts', 'README.md', '/tmp/out.txt'])
  expect(pathWords('ls src/*.ts $HOME/x')).toEqual([])
})

test('git shows which files a shell command changed', () => {
  const before = { ...noGit(), top: '/w', files: { '/w/a.ts': 'M' as const }, lines: { '/w/a.ts': [1, 0] as [number, number] } }
  const after = {
    ...before,
    files: { '/w/a.ts': 'M' as const, '/w/b.ts': '?' as const, '/w/dist': '!' as const },
    lines: { '/w/a.ts': [3, 0] as [number, number] },
  }
  expect(gitChanges(before, after).sort()).toEqual(['/w/a.ts', '/w/b.ts'])
  expect(gitChanges(after, after)).toEqual([])
})
