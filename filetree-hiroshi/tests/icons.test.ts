import { expect, test } from 'claude-code/testing'

import { iconFor, iconMode } from '../hooks/icons'

const glyph = (name: string) => iconFor(name, 'file').glyph

test('a whole file name wins over its extension', () => {
  expect(glyph('package.json')).not.toBe(glyph('data.json'))
  expect(glyph('Dockerfile')).toBe(glyph('dockerfile'))
  expect(glyph('README.md')).not.toBe(glyph('notes.md'))
  expect(glyph('.env.local')).toBe(glyph('.env'))
})

test('the Docker files get the whale, whatever they are called after the name', () => {
  const whale = glyph('Dockerfile')
  for (const name of ['Dockerfile.dev', 'dockerfile.prod', 'docker-compose.yml', 'docker-compose.override.yml', 'compose.yaml', 'compose.prod.yml', '.dockerignore'])
    expect(glyph(name)).toBe(whale)
  expect(glyph('compose.ts')).not.toBe(whale)
  expect(glyph('docker.md')).not.toBe(whale)
  expect(glyph('my-compose.yml')).not.toBe(whale)
})

test('the files and folders of AI tools have icons of their own', () => {
  const generic = glyph('x.nope')
  const claude = glyph('CLAUDE.md')
  expect(claude).not.toBe(glyph('notes.md'))
  expect(glyph('CLAUDE.local.md')).toBe(claude)
  expect(glyph('AGENTS.md')).not.toBe(claude)
  expect(glyph('AGENTS.md')).not.toBe(glyph('notes.md'))
  for (const name of ['GEMINI.md', '.cursorrules', 'copilot-instructions.md']) expect(glyph(name)).not.toBe(generic)
  // the folders: one icon open or closed, apart from the plain folder, with a color of their own
  const plain = iconFor('src', 'dir')
  for (const name of ['.claude', '.claude-plugin', '.agents', '.cursor', '.codex', '.gemini']) {
    const closed = iconFor(name, 'dir', false)
    expect(closed.glyph).not.toBe(plain.glyph)
    expect(closed.color).toMatch(/^#[0-9a-f]{6}$/)
  }
  expect(iconFor('.claude', 'dir').glyph).toBe(iconFor('.claude', 'dir', true).glyph)
  expect(iconFor('.Claude', 'dir').glyph).toBe(iconFor('.claude', 'dir').glyph)
  expect(iconFor('.claude', 'dir').glyph).toBe(claude) // the same logo as CLAUDE.md
  expect(iconFor('.claude', 'file').glyph).toBe(generic) // only a folder is one
})

test('the extension tells the type, in any case and after several dots', () => {
  expect(glyph('main.ts')).toBe(glyph('MAIN.TS'))
  expect(glyph('a.test.ts')).toBe(glyph('a.ts'))
  expect(glyph('lib.d.ts')).toBe(glyph('a.ts'))
  expect(glyph('a.tsx')).not.toBe(glyph('a.ts'))
  expect(glyph('x.yml')).toBe(glyph('x.yaml'))
})

test('a name with no known extension gets the generic file icon', () => {
  const generic = glyph('LICENSE.unknown')
  expect(glyph('Procfile')).toBe(generic)
  expect(glyph('.bashrc')).toBe(generic) // a leading dot is not an extension
  expect(glyph('archive.')).toBe(generic)
  expect(glyph('x.nope')).toBe(generic)
  expect(iconFor('x.nope', 'file').color).toBeUndefined()
})

test('folders show open or closed, and links their own icon, taking the row color', () => {
  const closed = iconFor('src', 'dir', false)
  const open = iconFor('src', 'dir', true)
  expect(closed.glyph).not.toBe(open.glyph)
  expect(closed.color).toBeUndefined()
  expect(open.color).toBeUndefined()
  expect(iconFor('node_modules', 'dir').glyph).toBe(closed.glyph) // no special folders yet
  const link = iconFor('src', 'link')
  expect(link.glyph).not.toBe(closed.glyph)
  expect(link.glyph).not.toBe(glyph('x.nope'))
  expect(link.color).toBeUndefined()
})

test('every icon is one BMP Private Use Area character, one column wide', () => {
  const names = [
    'a.ts', 'a.tsx', 'a.js', 'a.json', 'a.html', 'a.css', 'a.scss', 'a.md', 'a.py', 'a.java', 'a.kt', 'a.go', 'a.rs', 'a.rb', 'a.php', 'a.c',
    'a.cpp', 'a.cs', 'a.swift', 'a.dart', 'a.lua', 'a.zig', 'a.ex', 'a.hs', 'a.scala', 'a.vue', 'a.svelte', 'a.sh', 'a.ps1', 'a.yml', 'a.toml',
    'a.xml', 'a.svg', 'a.sql', 'a.csv', 'a.lock', 'a.gradle', 'a.png', 'a.pdf', 'a.zip', 'a.mp4', 'a.mp3', 'a.ttf', 'a.txt', 'x.nope',
    'CLAUDE.md', 'AGENTS.md', 'GEMINI.md', '.cursorrules', 'copilot-instructions.md', 'Dockerfile.dev', 'compose.yaml',
    'package.json', 'package-lock.json', 'tsconfig.json', 'Dockerfile', 'docker-compose.yml', 'Makefile', '.gitignore', '.env', 'LICENSE', 'README.md',
  ]
  const folders = ['d', '.claude', '.claude-plugin', '.agents', '.cursor', '.codex', '.gemini'].flatMap(n => [iconFor(n, 'dir', true), iconFor(n, 'dir', false)])
  const icons = [...names.map(n => iconFor(n, 'file')), ...folders, iconFor('l', 'link')]
  for (const { glyph: g, color } of icons) {
    expect(g.length).toBe(1) // one UTF-16 unit: a BMP character, never a surrogate pair
    expect(g >= '\ue000' && g <= '\uf8ff').toBe(true)
    if (color !== undefined) expect(color).toMatch(/^#[0-9a-f]{6}$/)
  }
})

test('only the value nerd turns the icons on', () => {
  expect(iconMode('nerd')).toBe('nerd')
  for (const setting of ['off', undefined, '', 'NERD', true, 1, null]) expect(iconMode(setting)).toBe('off')
})
