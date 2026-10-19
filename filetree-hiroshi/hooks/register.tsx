// filetree-hiroshi: the session's folder as a tree in a side pane.
//   Inspired by data-goblin/claude-code-filetree (MIT). Phases 1 to 3 of filetree-hiroshi/PLANO.md:
//   the pane, the tree read on demand, folders opened and closed by a press, /filetree to
//   open or close it, git's view of each row (color, lines added and removed, branch), and
//   where the agent reads and writes: a pulsing ● while active, ○ for the rest of the turn,
//   collapsed folders opened to show the file, the pane following it. The pane opens by
//   itself on the agent's first write; a write outside the session's folder lists the file
//   under the tree, never in it. The engine scrolls the pane: the hook draws every visible row.
import { atom, read, update } from 'claude-code'
import type { Color, EngineInterface, Register, Timer } from 'claude-code'

import type { Act, Change, GitCode, GitState, Panel, Tone } from '../types'
import {
  absolute,
  activeFolders,
  anyActive,
  baseShade,
  gitChanges,
  mark,
  markOf,
  pathWords,
  recordChange,
  SEARCH_LIMIT,
  shade,
  shownPath,
} from './activity'
import { codeAt, load, locate, noGit } from './git'
import type { Run } from './git'
import {
  ancestors,
  basename,
  emptyTree,
  expand,
  fitRow,
  inside,
  isExpanded,
  needsListing,
  posix,
  toggle,
  visibleRows,
  withChildren,
} from './tree'

const PANE = 'filetree-hiroshi'
const TITLE = 'filetree'
const INDENT = '  '
const REFRESH_MS = 300 // a burst of writes, index changes and turn ends reads git once
const PULSE_MS = 300
const WRITES = new Set(['Edit', 'Write', 'NotebookEdit'])
const SHELLS = new Set(['Bash', 'PowerShell'])
const SEARCHES = new Set(['Grep', 'Glob']) // not on every build: compared by name

const CODE_COLOR: Record<GitCode, Color | undefined> = {
  M: 'warning', R: 'warning', A: 'success', '?': 'success', D: 'error', U: 'error', '!': undefined,
}
const CODE_TAIL: Partial<Record<GitCode, string>> = { '?': 'U', A: 'A', U: '!' }

// Held by the host, so all of it survives a hot reload of this file.
const tree = atom({ plugin: 'filetree-hiroshi', key: 'tree' } as const, emptyTree())
const panel = atom({ plugin: 'filetree-hiroshi', key: 'panel' } as const, { closedByUser: false, showTree: false, manual: false } as Panel)
const git = atom({ plugin: 'filetree-hiroshi', key: 'git' } as const, noGit())
const activity = atom({ plugin: 'filetree-hiroshi', key: 'activity' } as const, {} as Record<string, Act>)
const pulse = atom({ plugin: 'filetree-hiroshi', key: 'pulse' } as const, 0)
const changes = atom({ plugin: 'filetree-hiroshi', key: 'changes' } as const, [] as Change[])

// Read again at every session.start, which a reload raises too.
let home = ''
// Whether the terminal docks panes; unknown until a drawing says.
let isFullscreen: boolean | undefined

const runner =
  ($: EngineInterface): Run =>
  async argv => {
    const { exitCode, stdout } = await $.process.run(argv, { timeoutMs: 5000 })
    return { exitCode, stdout }
  }

// Reads a folder into the tree; one that cannot be read counts as empty, so it is not retried on every press.
// The same listing writes nothing, so a refresh that found no change redraws nothing.
async function list($: EngineInterface, dir: string) {
  const entries = await $.fs.list(dir).catch(() => [])
  const cur = await read($, tree)
  if (withChildren(cur, dir, entries) !== cur) await update($, tree, t => withChildren(t, dir, entries))
}

// Set when a shell command may have written files: the next refresh reads them off git.
let afterShell = false

// Every folder on screen read again (files come and go), then git.
async function refresh($: EngineInterface) {
  const t = await read($, tree)
  if (!t.root) return
  const fromShell = afterShell
  afterShell = false
  const shown = t.expanded.filter(path => path === t.root || t.nodes[path]?.children !== undefined)
  await Promise.all(shown.map(dir => list($, dir)))
  const next = await load(runner($), t.root).catch(() => undefined)
  if (next === undefined) return
  const before: GitState = await read($, git)
  if (JSON.stringify(before) === JSON.stringify(next)) return
  await update($, git, () => next)
  if (fromShell && before.top) await wrote($, gitChanges(before, next).filter(path => inside(t.root, path)))
}

