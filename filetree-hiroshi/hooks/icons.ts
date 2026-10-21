// The Nerd Font icon of a tree row, as plain data: no `$`, so the tests drive it without the engine.
// Every glyph sits in the Private Use Area of the BMP (Seti `E5FA`-`E6B7` and Font Awesome), one
// column wide in the terminal and in the Ink that lays the rows out. The Seti blocks come with
// every Nerd Font; the terminal's fallback draws them from the Symbols font when its own font has
// none. The Material set (`F0001`+) and the older `nf-mdi` range are left out on purpose: the
// first is two UTF-16 units, the second was removed in Nerd Fonts 3.
import type { NodeKind } from '../types'

export type Icon = {
  glyph: string
  // A fixed color for the type. Undefined for folders and links, which take the color of the row.
  color?: string
}

export type IconMode = 'off' | 'nerd'

// The `icons` option: anything but `nerd` keeps the tree as it was.
export const iconMode = (setting: unknown): IconMode => (setting === 'nerd' ? 'nerd' : 'off')

const FOLDER = ''
const FOLDER_OPEN = ''
const LINK = ''
const FILE = ''
const TEXT = ''
const BOOK = ''

const BLUE = '#519aba'
const CYAN = '#4dc0cf'
const YELLOW = '#cbcb41'
const ORANGE = '#e37933'
const RED = '#cc3e44'
const PINK = '#f55385'
const GREEN = '#8dc149'
const PURPLE = '#a074c4'
const GREY = '#8c8c8c'

const icon = (glyph: string, color?: string): Icon => ({ glyph, color })

// By the whole file name, lower case: the files an extension does not tell apart.
const BY_NAME: Record<string, Icon> = {
  'package.json': icon('', RED),
  'package-lock.json': icon('', GREY),
  'yarn.lock': icon('', GREY),
  'pnpm-lock.yaml': icon('', GREY),
  'bun.lock': icon('', GREY),
  'bun.lockb': icon('', GREY),
  'cargo.lock': icon('', GREY),
  'tsconfig.json': icon('', BLUE),
  'jsconfig.json': icon('', YELLOW),
  dockerfile: icon('', BLUE),
  '.dockerignore': icon('', GREY),
  'docker-compose.yml': icon('', BLUE),
  'docker-compose.yaml': icon('', BLUE),
  'compose.yml': icon('', BLUE),
  'compose.yaml': icon('', BLUE),
  makefile: icon('', ORANGE),
  '.gitignore': icon('', ORANGE),
  '.gitattributes': icon('', ORANGE),
  '.gitmodules': icon('', ORANGE),
  '.editorconfig': icon('', GREY),
  '.env': icon('', YELLOW),
  license: icon('', YELLOW),
  licence: icon('', YELLOW),
  readme: icon(BOOK, BLUE),
  'readme.md': icon(BOOK, BLUE),
}

// By the extension after the last dot, lower case.
const BY_EXT: Record<string, Icon> = {}
const add = (exts: string, glyph: string, color?: string) => {
  for (const ext of exts.split(' ')) BY_EXT[ext] = icon(glyph, color)
}
add('ts mts cts', '', BLUE)
add('tsx jsx', '', CYAN)
add('js mjs cjs', '', YELLOW)
add('json jsonc json5', '', YELLOW)
add('html htm', '', ORANGE)
add('css', '', BLUE)
add('scss sass', '', PINK)
add('md mdx markdown', '', BLUE)
add('py pyi', '', YELLOW)
add('java', '', RED)
add('kt kts', '', PURPLE)
add('go', '', CYAN)
add('rs', '', ORANGE)
add('rb', '', RED)
add('php', '', PURPLE)
add('c h', '', BLUE)
add('cpp cc cxx hpp hh', '', BLUE)
add('cs', '', GREEN)
add('swift', '', ORANGE)
add('dart', '', CYAN)
add('lua', '', BLUE)
add('zig', '', ORANGE)
add('ex exs', '', PURPLE)
add('hs', '', PURPLE)
add('scala', '', RED)
add('vue', '', GREEN)
add('svelte', '', ORANGE)
add('sh bash zsh fish', '', GREEN)
add('ps1', '', BLUE)
add('yml yaml', '', PURPLE)
add('toml ini cfg conf', '', GREY)
add('xml', '', ORANGE)
add('svg', '', YELLOW)
add('sql', '', GREY)
add('csv tsv', '', GREEN)
add('lock', '', GREY)
add('gradle', '', BLUE)
add('png jpg jpeg gif webp ico bmp avif', '', PURPLE)
add('pdf', '', RED)
add('zip tar gz tgz rar 7z xz bz2', '', ORANGE)
add('mp4 mov mkv webm', '', PURPLE)
add('mp3 wav flac ogg', '', PURPLE)
add('ttf otf woff woff2', '', RED)
add('txt log', TEXT)

export function iconFor(name: string, kind: NodeKind, open = false): Icon {
  if (kind === 'dir') return icon(open ? FOLDER_OPEN : FOLDER)
  if (kind === 'link') return icon(LINK)
  const lower = name.toLowerCase()
  const byName = BY_NAME[lower] ?? (lower.startsWith('.env.') ? BY_NAME['.env'] : undefined)
  if (byName) return byName
  const dot = lower.lastIndexOf('.')
  // A leading dot is part of the name (`.bashrc`), not an extension.
  const ext = dot > 0 ? lower.slice(dot + 1) : ''
  return BY_EXT[ext] ?? icon(FILE)
}
