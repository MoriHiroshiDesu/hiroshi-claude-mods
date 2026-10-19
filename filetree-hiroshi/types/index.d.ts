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

export type Panel = {
  closedByUser: boolean
  // Whether the pane draws the tree (false while it only has writes outside the session's folder).
  showTree: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'filetree-hiroshi': { tree: Tree; panel: Panel }
  }
}
