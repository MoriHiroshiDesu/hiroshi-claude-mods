// The Nerd Font icon of a tree row, as plain data: no `$`, so the tests drive it without the engine.
// Every glyph sits in the Private Use Area of the BMP (Seti `E5FA`-`E6B7`, Font Awesome, Codicons),
// one column wide in the terminal and one UTF-16 unit, which is how `fitRow` measures a row. The
// Seti blocks come with every Nerd Font; the terminal's fallback draws what the font lacks from the
// Symbols font. The Codicons logos (Claude, OpenAI) are from Nerd Fonts 3.5. The Material set
// (`F0001`+) and the older `nf-mdi` range are left out on purpose: the first is two UTF-16 units,
// the second was removed in Nerd Fonts 3.
// Written as escapes: the glyphs are invisible in an editor without a Nerd Font.
import type { NodeKind } from '../types'

export type Icon = {
  glyph: string
  // A fixed color for the type. Undefined for folders and links, which take the color of the row.
  color?: string
}

export type IconMode = 'off' | 'nerd'

// The `icons` option: anything but `nerd` keeps the tree as it was.
export const iconMode = (setting: unknown): IconMode => (setting === 'nerd' ? 'nerd' : 'off')

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

const CLAUDE = '\uec82'
const ROBOT = '\uec20'
const SPARKLE = '\uec10'
const COPILOT = '\uec1e'
const OPENAI_LOGO = '\uec81'
const WHALE = '\uf21f'

const icon = (glyph: string, color?: string): Icon => ({ glyph, color })

// By the whole file name, lower case: the files an extension does not tell apart.
const BY_NAME: Record<string, Icon> = {
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
  'claude.md': icon(CLAUDE, KRAFT),
  'claude.local.md': icon(CLAUDE, KRAFT),
  'agents.md': icon(ROBOT, AGENT),
  'gemini.md': icon(SPARKLE, BLUE),
  '.cursorrules': icon(ROBOT, AGENT),
  'copilot-instructions.md': icon(COPILOT, AGENT),
  makefile: icon('\ue673', ORANGE),
  '.gitignore': icon('\ue65d', ORANGE),
  '.gitattributes': icon('\ue65d', ORANGE),
  '.gitmodules': icon('\ue65d', ORANGE),
  '.editorconfig': icon('\ue652', GREY),
  '.env': icon('\ue690', YELLOW),
  license: icon('\ue60a', YELLOW),
  licence: icon('\ue60a', YELLOW),
  readme: icon(BOOK, BLUE),
  'readme.md': icon(BOOK, BLUE),
}

// By the extension after the last dot, lower case.
const BY_EXT: Record<string, Icon> = {}
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
const BY_FOLDER: Record<string, Icon> = {
  '.claude': icon(CLAUDE, KRAFT),
  '.claude-plugin': icon(CLAUDE, KRAFT),
  '.agents': icon(ROBOT, AGENT),
  '.agent': icon(ROBOT, AGENT),
  '.cursor': icon(ROBOT, AGENT),
  '.codex': icon(OPENAI_LOGO, OPENAI),
  '.gemini': icon(SPARKLE, BLUE),
}

// The Docker files with more in the name than the whole name says: `Dockerfile.dev`,
// `docker-compose.override.yml`, `compose.prod.yaml`.
const isDocker = (lower: string) => /^(dockerfile\.|(docker-)?compose(\.[^.]+)*\.ya?ml$)/.test(lower)

export function iconFor(name: string, kind: NodeKind, open = false): Icon {
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
