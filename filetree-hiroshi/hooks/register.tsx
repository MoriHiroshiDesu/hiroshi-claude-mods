// filetree-hiroshi: the session's folder as a tree in a side pane.
//   Inspired by data-goblin/claude-code-filetree (MIT). Phases 1 and 2 of filetree-hiroshi/PLANO.md:
//   the pane, the tree read on demand, folders opened and closed by a press, /filetree to
//   open or close it, and git's view of each row (color, lines added and removed, branch).
//   The engine scrolls the pane: the hook draws every visible row.
import { atom, read, update } from 'claude-code'
import type { Color, EngineInterface, Register, Timer } from 'claude-code'

import type { GitCode, GitState, Panel } from '../types'
import { codeAt, load, locate, noGit } from './git'
import type { Run } from './git'
import { basename, emptyTree, fitRow, isExpanded, needsListing, posix, toggle, visibleRows, withChildren } from './tree'

const PANE = 'filetree-hiroshi'
const TITLE = 'filetree'
const INDENT = '  '
const REFRESH_MS = 300 // a burst of writes, index changes and turn ends reads git once
const WRITES = new Set(['Edit', 'Write', 'NotebookEdit', 'Bash', 'PowerShell'])

const CODE_COLOR: Record<GitCode, Color | undefined> = {
  M: 'warning', R: 'warning', A: 'success', '?': 'success', D: 'error', U: 'error', '!': undefined,
}
const CODE_TAIL: Partial<Record<GitCode, string>> = { '?': 'U', A: 'A', U: '!' }

// Held by the host, so the tree survives a hot reload of this file.
const tree = atom({ plugin: 'filetree-hiroshi', key: 'tree' } as const, emptyTree())
const panel = atom({ plugin: 'filetree-hiroshi', key: 'panel' } as const, { closedByUser: false, showTree: false } as Panel)
const git = atom({ plugin: 'filetree-hiroshi', key: 'git' } as const, noGit())

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

// Every folder on screen read again (files come and go), then git.
async function refresh($: EngineInterface) {
  const t = await read($, tree)
  if (!t.root) return
  const shown = t.expanded.filter(path => path === t.root || t.nodes[path]?.children !== undefined)
  await Promise.all(shown.map(dir => list($, dir)))
  const next = await load(runner($), t.root).catch(() => undefined)
  if (next === undefined) return
  if (JSON.stringify(await read($, git)) !== JSON.stringify(next)) await update($, git, () => next)
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
    const result = await next(e)
    if (WRITES.has(String(e.tool))) schedule($)
    return result
  })

  // Between turns the person may have edited files in another program.
  on('prompt.submit', async ($, e, next) => {
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

  on('command.run', { command: 'filetree' }, async $ => {
    if ((await $.ui.panes()).some(pane => pane.id === PANE)) {
      await $.ui.close({ id: PANE })
      return { text: 'filetree fechado.' }
    }
    await update($, panel, p => ({ ...p, showTree: true }))
    const opened = await $.ui.open({ id: PANE, title: TITLE })
    return { text: opened.isPlaced ? 'filetree aberto.' : `filetree aberto, aguardando espaço: ${opened.reason}` }
  })

  on('ui.close', { id: PANE }, async ($, e, next) => {
    if (e.origin.kind === 'person') await update($, panel, p => ({ ...p, closedByUser: true }))
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const t = await read($, tree)
    const g: GitState = await read($, git)
    const width = Math.max(16, e.props.bodyColumns)
    const rows = visibleRows(t)

    const total = tailOf(g.lines[t.root], undefined)
    const head = fitRow('', basename(t.root), total.map(p => p.text).join(' '), width)

    return (
      <Box flexDirection="column">
        <Text wrap="truncate-end">
          <Text bold>{head.name}</Text>
          {head.pad}
          {head.tail && total.map((p, i) => <Text key={`total-${i}`} color={p.color}>{(i ? ' ' : '') + p.text}</Text>)}
        </Text>
        {g.top && (
          <Text wrap="truncate-end" color={g.isDetached ? 'warning' : 'cyan'}>
            {g.isDetached ? '◆' : '⎇'} {g.branch}
            {g.ahead > 0 && <Text color="success"> ↑{g.ahead}</Text>}
            {g.behind > 0 && <Text color="error"> ↓{g.behind}</Text>}
          </Text>
        )}
        {rows.map(({ node, depth }) => {
          const isDir = node.kind === 'dir'
          const code = codeAt(g, node.path)
          const glyph = isDir ? (isExpanded(t, node.path) ? '▾' : '▸') : ' '
          const lead = `${INDENT.repeat(depth)}${glyph} `
          const tail = tailOf(g.lines[node.path], code)
          const row = fitRow(lead, node.name, tail.map(p => p.text).join(' '), width)
          const color: Color | undefined =
            code && code !== '!' ? CODE_COLOR[code] : isDir ? (g.changed[node.path] ? 'warning' : 'suggestion') : undefined
          return (
            <Button key={node.path} plain onPress={() => void press($, node.path)}>
              <Text wrap="truncate-end">
                {lead}
                <Text
                  bold={node.path === t.cursor}
                  color={color}
                  dimColor={code === '!' || node.kind === 'link' || node.name.startsWith('.')}
                  italic={node.kind === 'link'}
                >
                  {row.name}
                </Text>
                {row.pad}
                {row.tail && tail.map((p, i) => <Text key={`${node.path}-tail-${i}`} color={p.color}>{(i ? ' ' : '') + p.text}</Text>)}
              </Text>
            </Button>
          )
        })}
      </Box>
    )
  })
}
