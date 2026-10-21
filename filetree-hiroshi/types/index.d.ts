export type NodeKind = 'dir' | 'file' | 'link'

export type TreeNode = {
  path: string // absolute, posix
  name: string
  kind: NodeKind
  // Paths of the children, sorted; undefined until the folder is read.
  children?: string[]
}

export type Tree = {
  root: string // the session's folder; '' before session.start
  nodes: Record<string, TreeNode>
  expanded: string[]
  cursor: string
}

// M modified, A added, D deleted, R renamed, U conflict, ? untracked, ! ignored.
export type GitCode = 'M' | 'A' | 'D' | 'R' | 'U' | '?' | '!'

export type GitState = {
  top: string // the repository's top folder; '' outside a repository
  branch: string // the short hash when detached
  isDetached: boolean
  ahead: number
  behind: number
  // By absolute path. A folder git reports whole (untracked or ignored) is here too.
  files: Record<string, GitCode>
  // Folders holding at least one change (ignored files aside): how many changed files.
  changed: Record<string, number>
  // Lines added and removed against HEAD, by file and summed on each folder above it.
  lines: Record<string, [number, number]>
}

export type Panel = {
  closedByUser: boolean
  // Whether the pane draws the tree (false while it only has writes outside the session's folder).
  showTree: boolean
  // The person scrolled the pane this turn: it stops following the agent until the next prompt.
  manual: boolean
  // The first row of the tree the pane shows: with the changes below it, the tree scrolls on its own.
  offset: number
  // The changes section folded to its rule line (the d key).
  diffsHidden: boolean
}

export type Tone = 'read' | 'write'

// What the agent did to a path this turn: the tone, when it last touched it, and how
// many of its calls on it are still running.
export type Act = { tone: Tone; at: number; live: number }

// One hunk of a unified diff: its lines start with ' ', '+' or '-'.
export type Hunk = { oldStart: number; newStart: number; lines: string[] }

// A file the agent wrote this session, the most recent first: its hunks newest first,
// their lines added and removed, and whether the person opened or closed it in the section.
export type Change = {
  path: string
  outside: boolean
  at: number
  hunks: Hunk[]
  added: number
  removed: number
  expanded?: boolean
}

// `auto` cuts the tree down by itself while the agent's files lie too far apart to show
// together (`engaged`); `on` and `off` are the person's, from the f key, until they press it again.
export type Focus = { mode: 'auto' | 'on' | 'off'; engaged: boolean }

// The before side of the diffs VS Code opens: this session's folder of temporary files, and
// for each file the agent wrote, the copy taken before its first write ('' when the file
// did not exist yet). Files git has in HEAD are compared with that version instead.
export type Before = { dir: string; files: Record<string, string> }

declare module 'claude-code' {
  interface PluginState {
    'filetree-hiroshi': {
      tree: Tree
      panel: Panel
      git: GitState
      activity: Record<string, Act>
      pulse: number
      changes: Change[]
      focus: Focus
      before: Before
      bound: string
    }
  }
}
