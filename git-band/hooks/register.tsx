import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Commit, GitInfo } from '../types'

const info = atom({ plugin: 'git-band', key: 'info' } as const, null)

const FIELD = '\x1f'

// `git status --porcelain=v2 --branch`: "# branch.head <name|(detached)>",
// "# branch.oid <hash|(initial)>", "# branch.ab +<ahead> -<behind>", then one line per
// changed (1), renamed (2), unmerged (u) or untracked (?) path; "1"/"2"/"u" carry the
// two-letter XY: X the index (staged) state, Y the working tree's, "." for none.
export function parseStatus(
  out: string,
): Pick<GitInfo, 'head' | 'isDetached' | 'ahead' | 'behind' | 'staged' | 'modified' | 'untracked' | 'deleted'> {
  let head = ''
  let oid = ''
  let ahead = 0
  let behind = 0
  let staged = 0
  let modified = 0
  let untracked = 0
  let deleted = 0
  for (const line of out.split('\n')) {
    if (line.startsWith('# branch.head ')) head = line.slice(14)
    else if (line.startsWith('# branch.oid ')) oid = line.slice(13)
    else if (line.startsWith('# branch.ab ')) {
      const match = /^\+(\d+) -(\d+)$/.exec(line.slice(12))
      if (match !== null) [ahead, behind] = [Number(match[1]), Number(match[2])]
    } else if (line.startsWith('? ')) untracked += 1
    else if (/^[12u] /.test(line)) {
      const [x = '.', y = '.'] = [line[2], line[3]]
      if (x === 'D' || y === 'D') deleted += 1
      else if (y !== '.' || line[0] === 'u') modified += 1
      else staged += 1
    }
  }
  const isDetached = head === '(detached)'
  return { head: isDetached ? oid.slice(0, 7) : head, isDetached, ahead, behind, staged, modified, untracked, deleted }
}

// `git log -1 --format=%h<FS>%s<FS>%an<FS>%ar --numstat`: the header line, then one
// "<added>\t<removed>\t<path>" per file ("-" for a binary one).
export function parseCommit(out: string): Commit | undefined {
  const [header = '', ...rest] = out.split('\n')
  const [hash = '', subject = '', author = '', when = ''] = header.split(FIELD)
  if (hash === '') return undefined
  let added = 0
  let removed = 0
  for (const line of rest) {
    const match = /^(\d+|-)\t(\d+|-)\t/.exec(line)
    if (match === null) continue
    added += match[1] === '-' ? 0 : Number(match[1])
    removed += match[2] === '-' ? 0 : Number(match[2])
  }
  return { hash, subject, author, when, added, removed }
}

