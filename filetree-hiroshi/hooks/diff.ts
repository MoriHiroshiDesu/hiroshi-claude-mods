// The changes section as plain data: hunks taken from a tool's result, gathered per file,
// and cut to the rows the pane has. No `$`, so the tests drive it without the engine.
import type { Change, Hunk } from '../types'

const MAX_HUNKS = 20 // kept per file, newest first
const MAX_LINES = 200 // kept per hunk

// The hunks an Edit or Write left in its result; a new file written whole is one hunk of
// added lines, since its patch is empty.
export function hunksOf(result: unknown): Hunk[] {
  const r = (result ?? {}) as { type?: unknown; content?: unknown; structuredPatch?: unknown }
  const patch = Array.isArray(r.structuredPatch) ? r.structuredPatch : []
  const hunks = patch
    .map(h => h as { oldStart?: unknown; newStart?: unknown; lines?: unknown })
    .filter(h => typeof h.oldStart === 'number' && typeof h.newStart === 'number' && Array.isArray(h.lines))
    .map(h => ({
      oldStart: h.oldStart as number,
      newStart: h.newStart as number,
      lines: (h.lines as unknown[]).filter((l): l is string => typeof l === 'string' && /^[ +-]/.test(l)).slice(0, MAX_LINES),
    }))
    .filter(h => h.lines.length > 0)
  if (hunks.length === 0 && r.type === 'create' && typeof r.content === 'string' && r.content !== '') {
    const lines = r.content.replace(/\n$/, '').split('\n')
    return [{ oldStart: 0, newStart: 1, lines: lines.slice(0, MAX_LINES).map(l => `+${l}`) }]
  }
  return hunks
}

export function countLines(hunks: readonly Hunk[]): [number, number] {
  let add = 0
  let del = 0
  for (const h of hunks) for (const l of h.lines) l[0] === '+' ? add++ : l[0] === '-' ? del++ : 0
  return [add, del]
}

// A change as an older version of the mod kept it (no hunks yet), brought to today's shape.
export function normalizeChange(c: Partial<Change> & { path: string }): Change {
  const hunks = Array.isArray(c.hunks) ? c.hunks : []
  const [added, removed] = countLines(hunks)
  return {
    path: c.path,
    outside: c.outside === true,
    at: typeof c.at === 'number' ? c.at : 0,
    hunks,
    added: typeof c.added === 'number' ? c.added : added,
    removed: typeof c.removed === 'number' ? c.removed : removed,
    ...(typeof c.expanded === 'boolean' ? { expanded: c.expanded } : {}),
  }
}

// The newest write first: a file written again moves to the top, its new hunks ahead of the old.
export function recordChange(changes: readonly Change[], path: string, outside: boolean, now: number, hunks: readonly Hunk[] = []): Change[] {
  const was = changes.find(c => c.path === path)
  const all = [...hunks, ...(was?.hunks ?? [])].slice(0, MAX_HUNKS)
  const [added, removed] = countLines(all)
  const change: Change = { path, outside, at: now, hunks: all, added, removed, ...(was?.expanded === undefined ? {} : { expanded: was.expanded }) }
  return [change, ...changes.filter(c => c.path !== path)]
}

// A unified diff of the hunks, cut after `max` lines; each header counts only the lines
// kept, so a cut hunk still parses.
export function clipHunks(hunks: readonly Hunk[], max: number): { source: string; shown: number; rest: number; parts: number } {
  const out: string[] = []
  let shown = 0
  let total = 0
  let parts = 0
  for (const h of hunks) {
    total += h.lines.length
    const room = max - shown
    if (room <= 0) continue
    const kept = h.lines.slice(0, room)
    const olds = kept.filter(l => l[0] !== '+').length
    const news = kept.filter(l => l[0] !== '-').length
    out.push(`@@ -${h.oldStart},${olds} +${h.newStart},${news} @@`, ...kept.map(l => l.replace(/\t/g, '  ')))
    shown += kept.length
    parts++
  }
  return { source: out.join('\n'), shown, rest: total - shown, parts }
}

export type Block = { change: Change; isOpen: boolean; source: string; shown: number; rest: number; rows: number }

// The section in `budget` rows: a header row per file and, for open ones, their lines (a
// row between hunks, one for "more"); the newest file opens unless the person closed it.
// What does not fit is counted in `left`.
export function layout(changes: readonly Change[], budget: number, perFile = 12): { blocks: Block[]; left: number } {
  const blocks: Block[] = []
  let used = 0
  for (const [i, change] of changes.entries()) {
    if (used + 1 > budget) return { blocks, left: changes.length - i }
    used += 1
    const isOpen = change.expanded ?? i === 0
    if (!isOpen || change.hunks.length === 0) {
      blocks.push({ change, isOpen, source: '', shown: 0, rest: 0, rows: 1 })
      continue
    }
    // Leave a row for each file still below while there is room for it.
    const reserve = Math.min(changes.length - i - 1, Math.max(0, budget - used - 3))
    const room = Math.min(perFile, budget - used - reserve)
    // a hunk costs a row of its own between the previous one and itself, and "more" one row
    let max = room
    let clip = clipHunks(change.hunks, max)
    while (max > 0 && clip.shown + (clip.parts - 1) + (clip.rest > 0 ? 1 : 0) > room) clip = clipHunks(change.hunks, --max)
    const rows = clip.shown === 0 ? 0 : clip.shown + (clip.parts - 1) + (clip.rest > 0 ? 1 : 0)
    used += rows
    blocks.push({ change, isOpen, source: clip.shown ? clip.source : '', shown: clip.shown, rest: clip.shown ? clip.rest : 0, rows: rows + 1 })
  }
  return { blocks, left: 0 }
}
