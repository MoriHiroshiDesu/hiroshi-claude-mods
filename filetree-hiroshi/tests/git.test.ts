import { expect, test } from 'claude-code/testing'

import { codeAt, countChanged, load, parseNumstat, parseStatus, rollUp } from '../hooks/git'

const z = (...records: string[]) => `${records.join('\0')}\0`
const ONE = '1 .M N... 100644 100644 100644 aaa aaa'

test('parseStatus reads the branch, ahead and behind, and each path by its code', () => {
  const out = z(
    '# branch.oid abcdef1234',
    '# branch.head main',
    '# branch.upstream origin/main',
    '# branch.ab +2 -1',
    `${ONE} src/a.ts`,
    '1 A. N... 000000 100644 100644 000 bbb src/new.ts',
    '1 .D N... 100644 100644 000000 ccc ccc gone.ts',
    '2 R. N... 100644 100644 100644 ddd ddd R100 src/to.ts',
    'src/from.ts',
    'u UU N... 100644 100644 100644 100644 e1 e2 e3 both.ts',
    '? notes/',
    '? with space.md',
    '! node_modules/',
  )
  const s = parseStatus(out, '/w')
  expect(s).toMatchObject({ branch: 'main', isDetached: false, ahead: 2, behind: 1 })
  expect(s.files).toEqual({
    '/w/src/a.ts': 'M',
    '/w/src/new.ts': 'A',
    '/w/gone.ts': 'D',
    '/w/src/to.ts': 'R',
    '/w/both.ts': 'U',
    '/w/notes': '?',
    '/w/with space.md': '?',
    '/w/node_modules': '!',
  })
})

test('a detached HEAD shows the short hash', () => {
  expect(parseStatus(z('# branch.oid abcdef1234', '# branch.head (detached)'), '/w')).toMatchObject({ branch: 'abcdef1', isDetached: true })
})

test('parseNumstat reads plain, renamed and binary files', () => {
  const out = z('12\t3\tsrc/a.ts', '4\t0\t', 'src/from.ts', 'src/to.ts', '-\t-\tlogo.png')
  expect(parseNumstat(out, '/w')).toEqual({ '/w/src/a.ts': [12, 3], '/w/src/to.ts': [4, 0], '/w/logo.png': [0, 0] })
})

test('rollUp sums each file on every folder above it, up to the top', () => {
  const lines = rollUp({ '/w/src/a.ts': [12, 3], '/w/src/lib/b.ts': [1, 1], '/w/README.md': [2, 0] }, '/w')
  expect(lines['/w/src']).toEqual([13, 4])
  expect(lines['/w/src/lib']).toEqual([1, 1])
  expect(lines['/w']).toEqual([15, 4])
  expect(lines['/']).toBeUndefined()
})

test('countChanged leaves ignored paths out', () => {
  expect(countChanged({ '/w/src/a.ts': 'M', '/w/node_modules': '!', '/w/b.ts': '?' }, '/w')).toEqual({ '/w/src': 1, '/w': 2 })
})

test('codeAt takes a folder git reports whole for what lies in it', () => {
  const git = { top: '/w', branch: 'main', isDetached: false, ahead: 0, behind: 0, changed: {}, lines: {}, files: { '/w/notes': '?', '/w/node_modules': '!', '/w/src/a.ts': 'M' } as const }
  expect(codeAt(git, '/w/notes/todo/x.md')).toBe('?')
  expect(codeAt(git, '/w/node_modules/pkg/index.js')).toBe('!')
  expect(codeAt(git, '/w/src/a.ts')).toBe('M')
  expect(codeAt(git, '/w/src/b.ts')).toBeUndefined()
})

test('load reads git from the session folder, a subfolder of the repository', async () => {
  const asked: string[][] = []
  const git = await load(async argv => {
    asked.push(argv)
    if (argv.includes('rev-parse')) return { exitCode: 0, stdout: '/repo\n/repo/.git\n' }
    if (argv.includes('status')) return { exitCode: 0, stdout: z('# branch.oid abc', '# branch.head main', `${ONE} app/src/a.ts`) }
    return { exitCode: 0, stdout: z('5\t1\tapp/src/a.ts') }
  }, '/repo/app')
  expect(asked.every(argv => argv.slice(0, 4).join(' ') === 'git -C /repo/app --no-optional-locks')).toBe(true)
  expect(git.top).toBe('/repo')
  expect(git.files).toEqual({ '/repo/app/src/a.ts': 'M' })
  expect(git.lines['/repo/app']).toEqual([5, 1])
})

test('outside a repository there is nothing to show', async () => {
  const git = await load(async () => ({ exitCode: 128, stdout: '' }), '/tmp/x')
  expect(git.top).toBe('')
})
