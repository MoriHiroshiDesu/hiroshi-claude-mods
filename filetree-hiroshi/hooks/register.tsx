// filetree-hiroshi: the session's folder as a tree in a side pane.
//   Inspired by data-goblin/claude-code-filetree (MIT). Phase 1 of filetree-hiroshi/PLANO.md:
//   the pane, the tree read on demand, folders opened and closed by a press, /filetree to
//   open or close it. The engine scrolls the pane: the hook draws every visible row.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Panel, Tree } from '../types'
import { basename, emptyTree, isExpanded, needsListing, posix, toggle, visibleRows, withChildren } from './tree'

const PANE = 'filetree-hiroshi'
const TITLE = 'filetree'
const INDENT = '  '

// Held by the host, so the tree survives a hot reload of this file.
const tree = atom({ plugin: 'filetree-hiroshi', key: 'tree' } as const, emptyTree())
const panel = atom({ plugin: 'filetree-hiroshi', key: 'panel' } as const, { closedByUser: false, showTree: false } as Panel)

// Reads a folder into the tree; one that cannot be read counts as empty, so it is not retried on every press.
async function list($: EngineInterface, dir: string) {
  const entries = await $.fs.list(dir).catch(() => [])
  await update($, tree, t => withChildren(t, dir, entries))
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

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const r = await next(e)
    await $.command.register({ name: 'filetree', description: 'Abre ou fecha a árvore de arquivos da sessão' }).catch(() => {}) // a name Claude Code already has is refused: start anyway
    const root = posix(e.cwd)
    // A hot reload starts the session again with the same folder: keep what was open.
    if ((await read($, tree)).root !== root) await update($, tree, () => emptyTree(root))
    await list($, root)
    return r
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
    const rows = visibleRows(t)
    return (
      <Box flexDirection="column">
        <Text bold wrap="truncate-end">
          {basename(t.root)}
        </Text>
        {rows.map(({ node, depth }) => {
          const isDir = node.kind === 'dir'
          const glyph = isDir ? (isExpanded(t, node.path) ? '▾' : '▸') : ' '
          return (
            <Button key={node.path} plain onPress={() => void press($, node.path)}>
              <Text wrap="truncate-end">
                {INDENT.repeat(depth)}
                {glyph}{' '}
                <Text
                  bold={node.path === t.cursor}
                  color={isDir ? 'suggestion' : undefined}
                  dimColor={node.kind === 'link' || node.name.startsWith('.')}
                  italic={node.kind === 'link'}
                >
                  {node.name}
                </Text>
              </Text>
            </Button>
          )
        })}
      </Box>
    )
  })
}
