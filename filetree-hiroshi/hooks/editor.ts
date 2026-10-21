// Opening a file or a change in the editor, as plain data: which editor, the command that
// opens it there, where the "before" side of a diff is kept, and the focus ring's way past
// the ⧉ icons. The tests drive all of it without the engine.
import { basename } from './tree'

export type Editor = 'zed' | 'code'

export const EDITORS: readonly Editor[] = ['zed', 'code']
export const OPENER = ' ⧉ abrir '
// With the Nerd Font icons on, an "external link" icon (the same length) says it opens elsewhere.
export const OPENER_NERD = ' \uf08e abrir '

// The keys of the Buttons the focus ring passes over: a row's ⧉ in the tree and in the
// changes section.
export const openKey = (path: string) => `abrir:${path}`
export const diffKey = (path: string) => `abrir-diff:${path}`

export const isIcon = (key: string | undefined) => key?.startsWith('abrir') === true

// The row a ⧉ sits on: a tree row is keyed by its path, a change by `change:` and its path.
function homeOf(key: string): string | undefined {
  if (key.startsWith('abrir:')) return key.slice(6)
  if (key.startsWith('abrir-diff:')) return `change:${key.slice(11)}`
  return undefined
}

// Where the ring goes instead of a ⧉, given the keys in drawing order: from elsewhere (a
// click, or Shift+Tab from the row below) to the icon's own row; from its own row, on in
// the direction it moved, past every icon, round to the other end when none is left.
export function skipIcons(order: readonly string[], from: string | undefined, to: string): string | undefined {
  const home = homeOf(to)
  if (home !== undefined && home !== from && order.includes(home)) return home
  const at = order.indexOf(to)
  if (at < 0) return undefined
  const step = from !== undefined && order.indexOf(from) > at ? -1 : 1
  for (let n = 1; n < order.length; n++) {
    const key = order[(at + step * n + order.length * n) % order.length] as string
    if (!isIcon(key)) return key
  }
  return undefined
}

// The configured editor; on `auto`, the one whose terminal the session runs in, else the
// first installed. $EDITOR is no guide: it is often a terminal editor.
export function chooseEditor(setting: unknown, termProgram: string | undefined, installed: readonly Editor[]): Editor | undefined {
  if (setting === 'zed' || setting === 'code') return setting
  const term: Editor | undefined = termProgram === 'vscode' ? 'code' : termProgram === 'zed' ? 'zed' : undefined
  if (term && installed.includes(term)) return term
  return EDITORS.find(editor => installed.includes(editor))
}

// `which zed code` prints the path of each it finds, one per line.
export function installedFrom(which: string): Editor[] {
  const found = which.split('\n').map(line => basename(line.trim()))
  return EDITORS.filter(editor => found.includes(editor))
}

const at = (path: string, line: number | undefined) => (line !== undefined && line > 0 ? `${path}:${line}` : path)

// Always with the project's folder: Zed takes the window whose folder holds it, VS Code
// only the window of exactly that folder, and without one either may pick another project's.
// When the folder has no window of its own, Zed would add it to the active window, beside
// whatever project is there: `fresh` gives it one (-n, which opens a window every time).
export function openArgv(editor: Editor, root: string, path: string, line?: number, fresh = false): string[] {
  if (editor === 'code') return ['code', root, '-g', at(path, line)]
  return fresh ? ['zed', '-n', root, at(path, line)] : ['zed', root, at(path, line)]
}

// VS Code shows the two sides in a tab of the project's window. Zed's --diff opens another
// window however it is called, so there the change opens as the file at its newest hunk,
// where Zed marks the lines changed against HEAD.
export function diffArgv(editor: Editor, root: string, before: string, path: string, line?: number, fresh = false): string[] {
  return editor === 'code' ? ['code', root, '--diff', before, path] : openArgv(editor, root, path, line, fresh)
}

// Zed's CLI cannot list its windows; its own database can. Each open project is a row of
// `workspaces` stamped with the running session's id (kv_store's session_id), and the stamp
// is cleared when its window closes; projects in one window share its window_id. The
// format is Zed's own and may change: any failure prints nothing and the caller opens as
// before. Read-only, with python3, as sqlite3 is seldom installed.
export const ZED_WINDOWS_PY = `
import json, os, sqlite3, sys
db = os.path.join(os.environ.get('XDG_DATA_HOME') or os.path.expanduser('~/.local/share'), 'zed/db/0-stable/db.sqlite')
c = sqlite3.connect('file:' + db + '?mode=ro', uri=True, timeout=2)
s = c.execute("select value from kv_store where key = 'session_id'").fetchone()
if not s: sys.exit(1)
rows = c.execute('select paths, window_id from workspaces where session_id = ?', (s[0],)).fetchall()
print(json.dumps([{'paths': p.split('\\n') if p else [], 'window': w} for p, w in rows]))
`

export type ZedWorkspace = { paths: string[]; window: number | null }

const trimmed = (path: string) => path.replace(/\/+$/, '') || '/'

// Whether the project's folder is open in a window that holds nothing else; when it is,
// opening reuses that window, and otherwise it gets one of its own.
export function hasOwnWindow(rows: readonly ZedWorkspace[], root: string): boolean {
  const home = rows.find(row => row.paths.length === 1 && trimmed(row.paths[0] as string) === trimmed(root))
  if (!home || home.window === null) return false
  return rows.every(row => row === home || row.window !== home.window)
}

export const needsBefore = (editor: Editor) => editor === 'code'

// A short, stable name for a path, so two files of the same name keep apart.
export function hashOf(text: string): string {
  let h = 5381
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0
  return h.toString(36)
}

// Where the "before" side of a file is written: HEAD's version, or the copy taken before
// the agent's first write this session. The file's own name stays, for the editor's tab.
export function beforePath(dir: string, path: string, side: 'HEAD' | 'antes'): string {
  return `${dir}/${hashOf(path)}/${basename(path)}.${side}`
}

// The folder of this session's temporary files: removed at its end, and only one such.
export const tempDir = (tmp: string, now: number) => `${tmp.replace(/\/+$/, '') || '/tmp'}/filetree-hiroshi-${now}`
export const isTempDir = (dir: string) => /\/filetree-hiroshi-\d+$/.test(dir)