export function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, Math.max(0, max - 1))}…`
}

// The row is a flat list of runs of text, so its width is the sum of their lengths.
export type Seg = { text: string; color?: string; bold?: boolean; dim?: boolean }

const width = (segs: Seg[]) => segs.reduce((sum, seg) => sum + seg.text.length, 0)
const SEP: Seg = { text: ' │ ', dim: true }

// A worktree folder usually repeats its branch ("dark-mode" for "refactor/dark-mode").
const repeatsBranch = (git: GitInfo) =>
  git.worktree !== undefined && (git.head === git.worktree || git.head.endsWith(`/${git.worktree}`))

// Column 1. The main checkout shows its branch; a linked worktree shows its folder first,
// in another color and glyph, then the branch it has checked out. When the folder only
// repeats the branch, just the glyph marks the worktree.
export function placeColumn(git: GitInfo): Seg[] {
  const branch: Seg = {
    text: `${git.isDetached ? '◆' : '⎇'} ${git.head}`,
    color: git.isDetached ? 'yellow' : 'cyan',
    bold: git.worktree === undefined,
  }
  const folder = git.worktree === undefined ? '' : repeatsBranch(git) ? '' : `${git.worktree} `
  const segs: Seg[] =
    git.worktree === undefined ? [branch] : [{ text: `❖ ${folder}`, color: 'magenta', bold: true }, branch]
  if (git.ahead > 0) segs.push({ text: ` ↑${git.ahead}`, color: 'green' })
  if (git.behind > 0) segs.push({ text: ` ↓${git.behind}`, color: 'red' })
  return segs
}

// Column 2: what is not committed yet, one colored count per kind; ✓ when there is none.
export function treeColumn(git: GitInfo): Seg[] {
  const kinds = [
    { text: `●${git.staged}`, color: 'green', n: git.staged },
    { text: `~${git.modified}`, color: 'yellow', n: git.modified },
    { text: `?${git.untracked}`, color: 'cyan', n: git.untracked },
    { text: `✖${git.deleted}`, color: 'red', n: git.deleted },
  ].filter(kind => kind.n > 0)
  if (kinds.length === 0) return [{ text: '✓', dim: true }]
  return kinds.flatMap((kind, i) => [...(i > 0 ? [{ text: ' ' }] : []), { text: kind.text, color: kind.color }])
}

// Column 4: the last commit's lines, added then removed.
export function linesColumn(commit: Commit): Seg[] {
  return [
    { text: `+${commit.added}`, color: 'green' },
    { text: ' ' },
    { text: `-${commit.removed}`, color: 'red' },
  ]
}

// The whole row for `columns` cells: the commit's subject takes what the rest leaves.
export function rowSegments(git: GitInfo, columns: number): Seg[] {
  const place = placeColumn(git)
  const tree = treeColumn(git)
  const commit = git.commit
  if (commit === undefined) return [...place, SEP, ...tree, SEP, { text: 'sem commits', dim: true }]
  const lines = linesColumn(commit)
  const hash: Seg = { text: `${commit.hash} `, color: 'yellow' }
  const when: Seg = { text: ` · ${commit.when}`, dim: true }
  const others = width([...place, SEP, ...tree, SEP, hash, when, SEP, ...lines])
  const subject: Seg = { text: clip(commit.subject, Math.max(8, columns - others - 1)) }
  return [...place, SEP, ...tree, SEP, hash, subject, when, SEP, ...lines]
}

type Run = (argv: string[]) => Promise<{ exitCode: number; stdout: string }>

// Read-only: `--no-optional-locks` keeps `git status` from refreshing the index, which
// could clash with a `git add` or `git commit` the person runs in another terminal.
const gitArgv = (...args: string[]) => ['git', '--no-optional-locks', ...args]

export async function load(run: Run): Promise<GitInfo | null> {
  const status = await run(gitArgv('status', '--porcelain=v2', '--branch'))
  if (status.exitCode !== 0) return null
  const [dirs, log] = await Promise.all([
    run(gitArgv('rev-parse', '--path-format=absolute', '--git-dir', '--git-common-dir', '--show-toplevel')),
    run(gitArgv('log', '-1', `--format=%h${FIELD}%s${FIELD}%an${FIELD}%ar`, '--numstat')),
  ])
  const [gitDir, commonDir, top = ''] = dirs.stdout.split('\n')
  const isLinked = dirs.exitCode === 0 && gitDir !== commonDir
  const worktree = isLinked ? top.split('/').filter(Boolean).pop() : undefined
  const commit = log.exitCode === 0 ? parseCommit(log.stdout) : undefined
  return { ...parseStatus(status.stdout), ...(worktree === undefined ? {} : { worktree }), ...(commit === undefined ? {} : { commit }) }
}

// A failed read must not hold anything back: it only leaves the band as it was.
async function refresh($: EngineInterface) {
  const next = await load(async argv => {
    const { exitCode, stdout } = await $.process.run(argv, { timeoutMs: 5000 })
    return { exitCode, stdout }
  }).catch(() => undefined)
  if (next === undefined) return
  // Writing redraws the band: skip it when nothing changed.
  const current = await read($, info).catch(() => undefined)
  if (JSON.stringify(current) !== JSON.stringify(next)) await update($, info, () => next).catch(() => {})
}

// Changes made outside this session (another terminal's `git add`, an editor) fire no
// event here, so the row is also read on a timer.
const POLL_MS = 4000

export const register: Register = on => {
  // While the model works its turn ends in `turn.complete` and each Bash call already
  // refreshes, so the timer stays idle then; it also skips a tick while a read is running.
  let isWorking = false
  let isReading = false

  on('session.start', async ($, e, next) => {
    await refresh($).catch(() => {})
    $.clock.every(POLL_MS, () => {
      if (isWorking || isReading) return
      isReading = true
      refresh($)
        .catch(() => {})
        .finally(() => {
          isReading = false
        })
    })
    return next(e)
  })

  on('turn.start', ($, e, next) => {
    isWorking = true
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    await refresh($).catch(() => {})
    return next(e)
  })

  // The turn may have edited files, committed, switched branch or moved worktree.
  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) isWorking = false
    await refresh($).catch(() => {})
    return next(e)
  })

  // A command the user or the model ran (git checkout, commit, ...) shows at once.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const result = await next(e)
    await refresh($).catch(() => {})
    return result
  })

  // So does a file the model edited or created, which no Bash call would report.
  on('tool.call', { tool: 'Edit' }, async ($, e, next) => {
    const result = await next(e)
    await refresh($).catch(() => {})
    return result
  })

  on('tool.call', { tool: 'Write' }, async ($, e, next) => {
    const result = await next(e)
    await refresh($).catch(() => {})
    return result
  })

  // Mods stack here by composition: what the ones beneath draw stays, and this one's row
  // goes under it, so when this plugin is outermost its row is the nearest to the prompt.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const rest = await next(e)
    const git = await read($, info)
    if (git === null || e.props.hasSurvey) return rest

    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="column">
        {rest}
        <Text wrap="truncate-end">
          {rowSegments(git, e.props.bodyColumns).map(seg => (
            <Text color={seg.color} bold={seg.bold} dimColor={seg.dim}>
              {seg.text}
            </Text>
          ))}
        </Text>
      </Box>
    )
  })
}
