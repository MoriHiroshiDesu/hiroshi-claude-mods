// filetree-hiroshi: the session's folder as a tree in a side pane, and the changes the agent made.
//   Inspired by data-goblin/claude-code-filetree (MIT). Phases 1 to 5 of filetree-hiroshi/PLANO.md:
//   the pane, the tree read on demand, folders opened and closed by a press, /filetree to
//   open or close it, git's view of each row (color, lines added and removed, branch), and
//   where the agent reads and writes: a pulsing ● while active, ○ for the rest of the turn,
//   collapsed folders opened to show the file, the tree following it. The pane opens by
//   itself as a fullscreen session starts and on the agent's writes; a write outside the
//   session's folder is listed with the changes, never in the tree. When the agent's files
//   lie too far apart to show together, focus mode cuts the tree down to the way to them
//   (f turns it on or off for good).
//   Below the tree, the changes section shows each written file's hunks, the newest open
//   (d folds it, c clears it). The tree scrolls in a window of its own, so the section stays
//   in view: the pane's body is drawn to fit, and the wheel and the focus ring move the window.
//   A ⧉ abrir chip after a file's name, shown under the pointer, opens it in Zed or VS Code; on
//   a change, its diff (in Zed, the file: see editor.ts).
import { atom, read, update } from 'claude-code'
import type { Color, EngineInterface, Register, Timer } from 'claude-code'

import type { Act, Before, Change, Focus, GitCode, GitState, Hunk, Panel, Tone, Tree } from '../types'
import { absolute, activeFolders, anyActive, baseShade, gitChanges, mark, markOf, pathWords, SEARCH_LIMIT, shade, shownPath } from './activity'
import { hunksOf, layout, normalizeChange, recordChange } from './diff'
import {
  beforePath,
  chooseEditor,
  diffArgv,
  diffKey,
  EDITORS,
  hasOwnWindow,
  OPENER,
  installedFrom,
  isIcon,
  isTempDir,
  needsBefore,
  openArgv,
  openKey,
  skipIcons,
  tempDir,
  ZED_WINDOWS_PY,
} from './editor'
import type { Editor, ZedWorkspace } from './editor'
import { moreLabel, project, RELEASE_MS, spreadOut } from './focus'
import type { FocusRow } from './focus'
import { codeAt, load, locate, noGit } from './git'
import type { Run } from './git'
import {
  ancestors,
  basename,
  dirname,
  emptyTree,
  expand,
  fitRow,
  inside,
  isExpanded,
  needsListing,
  posix,
  toggle,
  visibleRows,
  windowFor,
  withChildren,
} from './tree'

const PANE = 'filetree-hiroshi'
const TITLE = 'filetree'
const INDENT = '  '
const REFRESH_MS = 300 // a burst of writes, index changes and turn ends reads git once
const PULSE_MS = 300
const HEADER_ROWS = 2 // the folder's name and totals, then the branch and the focus toggle
const SECTION_SHARE = 0.4 // of the pane's rows, at most, for the changes below the tree
const WHEEL_STEP = 3
const WRITES = new Set(['Edit', 'Write', 'NotebookEdit'])
const SHELLS = new Set(['Bash', 'PowerShell'])
const SEARCHES = new Set(['Grep', 'Glob']) // not on every build: compared by name

const CODE_COLOR: Record<GitCode, Color | undefined> = {
  M: 'warning', R: 'warning', A: 'success', '?': 'success', D: 'error', U: 'error', '!': undefined,
}
const CODE_TAIL: Partial<Record<GitCode, string>> = { '?': 'U', A: 'A', U: '!' }

// Held by the host, so all of it survives a hot reload of this file.
const tree = atom({ plugin: 'filetree-hiroshi', key: 'tree' } as const, emptyTree())
const PANEL: Panel = { closedByUser: false, showTree: false, manual: false, offset: 0, diffsHidden: false }
const panel = atom({ plugin: 'filetree-hiroshi', key: 'panel' } as const, PANEL)
const git = atom({ plugin: 'filetree-hiroshi', key: 'git' } as const, noGit())
const activity = atom({ plugin: 'filetree-hiroshi', key: 'activity' } as const, {} as Record<string, Act>)
const pulse = atom({ plugin: 'filetree-hiroshi', key: 'pulse' } as const, 0)
const changes = atom({ plugin: 'filetree-hiroshi', key: 'changes' } as const, [] as Change[])
const focus = atom({ plugin: 'filetree-hiroshi', key: 'focus' } as const, { mode: 'auto', engaged: false } as Focus)
const before = atom({ plugin: 'filetree-hiroshi', key: 'before' } as const, { dir: '', files: {} } as Before)
// The id of the session the state above belongs to: a /clear goes on under another.
const bound = atom({ plugin: 'filetree-hiroshi', key: 'bound' } as const, '')

