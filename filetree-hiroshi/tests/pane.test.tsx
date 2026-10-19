import { expect, test } from 'claude-code/testing'
import type { FsEntry } from 'claude-code'

const PANE = 'filetree-hiroshi'
const props = { title: 'filetree', isFocused: false, bodyColumns: 40, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} }

const file = (name: string): FsEntry => ({ name, kind: 'file', size: 1, mtimeMs: 0, isLink: false })
const dir = (name: string): FsEntry => ({ name, kind: 'dir', size: 0, mtimeMs: 0, isLink: false })

// A session's folder on disk, as $.fs.list would read it.
const DISK: Record<string, FsEntry[]> = {
  '/work': [file('README.md'), dir('src'), dir('.git')],
  '/work/src': [file('main.ts'), dir('lib')],
  '/work/src/lib': [],
}

// Stands for the engine beneath the mod.
function engine(on: any) {
  const listed: string[] = []
  const panes: { id: string; open: boolean } = { id: PANE, open: false }
  on('session.start', (_$: any, e: any) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: undefined }))
  on('fs.list', (_$: any, e: any) => {
    listed.push(e.path)
    return { value: DISK[e.path] ?? [] }
  })
  on('ui.open', () => ((panes.open = true), { value: { isPlaced: true } }))
  on('ui.panes', () => ({ value: panes.open ? [{ id: PANE, title: 'filetree', isShown: true, isFocused: false, isPlaced: true }] : [] }))
  on('ui.close', () => ((panes.open = false), { value: undefined }))
  return { listed, panes }
}

async function mount($: any) {
  return $.ui.mount({ plugin: PANE, surface: 'terminal', component: 'Pane', requestId: PANE, props } as any)
}

const rowTexts = async (ui: any) => (await ui.findAll({ type: 'Button' })).map((b: any) => b.text)

test('the pane lists the session folder, folders first, without .git', async ($, on) => {
  const { listed } = engine(on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' } as any)
  expect(listed).toEqual(['/work'])
  const ui = await mount($)
  expect(await ui.find({ type: 'Text', text: 'work' })).toBeDefined()
  expect(await rowTexts(ui)).toEqual(['▸ src', '  README.md'])
  await ui.unmount()
})

test('pressing a folder reads it once and opens and closes it', async ($, on) => {
  const { listed } = engine(on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' } as any)
  const ui = await mount($)
  await ui.press({ key: '/work/src' })
  expect(await rowTexts(ui)).toEqual(['▾ src', '  ▸ lib', '    main.ts', '  README.md'])
  await ui.press({ key: '/work/src' })
  expect(await rowTexts(ui)).toEqual(['▸ src', '  README.md'])
  await ui.press({ key: '/work/src' })
  expect(listed).toEqual(['/work', '/work/src'])
  await ui.unmount()
})

test('/filetree opens the pane and closes it again', async ($, on) => {
  const { panes } = engine(on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' } as any)
  expect(panes.open).toBe(false) // never opened at the start of a session
  expect((await $.command.run({ command: 'filetree', args: '' } as any)).text).toBe('filetree aberto.')
  expect(panes.open).toBe(true)
  expect((await $.command.run({ command: 'filetree', args: '' } as any)).text).toBe('filetree fechado.')
  expect(panes.open).toBe(false)
})
