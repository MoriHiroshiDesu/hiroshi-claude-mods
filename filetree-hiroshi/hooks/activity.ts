// What the agent is doing where, as plain data: no `$`, so the tests drive it without the engine.
import type { Act, Change, GitState, Tone } from '../types'
import { dirname, inside, join, posix } from './tree'

// A path stays active (the pulsing ●) this long after the agent last touched it; then it
// is recent (○) until the next prompt.
export const ACTIVE_MS = 4000
// A search marks at most this many of the files it found.
export const SEARCH_LIMIT = 5

export type Activity = Record<string, Act>

// The paths touched with a tone, `live` counting calls still running. A write is not
// turned back into a read while it is still active.
export function mark(acts: Activity, paths: readonly string[], tone: Tone, now: number, live: -1 | 0 | 1): Activity {
  const out = { ...acts }
  for (const path of paths) {
    const was = out[path]
    const keepWrite = was?.tone === 'write' && tone === 'read' && now - was.at < ACTIVE_MS
    out[path] = { tone: keepWrite ? 'write' : tone, at: now, live: Math.max(0, (was?.live ?? 0) + live) }
  }
  return out
}

export type Mark = 'active' | 'recent'

export function markOf(act: Act | undefined, now: number): Mark | undefined {
  if (!act) return undefined
  return act.live > 0 || now - act.at < ACTIVE_MS ? 'active' : 'recent'
}

export const anyActive = (acts: Activity, now: number) => Object.values(acts).some(act => markOf(act, now) === 'active')

// The folders that hold an active path, so a collapsed folder still shows the agent is inside it.
export function activeFolders(acts: Activity, now: number, root: string): Map<string, Tone> {
  const out = new Map<string, Tone>()
  for (const [path, act] of Object.entries(acts)) {
    if (markOf(act, now) !== 'active') continue
    for (let dir = dirname(path); inside(root, dir) && dir !== root; dir = dirname(dir)) {
      if (out.get(dir) !== 'write') out.set(dir, act.tone)
    }
  }
  return out
}

// The tone's colors in turn, one step per pulse: a glow that brightens and fades.
const SHADES: Record<Tone, string[]> = {
  write: ['#d97757', '#e4906f', '#efaa88', '#e4906f'],
  // A strong blue: folders are drawn lavender, and green is git's color for a new file.
  read: ['#2f80ff', '#4f95ff', '#70aaff', '#4f95ff'],
}

export const shade = (tone: Tone, pulse: number) => SHADES[tone][pulse % SHADES[tone].length] as string
export const baseShade = (tone: Tone) => SHADES[tone][0] as string

// The newest write first; a file written again moves to the top.
export function recordChange(changes: readonly Change[], path: string, outside: boolean, now: number): Change[] {
  return [{ path, outside, at: now }, ...changes.filter(c => c.path !== path)]
}

// How a change is named: from the session's folder inside it, from ~ outside it.
export function shownPath(path: string, root: string, home: string): string {
  if (inside(root, path) && path !== root) return path.slice(root.length + 1)
  if (home && inside(home, path)) return `~${path.slice(home.length)}`
  return path
}

// A tool's path argument, made absolute against the folder it ran in.
export const absolute = (path: string, cwd: string) => posix(path.startsWith('/') ? path : join(cwd, path))

// The words of a shell command that may be files: no options, globs, variables or redirections.
export function pathWords(command: string): string[] {
  const words = command.split(/[\s;|&()<>]+/).map(w => w.replace(/^['"]|['"]$/g, ''))
  return [...new Set(words.filter(w => w && !w.startsWith('-') && !/[*?$=`{}]/.test(w) && (w.includes('/') || /\.\w+$/.test(w))))]
}

// The files git saw change between two reads: a new code, or new line counts.
export function gitChanges(before: GitState, after: GitState): string[] {
  const paths = new Set([...Object.keys(before.files), ...Object.keys(after.files)])
  return [...paths].filter(path => {
    const code = after.files[path]
    if (code === '!' || code === 'D') return false
    return before.files[path] !== code || JSON.stringify(before.lines[path]) !== JSON.stringify(after.lines[path])
  })
}
