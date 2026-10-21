// The Nerd Font icon of a tree row, as plain data: no `$`, so the tests drive it without the engine.
// Every glyph sits in the Private Use Area of the BMP, one column wide in the terminal and one
// UTF-16 unit, which is how `fitRow` measures a row. Only glyphs that Nerd Fonts 2.3 already had
// (checked against MesloLGS NF 2.3.3 and Monaspace Krypton NF): the terminal's own font must draw
// them, because a terminal cannot be counted on to fall back to another font. Warp fails to load
// the Symbols font and, asked for a glyph only it has, blanks the whole screen. So no Codicons past
// `EBEB` (the Claude and OpenAI logos), no Font Awesome 5 and later (`fa-docker`), no Material set
// (`F0001`+, two UTF-16 units) and no older `nf-mdi` range (`F500`-`FD46`, removed in Nerd Fonts 3).
// The exception: a few AI logos from Codicons in Nerd Fonts 3.5, drawn only when the session's
// start found a font that has them where the terminal will look (`newerGlyphsProbe`), else their
// 2.3 stand-in. Written as escapes: the glyphs are invisible in an editor without a Nerd Font.
import type { NodeKind } from '../types'

export type Icon = {
  glyph: string
  // A fixed color for the type. Undefined for folders and links, which take the color of the row.
  color?: string
}

// `nerd` draws the newer logos when the terminal can; `nerd-2.3` never does.
export type IconMode = 'off' | 'nerd' | 'nerd-2.3'

// The `icons` option: anything else keeps the tree as it was.
export const iconMode = (setting: unknown): IconMode => (setting === 'nerd' || setting === 'nerd-2.3' ? setting : 'off')

const FOLDER = '\uf07b'
const FOLDER_OPEN = '\uf07c'
const LINK = '\uf0c1'
const FILE = '\uf15b'
const TEXT = '\uf0f6'
const BOOK = '\uf02d'

const BLUE = '#519aba'
const CYAN = '#4dc0cf'
const YELLOW = '#cbcb41'
const ORANGE = '#e37933'
const RED = '#cc3e44'
const PINK = '#f55385'
const GREEN = '#8dc149'
const PURPLE = '#a074c4'
const GREY = '#8c8c8c'
const KRAFT = '#d4a27f' // Claude's tan: apart from the orange that shows the agent writing
const AGENT = '#a074c4'
const OPENAI = '#10a37f'
const DOCKER = '#2496ed'

const CLAUDE = '\uf069' // fa-asterisk: Nerd Fonts has no Claude logo before 3.5
const ROBOT = '\ueb08' // cod-hubot
const SPARKLE = '\uf0d0' // fa-magic, for Gemini
const BRAIN = '\ue28c' // fae-brain, for Codex
const WHALE = '\uf308' // linux-docker

// The Codicons of Nerd Fonts 3.5, each drawn in place of its stand-in above when the terminal can.
const CLAUDE_LOGO = '\uec82' // cod-claude
const OPENAI_LOGO = '\uec81' // cod-openai
const ROBOT_NEW = '\uec20' // cod-robot
const SPARKLE_NEW = '\uec10' // cod-sparkle
const COPILOT_NEW = '\uec1e' // cod-copilot
export const NEWER_GLYPHS = [CLAUDE_LOGO, OPENAI_LOGO, ROBOT_NEW, SPARKLE_NEW, COPILOT_NEW]

type Entry = Icon & { newer?: string }

const icon = (glyph: string, color?: string, newer?: string): Entry => ({ glyph, color, newer })