// One refresh at a time: a call while one runs asks for another once it ends.
let timer: Timer | undefined
let isRefreshing = false
let again = false

function schedule($: EngineInterface) {
  timer?.cancel()
  timer = $.clock.after(REFRESH_MS, () => {
    timer = undefined
    if (isRefreshing) {
      again = true
      return
    }
    isRefreshing = true
    void refresh($)
      .catch(() => {})
      .finally(() => {
        isRefreshing = false
        if (again) {
          again = false
          schedule($)
        }
      })
  })
}

// While a path is active the pane redraws on a beat, so its ● pulses; the beat stops once none is.
let ticker: Timer | undefined

function beat($: EngineInterface) {
  if (ticker) return
  ticker = $.clock.every(PULSE_MS, () => {
    void (async () => {
      const now = await $.clock.now()
      if (!anyActive(await read($, activity), now)) {
        ticker?.cancel()
        ticker = undefined
      }
      await update($, pulse, n => n + 1)
    })().catch(() => {})
  })
}

async function touch($: EngineInterface, paths: readonly string[], tone: Tone, live: -1 | 0 | 1) {
  if (paths.length === 0) return
  const now = await $.clock.now()
  await update($, activity, acts => mark(acts, paths, tone, now, live))
  beat($)
}

// Opens the folders down to each path and, unless the person scrolled this turn, brings the last into view.
async function reveal($: EngineInterface, paths: readonly string[]) {
  const t = await read($, tree)
  const within = paths.filter(path => inside(t.root, path) && path !== t.root)
  if (within.length === 0) return
  const dirs = [...new Set(within.flatMap(path => ancestors(t.root, path)))]
  for (const dir of [t.root, ...dirs]) if (dir === t.root || needsListing(await read($, tree), dir)) await list($, dir)
  await update($, tree, cur => expand(cur, dirs))
  const p = await read($, panel)
  if (p.manual || !p.showTree) return
  if (!(await $.ui.panes()).some(pane => pane.id === PANE)) return
  await $.ui.scroll({ in: PANE, to: { key: within[within.length - 1] as string }, block: 'nearest' }).catch(() => {})
}

// The pane opens by itself on the agent's first write, unless the person closed it this
// session or the terminal has no room beside the transcript for it.
async function autoOpen($: EngineInterface, hasInside: boolean) {
  if (hasInside) await update($, panel, p => (p.showTree ? p : { ...p, showTree: true }))
  if ((await read($, panel)).closedByUser || isFullscreen === false) return
  if ((await $.ui.panes()).some(pane => pane.id === PANE)) return
  await $.ui.open({ id: PANE, title: TITLE })
}

async function wrote($: EngineInterface, paths: readonly string[]) {
  if (paths.length === 0) return
  const { root } = await read($, tree)
  const now = await $.clock.now()
  await update($, changes, list => paths.reduce((acc, path) => recordChange(acc, path, !inside(root, path), now), list))
  const within = paths.filter(path => inside(root, path))
  await touch($, within, 'write', 0)
  await autoOpen($, within.length > 0)
  await reveal($, within)
}

// The files a read-only shell command names that exist in the session's folder.
async function shellReads($: EngineInterface, command: string, cwd: string): Promise<string[]> {
  const { root } = await read($, tree)
  const candidates = pathWords(command)
    .slice(0, 10)
    .map(word => absolute(word, cwd || root))
    .filter(path => inside(root, path) && path !== root)
  const found: string[] = []
  for (const path of candidates) {
    if (found.length >= SEARCH_LIMIT) break
    if (await $.fs.exists(path).catch(() => false)) found.push(path)
  }
  return found
}

async function press($: EngineInterface, path: string) {
  const t = await read($, tree)
  const node = t.nodes[path]
  if (!node) return
  if (node.kind !== 'dir') {
    await update($, tree, cur => ({ ...cur, cursor: path }))
    return
  }
  if (!isExpanded(t, path) && needsListing(t, path)) await list($, path)
  await update($, tree, cur => toggle(cur, path))
}

// `+12 -3`, or a letter for a file git has no line counts for (untracked, added, conflict).
function tailOf(lines: [number, number] | undefined, code: GitCode | undefined): { text: string; color: Color }[] {
  const parts: { text: string; color: Color }[] = []
  if (lines && lines[0] > 0) parts.push({ text: `+${lines[0]}`, color: 'success' })
  if (lines && lines[1] > 0) parts.push({ text: `-${lines[1]}`, color: 'error' })
  if (parts.length === 0 && code && CODE_TAIL[code]) parts.push({ text: CODE_TAIL[code] as string, color: CODE_COLOR[code] ?? 'text' })
  return parts
}

