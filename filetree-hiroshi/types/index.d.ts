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
}

export type Tone = 'read' | 'write'

// What the agent did to a path this turn: the tone, when it last touched it, and how
// many of its calls on it are still running.
export type Act = { tone: Tone; at: number; live: number }

// A file the agent wrote this session, the most recent first.
export type Change = { path: string; outside: boolean; at: number }

declare module 'claude-code' {
  interface PluginState {
    'filetree-hiroshi': {
      tree: Tree
      panel: Panel
      git: GitState
      activity: Record<string, Act>
      pulse: number
      changes: Change[]
    }
  }
}