// By the whole file name, lower case: the files an extension does not tell apart.
const BY_NAME: Record<string, Entry> = {
  'package.json': icon('\ue616', RED),
  'package-lock.json': icon('\ue672', GREY),
  'yarn.lock': icon('\ue672', GREY),
  'pnpm-lock.yaml': icon('\ue672', GREY),
  'bun.lock': icon('\ue672', GREY),
  'bun.lockb': icon('\ue672', GREY),
  'cargo.lock': icon('\ue672', GREY),
  'tsconfig.json': icon('\ue615', BLUE),
  'jsconfig.json': icon('\ue615', YELLOW),
  dockerfile: icon(WHALE, DOCKER),
  '.dockerignore': icon(WHALE, GREY),
  'claude.md': icon(CLAUDE, KRAFT, CLAUDE_LOGO),
  'claude.local.md': icon(CLAUDE, KRAFT, CLAUDE_LOGO),
  'agents.md': icon(ROBOT, AGENT, ROBOT_NEW),
  'gemini.md': icon(SPARKLE, BLUE, SPARKLE_NEW),
  '.cursorrules': icon(ROBOT, AGENT, ROBOT_NEW),
  'copilot-instructions.md': icon(ROBOT, AGENT, COPILOT_NEW),
  makefile: icon('\ue673', ORANGE),
  '.gitignore': icon('\ue65d', ORANGE),
  '.gitattributes': icon('\ue65d', ORANGE),
  '.gitmodules': icon('\ue65d', ORANGE),
  '.editorconfig': icon('\ue652', GREY),
  '.env': icon('\uf023', YELLOW), // fa-lock: secrets; apart from the lockfiles' padlock
  license: icon('\ue60a', YELLOW),
  licence: icon('\ue60a', YELLOW),
  readme: icon(BOOK, BLUE),
  'readme.md': icon(BOOK, BLUE),
}

// By the extension after the last dot, lower case.
const BY_EXT: Record<string, Entry> = {}
const add = (exts: string, glyph: string, color?: string) => {
  for (const ext of exts.split(' ')) BY_EXT[ext] = icon(glyph, color)
}
add('ts mts cts', '\ue628', BLUE)
add('tsx jsx', '\ue625', CYAN)
add('js mjs cjs', '\ue60c', YELLOW)
add('json jsonc json5', '\ue60b', YELLOW)
add('html htm', '\ue60e', ORANGE)
add('css', '\ue614', BLUE)
add('scss sass', '\ue603', PINK)
add('md mdx markdown', '\ue609', BLUE)
add('py pyi', '\ue606', YELLOW)
add('java', '\ue66d', RED)
add('kt kts', '\ue634', PURPLE)
add('go', '\ue627', CYAN)
add('rs', '\ue68b', ORANGE)
add('rb', '\ue605', RED)
add('php', '\ue608', PURPLE)
add('c h', '\ue649', BLUE)
add('cpp cc cxx hpp hh', '\ue646', BLUE)
add('cs', '\ue648', GREEN)
add('swift', '\ue699', ORANGE)
add('dart', '\ue64c', CYAN)
add('lua', '\ue620', BLUE)
add('zig', '\ue6a9', ORANGE)
add('ex exs', '\ue62d', PURPLE)
add('hs', '\ue61f', PURPLE)
add('scala', '\ue68e', RED)
add('vue', '\ue6a0', GREEN)
add('svelte', '\ue697', ORANGE)
add('sh bash zsh fish', '\ue691', GREEN)
add('ps1', '\ue683', BLUE)
add('yml yaml', '\ue6a8', PURPLE)
add('toml ini cfg conf', '\ue615', GREY)
add('xml', '\ue619', ORANGE)
add('svg', '\ue698', YELLOW)
add('sql', '\ue64d', GREY)
add('csv tsv', '\ue64a', GREEN)
add('lock', '\ue672', GREY)
add('gradle', '\ue660', BLUE)
add('png jpg jpeg gif webp ico bmp avif', '\ue60d', PURPLE)
add('pdf', '\ue67d', RED)
add('zip tar gz tgz rar 7z xz bz2', '\ue6aa', ORANGE)
add('mp4 mov mkv webm', '\ue69f', PURPLE)
add('mp3 wav flac ogg', '\ue638', PURPLE)
add('ttf otf woff woff2', '\ue659', RED)
add('txt log', TEXT)