// Read again at every session.start, which a reload raises too.
let home = ''
// Whether the terminal docks panes; unknown until a drawing says.
let isFullscreen: boolean | undefined
// Set at every session.start: the first drawing that says the terminal docks panes opens the pane.
let opensAtStart = false
// The rows the tree's window has, and the first one it showed, as last drawn.
let room = 20
let drawnFrom = 0
// The editor option (`auto`, `zed` or `code`), the editors on the PATH once looked up, the
// element the focus ring is on, and the pane's focusable keys in drawing order.
let editorSetting: unknown = 'auto'
let installed: Editor[] | undefined
let focused: string | undefined
let order: string[] = []

const runner =
  ($: EngineInterface): Run =>
  async argv => {
    const { exitCode, stdout } = await $.process.run(argv, { timeoutMs: 5000 })
    return { exitCode, stdout }
  }

// The rows the tree shows: in focus, only the way to what the agent touched this turn
// (and the cursor); else every open folder's.
function treeRows(t: Tree, acts: Record<string, Act>, f: Focus): { rows: FocusRow[]; showing: boolean } {
  const touched = Object.keys(acts).filter(path => inside(t.root, path) && path in t.nodes)
  const wantsFocus = f.mode === 'on' || (f.mode === 'auto' && f.engaged)
  const projected = wantsFocus ? project(t, [...touched, t.cursor]) : []
  if (projected.length) return { rows: projected, showing: true }
  return {
    rows: visibleRows(t).map(({ node, depth }) => ({ kind: 'node', node, depth, label: node.name, isOpen: isExpanded(t, node.path) })),
    showing: false,
  }
}

// Where a path shows among the rows: its own row, else the closed folder it lies in.
function rowOf(rows: readonly FocusRow[], t: Tree, path: string): number {
  for (const p of [path, ...ancestors(t.root, path).reverse()]) {
    const i = rows.findIndex(row => row.kind === 'node' && row.node.path === p)
    if (i >= 0) return i
  }
  return -1
}

// Moves the tree's window so row `at` shows, `margin` rows from either edge when it can.
async function bringIntoView($: EngineInterface, at: number, total: number, margin: number) {
  if (at < 0) return
  const offset = windowFor(drawnFrom, at, room, total, margin)
  await update($, panel, p => (offset === p.offset ? p : { ...p, offset }))
}

// The file the tree follows: the one the agent touched last.
function followed(t: Tree, acts: Record<string, Act>): string | undefined {
  let best: [string, number] | undefined
  for (const [path, act] of Object.entries(acts)) if (inside(t.root, path) && path in t.nodes && (!best || act.at >= best[1])) best = [path, act.at]
  return best?.[0]
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
        release($)
      }
      await update($, pulse, n => n + 1)
    })().catch(() => {})
  })
}

// The paths in the session's folder the agent touched this turn: the active ones, or all.
async function touchedFiles($: EngineInterface, onlyActive: boolean): Promise<string[]> {
  const t = await read($, tree)
  const now = await $.clock.now()
  return Object.entries(await read($, activity))
    .filter(([path, act]) => inside(t.root, path) && path in t.nodes && (!onlyActive || markOf(act, now) === 'active'))
    .map(([path]) => path)
}

// Auto focus engages once two active files lie too far apart to show together, unless the
// person scrolled the pane this turn.
async function engage($: EngineInterface) {
  const f = await read($, focus)
  if (f.mode !== 'auto' || f.engaged || (await read($, panel)).manual) return
  const t = await read($, tree)
  const active = (await touchedFiles($, true)).filter(path => t.nodes[path]?.kind !== 'dir')
  if (spreadOut(t, active, room)) await update($, focus, cur => ({ ...cur, engaged: true }))
}