const stringField = (input: unknown, key: string): string | undefined => {
  const value = (input as Record<string, unknown>)[key]
  return typeof value === 'string' ? value : undefined
}

export const register: Register = on => {
  // Git's index and HEAD change on every add, commit and checkout, made here or in another
  // terminal: watching them makes the engine raise FileChanged for each.
  on('classic.SessionStart', async ($, e, next) => {
    const result = await next(e)
    const where = await locate(runner($), posix(e.cwd)).catch(() => undefined)
    if (!where) return result
    return { ...result, watchPaths: [...(result.watchPaths ?? []), `${where.gitDir}/index`, `${where.gitDir}/HEAD`] }
  })

  on('session.start', async ($, e, next) => {
    const r = await next(e)
    await $.command.register({ name: 'filetree', description: 'Abre ou fecha a árvore de arquivos da sessão' }).catch(() => {}) // a name Claude Code already has is refused: start anyway
    home = posix((await $.env.get('HOME').catch(() => undefined)) ?? '')
    const root = posix(e.cwd)
    // A hot reload starts the session again with the same folder: keep what was open.
    if ((await read($, tree)).root !== root) await update($, tree, () => emptyTree(root))
    await refresh($).catch(() => {})
    return r
  })

  on('classic.FileChanged', async ($, e, next) => {
    const result = await next(e)
    schedule($)
    return result
  })

  on('tool.call', async ($, e, next) => {
    const tool = String(e.tool)
    const cwd = posix((await $.session.cwd().catch(() => '')) || (await read($, tree)).root)
    const readPath = tool === 'Read' ? stringField(e, 'file_path') : undefined
    const reading = readPath ? [absolute(readPath, cwd)] : []
    await touch($, reading, 'read', 1)
    let result: Awaited<ReturnType<typeof next>>
    try {
      result = await next(e)
    } finally {
      await touch($, reading, 'read', -1)
    }
    if (result.deny || result.isError) return result

    if (reading.length) await reveal($, reading)
    else if (SEARCHES.has(tool)) {
      const found = (result.result as { filenames?: unknown } | undefined)?.filenames
      const files = Array.isArray(found)
        ? found.filter((f): f is string => typeof f === 'string').slice(0, SEARCH_LIMIT).map(f => absolute(f, cwd))
        : []
      await touch($, files, 'read', 0)
      await reveal($, files)
    } else if (WRITES.has(tool)) {
      const path = stringField(e, 'file_path') ?? stringField(e, 'notebook_path')
      if (path) await wrote($, [absolute(path, cwd)])
      schedule($)
    } else if (SHELLS.has(tool)) {
      if (result.isReadOnly) {
        const files = await shellReads($, stringField(e, 'command') ?? '', cwd)
        await touch($, files, 'read', 0)
        await reveal($, files)
      } else {
        afterShell = true
        schedule($)
      }
    }
    return result
  })

  // A new turn: the person may have edited files in another program, last turn's ○ go,
  // and the pane follows the agent again.
  on('prompt.submit', async ($, e, next) => {
    const now = await $.clock.now()
    await update($, activity, acts => Object.fromEntries(Object.entries(acts).filter(([, act]) => markOf(act, now) === 'active')))
    await update($, panel, p => (p.manual ? { ...p, manual: false } : p))
    schedule($)
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    schedule($)
    return next(e)
  })

  on('ui.focus', { component: 'Pane', requestId: PANE }, async ($, e, next) => {
    schedule($)
    return next(e)
  })

  on('ui.scroll', { component: 'Pane', requestId: PANE }, async ($, e, next) => {
    if (e.origin.kind === 'person') await update($, panel, p => (p.manual ? p : { ...p, manual: true }))
    return next(e)
  })

  // Only looks: whether the terminal docks panes decides if the pane may open unasked.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.viewport?.isFullscreen !== undefined) isFullscreen = e.viewport.isFullscreen
    return next(e)
  })

  on('command.run', { command: 'filetree' }, async ($, e) => {
    isFullscreen = e.presentation?.isFullscreen ?? isFullscreen
    if ((await $.ui.panes()).some(pane => pane.id === PANE)) {
      await $.ui.close({ id: PANE })
      return { text: 'filetree fechado.' }
    }
    await update($, panel, p => ({ ...p, showTree: true, closedByUser: false }))
    const opened = await $.ui.open({ id: PANE, title: TITLE })
    return { text: opened.isPlaced ? 'filetree aberto.' : `filetree aberto, aguardando espaço: ${opened.reason}` }
  })

  on('ui.close', { id: PANE }, async ($, e, next) => {
    if (e.origin.kind === 'person') await update($, panel, p => ({ ...p, closedByUser: true }))
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    if (e.viewport?.isFullscreen !== undefined) isFullscreen = e.viewport.isFullscreen
    const t = await read($, tree)
    const g: GitState = await read($, git)
    const p = await read($, panel)
    const acts = await read($, activity)
    const beatNow = await read($, pulse)
    const written = await read($, changes)
    const now = await $.clock.now()
    const width = Math.max(16, e.props.bodyColumns)
    const rows = p.showTree ? visibleRows(t) : []
    const busyDirs = activeFolders(acts, now, t.root)

    const total = tailOf(g.lines[t.root], undefined)
    const head = fitRow('', basename(t.root), total.map(part => part.text).join(' '), width)
    const ruleLabel = '─ Alterações '

    return (
      <Box flexDirection="column">
        {p.showTree && (
          <Text wrap="truncate-end">
            <Text bold>{head.name}</Text>
            {head.pad}
            {head.tail && total.map((part, i) => <Text key={`total-${i}`} color={part.color}>{(i ? ' ' : '') + part.text}</Text>)}
          </Text>
        )}
        {p.showTree && g.top && (
          <Text wrap="truncate-end" color={g.isDetached ? 'warning' : 'cyan'}>
            {g.isDetached ? '◆' : '⎇'} {g.branch}
            {g.ahead > 0 && <Text color="success"> ↑{g.ahead}</Text>}
            {g.behind > 0 && <Text color="error"> ↓{g.behind}</Text>}
          </Text>
        )}
        {rows.map(({ node, depth }) => {
          const isDir = node.kind === 'dir'
          const open = isExpanded(t, node.path)
          const code = codeAt(g, node.path)
          const act = acts[node.path]
          const marked = markOf(act, now)
          // A collapsed folder with the agent inside pulses too.
          const busy = isDir && !open ? busyDirs.get(node.path) : undefined
          const glyph = isDir ? (open ? '▾' : '▸') : marked === 'active' ? '●' : marked === 'recent' ? '○' : ' '
          const lead = `${INDENT.repeat(depth)}${glyph} `
          const tail = tailOf(g.lines[node.path], code)
          const row = fitRow(lead, node.name, tail.map(part => part.text).join(' '), width)
          const gitColor: Color | undefined =
            code && code !== '!' ? CODE_COLOR[code] : isDir ? (g.changed[node.path] ? 'warning' : 'suggestion') : undefined
          const glow = act && marked === 'active' ? shade(act.tone, beatNow) : busy ? shade(busy, beatNow) : undefined
          const glyphColor = !isDir && act ? (marked === 'active' ? glow : baseShade(act.tone)) : undefined
          return (
            <Button key={node.path} plain onPress={() => void press($, node.path)}>
              <Text wrap="truncate-end">
                {INDENT.repeat(depth)}
                <Text color={glyphColor}>{glyph}</Text>{' '}
                <Text
                  bold={node.path === t.cursor || glow !== undefined}
                  color={glow ?? gitColor}
                  dimColor={glow === undefined && (code === '!' || node.kind === 'link' || node.name.startsWith('.'))}
                  italic={node.kind === 'link'}
                >
                  {row.name}
                </Text>
                {row.pad}
                {row.tail && tail.map((part, i) => <Text key={`${node.path}-tail-${i}`} color={part.color}>{(i ? ' ' : '') + part.text}</Text>)}
              </Text>
            </Button>
          )
        })}
        {written.length > 0 && (
          <Text dimColor wrap="truncate-end">
            {ruleLabel}
            {'─'.repeat(Math.max(0, width - ruleLabel.length))}
          </Text>
        )}
        {written.map(change => {
          const marked = change.outside ? 'recent' : markOf(acts[change.path], now)
          const name = shownPath(change.path, t.root, home) + (change.outside ? ' ↗' : '')
          return (
            <Text key={`change-${change.path}`} wrap="truncate-end">
              <Text color={marked === 'active' ? shade('write', beatNow) : baseShade('write')}>{marked === 'active' ? '●' : '○'}</Text>{' '}
              <Text color={change.outside ? 'subtle' : undefined}>{fitRow('  ', name, '', width).name}</Text>
            </Text>
          )
        })}
      </Box>
    )
  })
}