// Folders that hold what an AI tool reads: one icon for open and closed, in the tool's color.
const BY_FOLDER: Record<string, Entry> = {
  '.claude': icon(CLAUDE, KRAFT, CLAUDE_LOGO),
  '.claude-plugin': icon(CLAUDE, KRAFT, CLAUDE_LOGO),
  '.agents': icon(ROBOT, AGENT, ROBOT_NEW),
  '.agent': icon(ROBOT, AGENT, ROBOT_NEW),
  '.cursor': icon(ROBOT, AGENT, ROBOT_NEW),
  '.codex': icon(BRAIN, OPENAI, OPENAI_LOGO),
  '.gemini': icon(SPARKLE, BLUE, SPARKLE_NEW),
}

// The Docker files with more in the name than the whole name says: `Dockerfile.dev`,
// `docker-compose.override.yml`, `compose.prod.yaml`.
const isDocker = (lower: string) => /^(dockerfile\.|(docker-)?compose(\.[^.]+)*\.ya?ml$)/.test(lower)

function entryFor(name: string, kind: NodeKind, open: boolean): Entry {
  if (kind === 'dir') return BY_FOLDER[name.toLowerCase()] ?? icon(open ? FOLDER_OPEN : FOLDER)
  if (kind === 'link') return icon(LINK)
  const lower = name.toLowerCase()
  const byName = BY_NAME[lower] ?? (lower.startsWith('.env.') ? BY_NAME['.env'] : undefined)
  if (byName) return byName
  if (isDocker(lower)) return icon(WHALE, DOCKER)
  const dot = lower.lastIndexOf('.')
  // A leading dot is part of the name (`.bashrc`), not an extension.
  const ext = dot > 0 ? lower.slice(dot + 1) : ''
  return BY_EXT[ext] ?? icon(FILE)
}

// `newer`: the terminal can draw the Nerd Fonts 3.5 logos (see `newerGlyphsProbe`).
export function iconFor(name: string, kind: NodeKind, open = false, newer = false): Icon {
  const entry = entryFor(name, kind, open)
  return { glyph: newer && entry.newer ? entry.newer : entry.glyph, color: entry.color }
}

// No terminal says whether it can draw a glyph, so the session's start asks fontconfig instead.
// Warp falls back to no other font (and blanks the screen when one would be needed): only the
// font set in its settings counts. Other terminals on Linux look through every installed font, so
// any font with the glyphs will do. `undefined` when nothing can be asked: the 2.3 stand-ins.
export function newerGlyphsProbe(inWarp: boolean, warpSettings: string | undefined): string[] | undefined {
  const charset = `:charset=${NEWER_GLYPHS.map(g => (g.codePointAt(0) as number).toString(16)).join(' ')}`
  if (!inWarp) return ['fc-list', charset, 'family']
  const family = warpSettings ? warpFont(warpSettings) : undefined
  return family ? ['fc-list', `${family.replace(/[\\\-:,]/g, c => `\\${c}`)}${charset}`, 'family'] : undefined
}

// The terminal font in Warp's settings.toml: `font_name` under `[appearance.text]`.
export function warpFont(toml: string): string | undefined {
  let section = ''
  for (const line of toml.split('\n')) {
    const head = line.match(/^\s*\[([^\]]+)\]/)
    if (head) section = head[1] as string
    const font = line.match(/^\s*font_name\s*=\s*"([^"]*)"/)
    if (font && section === 'appearance.text') return font[1] || undefined
  }
  return undefined
}

// Warp says so in TERM_PROGRAM, and in WARP_CLIENT_VERSION, which still reaches a tmux run inside it.
export const isWarp = (termProgram: string | undefined, warpVersion: string | undefined) => termProgram === 'WarpTerminal' || !!warpVersion

// fc-list prints a line per font that has every glyph asked for.
export const canDrawNewer = (ran: { exitCode: number; stdout: string } | undefined) => ran?.exitCode === 0 && ran.stdout.trim() !== ''
