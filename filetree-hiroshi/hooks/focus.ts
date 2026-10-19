// Focus mode as plain data: the tree cut down to the way to the files the agent touched,
// the rest summed up in `⋯ N` rows. It only shapes what is drawn: `expanded` is never
// changed, so leaving focus brings the tree back exactly as it was.
import type { Tree, TreeNode } from '../types'
import { ancestors, inside, visibleRows } from './tree'

export type FocusRow =
  // A row of the tree; `label` joins a chain of folders that each show one folder ("git-band/hooks").
  | { kind: 'node'; node: TreeNode; depth: number; label: string; isOpen: boolean }
  | { kind: 'more'; key: string; depth: number; count: number; what: 'itens' | 'pastas' | 'arquivos' }

// Focus stays on this long after the agent's last active file goes quiet.
export const RELEASE_MS = 3000

const ONE = { itens: 'item', pastas: 'pasta', arquivos: 'arquivo' } as const

// `⋯ 21 arquivos`, `⋯ 1 pasta`.
export const moreLabel = (count: number, what: 'itens' | 'pastas' | 'arquivos') => `⋯ ${count} ${count === 1 ? ONE[what] : what}`

export function project(tree: Tree, targets: readonly string[]): FocusRow[] {
  const wanted = targets.filter(path => inside(tree.root, path) && path !== tree.root && path in tree.nodes)
  if (wanted.length === 0) return []
  const keep = new Set<string>()
  const through = new Set<string>() // folders shown open: they lead to a target
  for (const path of wanted) {
    keep.add(path)
    for (const dir of ancestors(tree.root, path)) {
      keep.add(dir)
      through.add(dir)
    }
  }

  const rows: FocusRow[] = []
  const walk = (dir: string, depth: number) => {
    const children = tree.nodes[dir]?.children ?? []
    let hidden: TreeNode[] = []
    const flush = (at: number) => {
      if (hidden.length === 0) return
      const dirs = hidden.filter(n => n.kind === 'dir').length
      const what = dirs === hidden.length ? 'pastas' : dirs === 0 ? 'arquivos' : 'itens'
      rows.push({ kind: 'more', key: `${dir}#${at}`, depth, count: hidden.length, what })
      hidden = []
    }
    children.forEach((path, i) => {
      const node = tree.nodes[path]
      if (!node) return
      if (!keep.has(path)) {
        hidden.push(node)
        return
      }
      flush(i)
      // A folder whose only shown child is a folder leading on is drawn on one row with it.
      let last = node
      let label = node.name
      while (through.has(last.path)) {
        const shown = (last.children ?? []).filter(child => keep.has(child))
        const only = shown.length === 1 ? tree.nodes[shown[0] as string] : undefined
        if (!only || only.kind !== 'dir' || !through.has(only.path)) break
        last = only
        label = `${label}/${only.name}`
      }
      const isOpen = through.has(last.path)
      rows.push({ kind: 'node', node: last, depth, label, isOpen })
      if (isOpen) walk(last.path, depth + 1)
    })
    flush(children.length)
  }
  walk(tree.root, 0)
  return rows
}

// Whether the active files are too far apart in the tree to be seen together: the rows
// between the first and the last (each counted where it shows, or at its closed folder)
// outnumber the rows the pane has.
export function spreadOut(tree: Tree, active: readonly string[], room: number): boolean {
  if (active.length < 2) return false
  const rows = visibleRows(tree).map(row => row.node.path)
  const at = (path: string) => {
    for (const p of [path, ...ancestors(tree.root, path).reverse()]) {
      const i = rows.indexOf(p)
      if (i >= 0) return i
    }
    return -1
  }
  const places = active.map(at).filter(i => i >= 0)
  if (places.length < 2) return false
  return Math.max(...places) - Math.min(...places) + 1 > room
}
