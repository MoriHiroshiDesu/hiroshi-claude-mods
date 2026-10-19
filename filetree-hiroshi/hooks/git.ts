// Git as plain data: the parsers take git's output and `load` takes a runner, so the
// tests drive both without the engine.
import type { GitCode, GitState } from '../types'
import { dirname, inside, posix } from './tree'

export const noGit = (): GitState => ({
  top: '', branch: '', isDetached: false, ahead: 0, behind: 0, files: {}, changed: {}, lines: {},
})

const abs = (top: string, rel: string) => posix(top === '/' ? `/${rel}` : `${top}/${rel}`)

// The path after the first `n` space-separated fields (a path may hold spaces).
const after = (line: string, n: number) => line.split(' ').slice(n).join(' ')

// `1 XY ...`: the index side (X) and the work tree side (Y).
function codeOf(xy: string): GitCode {
  const [x = '.', y = '.'] = xy
  if (x === 'D' || y === 'D') return 'D'
  if (x === 'A') return 'A'
  return 'M'
}

type Status = Pick<GitState, 'branch' | 'isDetached' | 'ahead' | 'behind' | 'files'>

// `git status --porcelain=v2 -z --branch`: NUL-separated records, paths from the top folder.
// A rename (`2 ...`) is followed by one more record, the path it came from.
export function parseStatus(out: string, top: string): Status {
  const status: Status = { branch: '', isDetached: false, ahead: 0, behind: 0, files: {} }
  let oid = ''
  const records = out.split('\0')
  for (let i = 0; i < records.length; i++) {
    const rec = records[i] ?? ''
    if (rec.startsWith('# branch.oid ')) oid = rec.slice(13)
    else if (rec.startsWith('# branch.head ')) status.branch = rec.slice(14)
    else if (rec.startsWith('# branch.ab ')) {
      const match = /^\+(\d+) -(\d+)$/.exec(rec.slice(12))
      if (match) [status.ahead, status.behind] = [Number(match[1]), Number(match[2])]
    } else if (rec.startsWith('1 ')) status.files[abs(top, after(rec, 8))] = codeOf(rec.slice(2, 4))
    else if (rec.startsWith('2 ')) {
      status.files[abs(top, after(rec, 9))] = 'R'
      i++
    } else if (rec.startsWith('u ')) status.files[abs(top, after(rec, 10))] = 'U'
    else if (rec.startsWith('? ')) status.files[abs(top, rec.slice(2))] = '?'
    else if (rec.startsWith('! ')) status.files[abs(top, rec.slice(2))] = '!'
  }
  if (status.branch === '(detached)') Object.assign(status, { branch: oid.slice(0, 7), isDetached: true })
  return status
}

// `git diff --numstat -z`: `added\tremoved\tpath\0`, or for a rename `added\tremoved\t\0from\0to\0`.
// A binary file has `-` for both and counts 0.
export function parseNumstat(out: string, top: string): Record<string, [number, number]> {
  const lines: Record<string, [number, number]> = {}
  const records = out.split('\0')
  for (let i = 0; i < records.length; i++) {
    const match = /^(\d+|-)\t(\d+|-)\t(.*)$/s.exec(records[i] ?? '')
    if (!match) continue
    let path = match[3] ?? ''
    if (path === '') {
      path = records[i + 2] ?? ''
      i += 2
    }
    lines[abs(top, path)] = [match[1] === '-' ? 0 : Number(match[1]), match[2] === '-' ? 0 : Number(match[2])]
  }
  return lines
}

// Each file's lines added to every folder above it, up to the top folder.
export function rollUp(lines: Record<string, [number, number]>, top: string): Record<string, [number, number]> {
  const out: Record<string, [number, number]> = { ...lines }
  for (const [path, [add, del]] of Object.entries(lines)) {
    for (let dir = dirname(path); inside(top, dir); dir = dirname(dir)) {
      const [a, d] = out[dir] ?? [0, 0]
      out[dir] = [a + add, d + del]
      if (dir === top || dir === '/') break
    }
  }
  return out
}

export function countChanged(files: Record<string, GitCode>, top: string): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [path, code] of Object.entries(files)) {
    if (code === '!') continue
    for (let dir = dirname(path); inside(top, dir); dir = dirname(dir)) {
      out[dir] = (out[dir] ?? 0) + 1
      if (dir === top || dir === '/') break
    }
  }
  return out
}

// The code of a path: its own, or the one of a folder above it git reports whole.
export function codeAt(git: GitState, path: string): GitCode | undefined {
  const own = git.files[path]
  if (own) return own
  if (!git.top) return undefined
  for (let dir = dirname(path); inside(git.top, dir) && dir !== git.top; dir = dirname(dir)) {
    const code = git.files[dir]
    if (code === '?' || code === '!') return code
  }
  return undefined
}

export type Run = (argv: string[]) => Promise<{ exitCode: number; stdout: string }>

// Read-only: `--no-optional-locks` keeps `git status` from refreshing the index, which
// could clash with a `git add` or `git commit` the person runs in another terminal.
const gitArgv = (root: string, ...args: string[]) => ['git', '-C', root, '--no-optional-locks', ...args]

// The repository's top and git folder, for the session's folder; undefined outside one.
export async function locate(run: Run, root: string): Promise<{ top: string; gitDir: string } | undefined> {
  const out = await run(gitArgv(root, 'rev-parse', '--path-format=absolute', '--show-toplevel', '--git-dir'))
  if (out.exitCode !== 0) return undefined
  const [top = '', gitDir = ''] = out.stdout.split('\n')
  return top ? { top: posix(top), gitDir: posix(gitDir) } : undefined
}

// Everything the pane shows of git, for what lies in the session's folder.
export async function load(run: Run, root: string): Promise<GitState> {
  const where = await locate(run, root)
  if (!where) return noGit()
  const { top } = where
  const [status, diff] = await Promise.all([
    run(gitArgv(root, 'status', '--porcelain=v2', '-z', '--branch', '--untracked-files=normal', '--ignored=matching', '--', '.')),
    // An unborn branch has no HEAD to diff against: the folder then shows no line counts.
    run(gitArgv(root, 'diff', 'HEAD', '--numstat', '-z', '--', '.')),
  ])
  if (status.exitCode !== 0) return noGit()
  const parsed = parseStatus(status.stdout, top)
  const lines = diff.exitCode === 0 ? parseNumstat(diff.stdout, top) : {}
  return { top, ...parsed, changed: countChanged(parsed.files, top), lines: rollUp(lines, top) }
}