// ...and lets go a little after the agent's files go quiet.
function release($: EngineInterface) {
  $.clock.after(RELEASE_MS, () => {
    void (async () => {
      if (anyActive(await read($, activity), await $.clock.now())) return
      await update($, focus, f => (f.engaged ? { ...f, engaged: false } : f))
    })().catch(() => {})
  })
}

// The f key: from auto it holds the opposite of what shows; pressed again, back to auto.
async function toggleFocus($: EngineInterface, showing: boolean) {
  await update($, focus, (f): Focus => (f.mode === 'auto' ? { ...f, mode: showing ? 'off' : 'on' } : { mode: 'auto', engaged: false }))
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
  await engage($)
  if ((await read($, panel)).manual) return
  const cur = await read($, tree)
  const { rows } = treeRows(cur, await read($, activity), await read($, focus))
  await bringIntoView($, rowOf(rows, cur, within[within.length - 1] as string), rows.length, Math.floor(room / 3))
}

// The pane opens by itself as the session starts and on the agent's writes, unless the person
// closed it this session or the terminal has no room beside the transcript for it. A reload
// closes it, and its session.start opens it again.
async function autoOpen($: EngineInterface, hasInside: boolean) {
  if (hasInside) await update($, panel, p => (p.showTree ? p : { ...p, showTree: true }))
  if ((await read($, panel)).closedByUser || isFullscreen === false) return
  if ((await $.ui.panes()).some(pane => pane.id === PANE)) return
  await $.ui.open({ id: PANE, title: TITLE })
}

