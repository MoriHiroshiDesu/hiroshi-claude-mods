// The tree as plain data: no `$`, so the tests drive it without the engine.
import type { FsEntry } from 'claude-code'

import type { NodeKind, Tree, TreeNode } from '../types'

// Never listed: git's own folder.
const HIDDEN = new Set(['.git'])

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

export const posix = (path: string) => path.replace(/\\/g, '/').replace(/\/+$/, '') || '/'

export const join = (dir: string, name: string) => (dir === '/' ? `/${name}` : `${dir}/${name}`)

export const dirname = (path: string) => {
  const at = path.lastIndexOf('/')
  return at <= 0 ? '/' : path.slice(0, at)
}

export const basename = (path: string) => path.slice(path.lastIndexOf('/') + 1) || path

export const inside = (root: string, path: string) => path === root || path.startsWith(root === '/' ? '/' : `${root}/`)

export const emptyTree = (root = ''): Tree => ({
  root,
  nodes: root ? { [root]: { path: root, name: basename(root), kind: 'dir' } } : {},
  expanded: root ? [root] : [],
  cursor: root,
})

const kindOf = (entry: FsEntry): NodeKind => (entry.isLink ? 'link' : entry.kind === 'dir' ? 'dir' : 'file')

// Folders first, then files, each in natural order (file2 before file10).
export function sortEntries(entries: readonly FsEntry[]): FsEntry[] {
  return entries
    .filter(entry => !HIDDEN.has(entry.name))
    .slice()
    .sort((a, b) => (a.kind === 'dir' ? 0 : 1) - (b.kind === 'dir' ? 0 : 1) || collator.compare(a.name, b.name))
}

// The folder's listing in place: new children added, gone ones dropped (with what lay below them).
export function withChildren(tree: Tree, dir: string, entries: readonly FsEntry[]): Tree {
  const nodes = { ...tree.nodes }
  const parent = nodes[dir]
  if (!parent) return tree
  const sorted = sortEntries(entries)
  const children = sorted.map(entry => join(dir, entry.name))
  // The same listing returns the same tree, so a refresh that found nothing new writes nothing.
  const same =
    parent.children !== undefined &&
    parent.children.length === children.length &&
    sorted.every((entry, i) => parent.children?.[i] === children[i] && nodes[children[i] as string]?.kind === kindOf(entry))
  if (same) return tree
  const kept = new Set(children)
  for (const old of parent.children ?? []) if (!kept.has(old)) dropBelow(nodes, old)
  sorted.forEach((entry, i) => {
    const path = children[i] as string
    const was = nodes[path]
    const kind = kindOf(entry)
    nodes[path] = was && was.kind === kind ? was : { path, name: entry.name, kind }
  })
  nodes[dir] = { ...parent, children }
  const expanded = tree.expanded.filter(path => path in nodes)
  return { ...tree, nodes, expanded, cursor: tree.cursor in nodes ? tree.cursor : dir }
}

function dropBelow(nodes: Record<string, TreeNode>, path: string) {
  for (const child of nodes[path]?.children ?? []) dropBelow(nodes, child)
  delete nodes[path]
}

export type Row = { node: TreeNode; depth: number }

// The rows the tree shows: the root's children, and each expanded folder's, depth first.
export function visibleRows(tree: Tree): Row[] {
  const rows: Row[] = []
  const open = new Set(tree.expanded)
  const walk = (dir: string, depth: number) => {
    for (const path of tree.nodes[dir]?.children ?? []) {
      const node = tree.nodes[path]
      if (!node) continue
      rows.push({ node, depth })
      if (node.kind === 'dir' && open.has(path)) walk(path, depth + 1)
    }
  }
  if (tree.root) walk(tree.root, 0)
  return rows
}

export const isExpanded = (tree: Tree, path: string) => tree.expanded.includes(path)

// The folders between the root and a path, top first, neither end included.
export function ancestors(root: string, path: string): string[] {
  const out: string[] = []
  for (let dir = dirname(path); inside(root, dir) && dir !== root; dir = dirname(dir)) out.unshift(dir)
  return out
}

export const expand = (tree: Tree, dirs: readonly string[]): Tree => ({
  ...tree,
  expanded: [...new Set([...tree.expanded, ...dirs.filter(dir => dir in tree.nodes)])],
})

export function toggle(tree: Tree, path: string): Tree {
  const expanded = isExpanded(tree, path) ? tree.expanded.filter(p => p !== path) : [...tree.expanded, path]
  return { ...tree, expanded, cursor: path }
}

// A row is `lead` (indent and glyph), the name, padding, then `tail` flush right; past the
// width the name is cut with an ellipsis, and below one character the tail is dropped.
export function fitRow(lead: string, name: string, tail: string, width: number): { name: string; pad: string; tail: string } {
  const room = width - lead.length - (tail ? tail.length + 1 : 0)
  if (tail && room < 1) return fitRow(lead, name, '', width)
  const shown = name.length <= room ? name : `${name.slice(0, Math.max(0, room - 1))}…`
  const pad = tail ? ' '.repeat(Math.max(1, width - lead.length - shown.length - tail.length)) : ''
  return { name: shown, pad, tail }
}

// The first row of a window of `rows` rows over `total` that shows row `at`, `margin`
// rows from either edge when it can; `from` when it already does.
export function windowFor(from: number, at: number, rows: number, total: number, margin: number): number {
  const top = Math.max(0, Math.min(from, total - rows))
  if (at < 0) return top
  const m = Math.min(margin, Math.floor((rows - 1) / 2))
  if (at >= top + m && at <= top + rows - 1 - m) return top
  return Math.max(0, Math.min(at < top + m ? at - m : at - rows + 1 + m, total - rows))
}

// A folder needs reading when it is open and was never listed.
export const needsListing = (tree: Tree, path: string) =>
  tree.nodes[path]?.kind === 'dir' && tree.nodes[path]?.children === undefined