async function wrote($: EngineInterface, paths: readonly string[], hunks: readonly Hunk[] = []) {
  if (paths.length === 0) return
  const { root } = await read($, tree)
  const now = await $.clock.now()
  await update($, changes, list => paths.reduce((acc, path) => recordChange(acc, path, !inside(root, path), now, hunks), list))
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

// A press is the person's: the tree stops following the agent until the next prompt.
async function press($: EngineInterface, path: string) {
  const t = await read($, tree)
  const node = t.nodes[path]
  if (!node) return
  await update($, panel, p => (p.manual ? p : { ...p, manual: true, offset: drawnFrom }))
  if (node.kind !== 'dir') {
    await update($, tree, cur => ({ ...cur, cursor: path }))
    return
  }
  if (!isExpanded(t, path) && needsListing(t, path)) await list($, path)
  await update($, tree, cur => toggle(cur, path))
}

async function toggleChange($: EngineInterface, path: string, isOpen: boolean) {
  await update($, changes, list => list.map(c => (c.path === path ? { ...c, expanded: !isOpen } : c)))
}

// `+12 -3`, or a letter for a file git has no line counts for (untracked, added, conflict).
function tailOf(lines: readonly [number, number] | undefined, code: GitCode | undefined): { text: string; color: Color }[] {
  const parts: { text: string; color: Color }[] = []
  if (lines && lines[0] > 0) parts.push({ text: `+${lines[0]}`, color: 'success' })
  if (lines && lines[1] > 0) parts.push({ text: `-${lines[1]}`, color: 'error' })
  if (parts.length === 0 && code && CODE_TAIL[code]) parts.push({ text: CODE_TAIL[code] as string, color: CODE_COLOR[code] ?? 'text' })
  return parts
}

const EDITOR_NAME: Record<Editor, string> = { zed: 'Zed', code: 'VS Code' }
const NO_EDITOR = 'filetree: nenhum editor encontrado (zed ou code no PATH); escolha um nas opções do plugin'

// The agent's first write to a file this session: a copy of the file as it was, the before
// side of its diff when git has no version of it.
async function snapshot($: EngineInterface, path: string) {
  const b = await read($, before)
  if (!b.dir || path in b.files) return
  const was = await $.fs.read(path).then(
    text => (typeof text === 'string' ? text : undefined),
    () => undefined,
  )
  const copy = was === undefined ? '' : beforePath(b.dir, path, 'antes')
  if (was !== undefined) await $.fs.write(copy, was)
  await update($, before, cur => ({ ...cur, files: { ...cur.files, [path]: copy } }))
}

// The before side of a file's diff: HEAD's version when git has one, else the copy from
// before the agent's first write, else an empty file (the file is new).
async function beforeFile($: EngineInterface, path: string): Promise<string> {
  const b = await read($, before)
  const head = await $.process.run(['git', '-C', dirname(path), 'show', `HEAD:./${basename(path)}`], { timeoutMs: 5000 }).catch(() => undefined)
  if (head?.exitCode === 0 && !head.isStdoutTruncated) {
    const file = beforePath(b.dir, path, 'HEAD')
    await $.fs.write(file, head.stdout)
    return file
  }
  if (b.files[path]) return b.files[path] as string
  const empty = beforePath(b.dir, path, 'antes')
  await $.fs.write(empty, '')
  return empty
}

async function chosenEditor($: EngineInterface): Promise<Editor | undefined> {
  if (editorSetting === 'zed' || editorSetting === 'code') return editorSetting
  installed ??= await $.process.run(['which', ...EDITORS], { timeoutMs: 5000 }).then(
    ran => installedFrom(ran.stdout),
    () => [],
  )
  const term = await $.env.get('TERM_PROGRAM').catch(() => undefined)
  return chooseEditor(editorSetting, term ?? undefined, installed)
}

// The editor's command returns at once (it hands the path to the editor already running, or
// starts one that outlives it); a failure is told in a toast.
async function launch($: EngineInterface, argv: readonly string[]) {
  const ran = await $.process.run(argv, { timeoutMs: 15000 }).catch((err: unknown) => (err instanceof Error ? err : new Error(String(err))))
  if (ran instanceof Error) $.ui.toast(`filetree: não deu para rodar o ${argv[0]}: ${ran.message}`)
  else if (ran.exitCode !== 0) $.ui.toast(`filetree: ${argv[0]} saiu com ${ran.exitCode}${ran.stderr.trim() ? `: ${ran.stderr.trim().split('\n')[0]}` : ''}`)
}

// Whether Zed should open the project in a window of its own (see ZED_WINDOWS_PY); when its
// database cannot be read, the window is left to Zed, as before.
async function zedFresh($: EngineInterface, editor: Editor, root: string): Promise<boolean> {
  if (editor !== 'zed') return false
  const ran = await $.process.run(['python3', '-I', '-c', ZED_WINDOWS_PY], { timeoutMs: 5000 }).catch(() => undefined)
  if (ran?.exitCode !== 0 || ran.isStdoutTruncated) return false
  try {
    return !hasOwnWindow(JSON.parse(ran.stdout) as ZedWorkspace[], root)
  } catch {
    return false
  }
}

async function openFile($: EngineInterface, path: string) {
  const editor = await chosenEditor($)
  if (!editor) return $.ui.toast(NO_EDITOR)
  const root = (await read($, tree)).root || dirname(path)
  $.ui.toast(`filetree: abrindo ${basename(path)} no ${EDITOR_NAME[editor]}…`)
  await launch($, openArgv(editor, root, path, undefined, await zedFresh($, editor, root)))
}

async function openChange($: EngineInterface, path: string) {
  const editor = await chosenEditor($)
  if (!editor) return $.ui.toast(NO_EDITOR)
  const root = (await read($, tree)).root || dirname(path)
  const line = (await read($, changes)).find(c => c.path === path)?.hunks[0]?.newStart
  $.ui.toast(`filetree: abrindo o diff de ${basename(path)} no ${EDITOR_NAME[editor]}…`)
  const was = needsBefore(editor) ? await beforeFile($, path) : ''
  await launch($, diffArgv(editor, root, was, path, line, await zedFresh($, editor, root)))
}

// A press runs one of the above off the drawing; what throws is told in a toast.
function opening($: EngineInterface, run: Promise<void>) {
  void run.catch((err: unknown) => $.ui.toast(`filetree: ${err instanceof Error ? err.message : String(err)}`))
}

// Brings the state to the session it runs in. A /clear raises no session.start: the process
// goes on under a new session id, with the old tree, changes and temporary folder (removed by
// its session.end) still in the host. A new session starts from nothing; a reload, which keeps
// the id, keeps what was open.
async function bind($: EngineInterface, cwd: string): Promise<boolean> {
  const id = await $.session.id().catch(() => '')
  const isNew = id !== '' && (await read($, bound)) !== id
  const root = posix(cwd)
  if (isNew) {
    await update($, panel, () => PANEL)
    await update($, activity, () => ({}))
    await update($, changes, () => [])
    await update($, focus, () => ({ mode: 'auto', engaged: false }))
    await update($, tree, () => emptyTree(root))
    await update($, before, () => ({ dir: '', files: {} }))
    await update($, git, () => noGit())
  }
  // The host keeps the state across a reload: what an older version of the mod wrote
  // is brought to today's shape before anything draws it.
  await update($, panel, p => ({ ...PANEL, ...p }))
  await update($, changes, list => (Array.isArray(list) ? list.filter(c => typeof c?.path === 'string').map(normalizeChange) : []))
  // A hot reload starts the session again with the same folder: keep what was open.
  if ((await read($, tree)).root !== root) await update($, tree, () => emptyTree(root))
  // One folder of temporary files per session, kept across a reload.
  if (!isTempDir((await read($, before)).dir)) {
    const dir = tempDir((await $.env.get('TMPDIR').catch(() => undefined)) ?? '/tmp', await $.clock.now())
    await update($, before, () => ({ dir, files: {} }))
  }
  await update($, bound, () => id)
  seenId = id
  await refresh($).catch(() => {})
  return isNew
}

// The session the state was last bound to, and the binding in progress.
let seenId = ''
let binding: Promise<boolean> | undefined

// Binds when the session is not the one the state belongs to (after a /clear), and opens the
// pane as a new session does, once a drawing has said the terminal docks panes.
async function ensure($: EngineInterface, opens = true) {
  const id = await $.session.id().catch(() => '')
  if (!id || id === seenId) return
  binding ??= bind($, (await $.session.cwd().catch(() => '')) || (await read($, tree)).root).finally(() => {
    binding = undefined
  })
  if (!(await binding) || !opens) return
  opensAtStart = true
  if (isFullscreen === true) {
    opensAtStart = false
    await autoOpen($, true)
  }
}

const stringField = (input: unknown, key: string): string | undefined => {
  const value = (input as Record<string, unknown>)[key]
  return typeof value === 'string' ? value : undefined
}

export const register: Register = (on, options) => {
  editorSetting = options.editor ?? 'auto'
  installed = undefined

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
    await bind($, e.cwd)
    opensAtStart = true
    return r
  })

  on('classic.FileChanged', async ($, e, next) => {
    const result = await next(e)
    schedule($)
    return result
  })

  on('tool.call', async ($, e, next) => {
    await ensure($).catch(() => {})
    const tool = String(e.tool)
    const cwd = posix((await $.session.cwd().catch(() => '')) || (await read($, tree)).root)
    const readPath = tool === 'Read' ? stringField(e, 'file_path') : undefined
    const reading = readPath ? [absolute(readPath, cwd)] : []
    await touch($, reading, 'read', 1)
    const writing = WRITES.has(tool) ? (stringField(e, 'file_path') ?? stringField(e, 'notebook_path')) : undefined
    if (writing) await snapshot($, absolute(writing, cwd)).catch(() => {})
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
      if (path) await wrote($, [absolute(path, cwd)], hunksOf(result.result))
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
  // and the tree follows the agent again.
  on('prompt.submit', async ($, e, next) => {
    await ensure($).catch(() => {})
    const now = await $.clock.now()
    await update($, activity, acts => Object.fromEntries(Object.entries(acts).filter(([, act]) => markOf(act, now) === 'active')))
    await update($, panel, p => (p.manual ? { ...p, manual: false } : p))
    await update($, focus, f => (f.engaged ? { ...f, engaged: false } : f))
    schedule($)
    return next(e)
  })

  on('session.end', async ($, e, next) => {
    const { dir } = await read($, before)
    if (isTempDir(dir)) await $.process.run(['rm', '-rf', dir], { timeoutMs: 5000 }).catch(() => {})
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    schedule($)
    return next(e)
  })

  // The person walking the rows with the focus ring: the window keeps a row of the tree
  // past the ring in view, so the arrows go on through it. The ⧉ icons and the e key's
  // Button stay out of the ring (no prop does that): it lands on a row instead.
  on('ui.focus', { component: 'Pane', requestId: PANE }, async ($, e, next) => {
    schedule($)
    const element = isIcon(e.element) ? skipIcons(order, focused, e.element as string) : e.element
    if (isIcon(e.element) && element === undefined) return {}
    const result = await next(element === e.element ? e : { ...e, element })
    if (!result.deny) focused = element
    const t = await read($, tree)
    if (e.origin.kind === 'person' && element && element in t.nodes) {
      await update($, panel, p => (p.manual ? p : { ...p, manual: true }))
      const { rows } = treeRows(t, await read($, activity), await read($, focus))
      await bringIntoView($, rowOf(rows, t, element), rows.length, 1)
    }
    return result
  })

  // The wheel over the tree moves its window; the pane's body itself is drawn to fit.
  on('ui.scroll', { component: 'Pane', requestId: PANE }, async ($, e, next) => {
    if (e.origin.kind !== 'person') return next(e)
    const overTree = !e.pointer || (e.pointer.row >= HEADER_ROWS && e.pointer.row < HEADER_ROWS + room)
    if (e.by !== 0 && overTree) {
      const step = Math.sign(e.by) * Math.max(WHEEL_STEP, Math.abs(e.by))
      await update($, panel, p => ({ ...p, manual: true, offset: Math.max(0, drawnFrom + step) }))
    }
    return next(e)
  })

  // Draws nothing: whether the terminal docks panes decides if the pane may open unasked,
  // and the first drawing to say so opens it at the session's start, off the drawing,
  // which may not write.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.viewport?.isFullscreen !== undefined) isFullscreen = e.viewport.isFullscreen
    // A drawing may not write: a session the state is not bound to is bound off it.
    if ((await $.session.id().catch(() => '')) !== seenId) $.clock.after(0, () => void ensure($).catch(() => {}))
    if (opensAtStart && isFullscreen === true) {
      opensAtStart = false
      $.clock.after(0, () => void autoOpen($, true).catch(() => {}))
    }
    return next(e)
  })

  on('command.run', { command: 'filetree' }, async ($, e) => {
    isFullscreen = e.presentation?.isFullscreen ?? isFullscreen
    await ensure($, false).catch(() => {}) // the person asked for the pane: it is not opened for them first
    if ((await $.ui.panes()).some(pane => pane.id === PANE)) {
      // The close is the mod's own (origin plugin), but the person asked for it.
      await update($, panel, p => ({ ...p, closedByUser: true }))
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
    // A drawing that throws leaves the pane blank: say why in it instead.
    try {
      return await (async () => {
        const { Box, Button, Code, Text } = $.ui.resolve(e)
        if (e.viewport?.isFullscreen !== undefined) isFullscreen = e.viewport.isFullscreen
        const t = await read($, tree)
        const g: GitState = await read($, git)
        const p = await read($, panel)
        const acts = await read($, activity)
        const beatNow = await read($, pulse)
        const written = await read($, changes)
        const f = await read($, focus)
        const now = await $.clock.now()
        const width = Math.max(16, e.props.bodyColumns)
        const height = Math.max(6, e.props.scroll.bodyRows)
        const busyDirs = activeFolders(acts, now, t.root)

        // The changes take up to their share of the rows (all of them with no tree), the tree the rest.
        const header = p.showTree ? HEADER_ROWS : 0
        const budget = p.showTree ? Math.max(4, Math.floor(height * SECTION_SHARE)) : height
        let section = layout(written, budget - 1)
        if (section.left > 0) section = layout(written, budget - 2)
        const sectionRows =
          written.length === 0 ? 0 : p.diffsHidden ? 1 : 1 + section.blocks.reduce((sum, b) => sum + b.rows, 0) + (section.left > 0 ? 1 : 0)
        room = Math.max(1, height - header - sectionRows)

        const { rows, showing } = p.showTree ? treeRows(t, acts, f) : { rows: [], showing: false }
        // Following the agent, the window is checked at every drawing: the room changes as the changes grow.
        const target = p.manual ? undefined : followed(t, acts)
        const from = windowFor(p.offset, target ? rowOf(rows, t, target) : -1, room, rows.length, Math.floor(room / 3))
        drawnFrom = from
        const shown = rows.slice(from, from + room)
        const focusLabel = `${showing ? '◉' : '○'} foco${f.mode === 'on' ? ' fixo' : f.mode === 'off' ? ' desligado' : ''}`

        const total = tailOf(g.lines[t.root], undefined)
        const head = fitRow('', basename(t.root), total.map(part => part.text).join(' '), width)
        const ruleLabel = '─ Alterações '
        const ruleKeys = p.diffsHidden ? 'c: limpar  d: mostrar' : 'c: limpar  d: ocultar'
        // What the focus ring walks, in drawing order, for the ui.focus hook to step past the icons.
        order = [
          ...(p.showTree ? ['focus'] : []),
          ...shown.flatMap(row => (row.kind !== 'node' ? [] : row.node.kind === 'file' ? [row.node.path, openKey(row.node.path)] : [row.node.path])),
          ...(written.length > 0 ? ['clear', 'diffs'] : []),
          ...(p.diffsHidden ? [] : section.blocks.flatMap(({ change }) => [`change:${change.path}`, diffKey(change.path)])),
        ]
        // A chip shown under the pointer right after a row's name, or over its line counts when the
        // name leaves no room before them.
        const opener = (key: string, lead: string, fit: { name: string; tail: string }, onPress: () => void) => {
          const at = lead.length + fit.name.length + 1
          const fits = at + OPENER.length <= width - (fit.tail ? fit.tail.length + 1 : 0)
          return (
            <Box position="absolute" {...(fits ? { left: at } : { right: 0 })} display="none" hover={{ display: 'flex' }}>
              {!fits && <Text>{' '.repeat(fit.tail ? fit.tail.length + 1 : 1)}</Text>}
              <Button key={key} plain onPress={onPress}>
                <Text backgroundColor="suggestion" color="inverseText">{OPENER}</Text>
              </Button>
            </Box>
          )
        }

        return (
          <Box flexDirection="column">
            {p.showTree && (
              <Text wrap="truncate-end">
                <Text bold>{head.name}</Text>
                {head.pad}
                {head.tail && total.map((part, i) => <Text key={`total-${i}`} color={part.color}>{(i ? ' ' : '') + part.text}</Text>)}
              </Text>
            )}
            {p.showTree && (
              <Box flexDirection="row" justifyContent="space-between">
                <Box flexShrink={1}>
                  <Text wrap="truncate-end" color={g.isDetached ? 'warning' : 'cyan'}>
                    {g.top ? `${g.isDetached ? '◆' : '⎇'} ${g.branch}` : ''}
                    {g.ahead > 0 && <Text color="success"> ↑{g.ahead}</Text>}
                    {g.behind > 0 && <Text color="error"> ↓{g.behind}</Text>}
                  </Text>
                </Box>
                <Box>
                  <Button key="focus" plain hotkey="f" onPress={() => void toggleFocus($, showing)}>
                    <Text color={showing ? 'claude' : undefined} dimColor={!showing}>
                      {focusLabel}
                    </Text>
                  </Button>
                </Box>
              </Box>
            )}
            {shown.map(row => {
              if (row.kind === 'more')
                return (
                  <Text key={row.key} dimColor wrap="truncate-end">
                    {INDENT.repeat(row.depth)}
                    {moreLabel(row.count, row.what)}
                  </Text>
                )
              const { node, depth, label } = row
              const isDir = node.kind === 'dir'
              const open = row.isOpen
              const code = codeAt(g, node.path)
              const act = acts[node.path]
              const marked = markOf(act, now)
              // A collapsed folder with the agent inside pulses too.
              const busy = isDir && !open ? busyDirs.get(node.path) : undefined
              const glyph = isDir ? (open ? '▾' : '▸') : marked === 'active' ? '●' : marked === 'recent' ? '○' : ' '
              const lead = `${INDENT.repeat(depth)}${glyph} `
              const tail = tailOf(g.lines[node.path], code)
              const fit = fitRow(lead, label, tail.map(part => part.text).join(' '), width)
              const gitColor: Color | undefined =
                code && code !== '!' ? CODE_COLOR[code] : isDir ? (g.changed[node.path] ? 'warning' : 'suggestion') : undefined
              const glow = act && marked === 'active' ? shade(act.tone, beatNow) : busy ? shade(busy, beatNow) : undefined
              const glyphColor = !isDir && act ? (marked === 'active' ? glow : baseShade(act.tone)) : undefined
              const line = (
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
                      {fit.name}
                    </Text>
                    {fit.pad}
                    {fit.tail && tail.map((part, i) => <Text key={`${node.path}-tail-${i}`} color={part.color}>{(i ? ' ' : '') + part.text}</Text>)}
                  </Text>
                </Button>
              )
              if (node.kind !== 'file') return line
              return (
                <Box key={`row:${node.path}`} flexDirection="row" width={width}>
                  {line}
                  {opener(openKey(node.path), lead, fit, () => opening($, openFile($, node.path)))}
                </Box>
              )
            })}
            {p.showTree && shown.length < room && written.length > 0 && <Box height={room - shown.length} />}
            {written.length > 0 && (
              <Box flexDirection="row" justifyContent="space-between">
                <Box flexShrink={1}>
                  <Text dimColor wrap="truncate-end">
                    {ruleLabel}
                    {p.diffsHidden ? `(${written.length}) ` : ''}
                    {'─'.repeat(Math.max(1, width - ruleLabel.length - ruleKeys.length - 2))}
                  </Text>
                </Box>
                <Box>
                  <Button key="clear" plain hotkey="c" onPress={() => void update($, changes, () => [])}>
                    <Text dimColor>limpar</Text>
                  </Button>
                  <Text> </Text>
                  <Button key="diffs" plain hotkey="d" onPress={() => void update($, panel, cur => ({ ...cur, diffsHidden: !cur.diffsHidden }))}>
                    <Text dimColor>{p.diffsHidden ? 'mostrar' : 'ocultar'}</Text>
                  </Button>
                </Box>
              </Box>
            )}
            {!p.diffsHidden &&
              section.blocks.map(({ change, isOpen, source, rest }) => {
                const marked = change.outside ? undefined : markOf(acts[change.path], now)
                const name = shownPath(change.path, t.root, home) + (change.outside ? ' ↗' : '')
                const counts = tailOf(!change.outside && g.lines[change.path] ? g.lines[change.path] : [change.added, change.removed], undefined)
                const glyph = change.hunks.length === 0 ? '·' : isOpen ? '▾' : '▸'
                const fit = fitRow(`${glyph} `, name, counts.map(part => part.text).join(' '), width)
                return (
                  <Box key={`change-${change.path}`} flexDirection="column">
                    <Box key={`row-change:${change.path}`} flexDirection="row" width={width}>
                      <Button key={`change:${change.path}`} plain onPress={() => void toggleChange($, change.path, isOpen)}>
                        <Text wrap="truncate-end">
                          {glyph}{' '}
                          <Text bold color={marked === 'active' ? shade('write', beatNow) : change.outside ? 'subtle' : undefined}>
                            {fit.name}
                          </Text>
                          {fit.pad}
                          {fit.tail && counts.map((part, i) => <Text key={`${change.path}-n-${i}`} color={part.color}>{(i ? ' ' : '') + part.text}</Text>)}
                        </Text>
                      </Button>
                      {opener(diffKey(change.path), `${glyph} `, fit, () => opening($, openChange($, change.path)))}
                    </Box>
                    {source && <Code format="diff" source={source} path={change.path} wrap="truncate-end" />}
                    {rest > 0 && (
                      <Text dimColor wrap="truncate-end">
                        {'  '}⋯ +{rest} {rest === 1 ? 'linha' : 'linhas'}
                      </Text>
                    )}
                  </Box>
                )
              })}
            {!p.diffsHidden && section.left > 0 && (
              <Text dimColor wrap="truncate-end">
                ⋯ mais {section.left} {section.left === 1 ? 'arquivo' : 'arquivos'}
              </Text>
            )}
          </Box>
        )
      })()
    } catch (err) {
      const { Text } = $.ui.resolve(e)
      return (
        <Text color="error">
          filetree-hiroshi: {err instanceof Error ? err.message : String(err)}
        </Text>
      )
    }
  })
}
