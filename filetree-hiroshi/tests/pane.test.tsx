import { expect, mock, test } from 'claude-code/testing'
import type { FsEntry } from 'claude-code'

const PANE = 'filetree-hiroshi'
const props = { title: 'filetree', isFocused: false, bodyColumns: 40, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} }

const file = (name: string): FsEntry => ({ name, kind: 'file', size: 1, mtimeMs: 0, isLink: false })
const dir = (name: string): FsEntry => ({ name, kind: 'dir', size: 0, mtimeMs: 0, isLink: false })

// A session's folder on disk, as $.fs.list would read it.
const DISK: Record<string, FsEntry[]> = {
  '/work': [file('README.md'), file('notes.md'), dir('src'), dir('dist'), dir('.git')],
  '/work/src': [file('main.ts'), dir('lib')],
  '/work/src/lib': [],
}

const z = (...records: string[]) => `${records.join('\0')}\0`

// What git answers for /work: src/main.ts edited, notes.md new, dist ignored.
let added = 12
function gitOut(argv: readonly string[]) {
  if (argv.includes('rev-parse')) return { exitCode: 0, stdout: '/work\n/work/.git\n' }
  if (argv.includes('status'))
    return {
      exitCode: 0,
      stdout: z('# branch.oid abc1234', '# branch.head main', '# branch.ab +1 -0', '1 .M N... 100644 100644 100644 a a src/main.ts', '? notes.md', '! dist/'),
    }
  return { exitCode: 0, stdout: z(`${added}\t3\tsrc/main.ts`) }
}

// Stands for the engine beneath the mod.
function engine(on: any, repo = true) {
  const listed: string[] = []
  const statuses: number[] = []
  const panes: { id: string; open: boolean } = { id: PANE, open: false }
  on('session.start', (_$: any, e: any) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: undefined }))
  on('classic.FileChanged', () => ({}))
  on('fs.list', (_$: any, e: any) => {
    listed.push(e.path)
    return { value: DISK[e.path] ?? [] }
  })
  on('process.run', (_$: any, e: any) => (e.argv.includes('status') && statuses.push(1), {
    value: { ...(repo ? gitOut(e.argv) : { exitCode: 128, stdout: '' }), stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
  }))
  on('ui.open', () => ((panes.open = true), { value: { isPlaced: true } }))
  on('ui.panes', () => ({ value: panes.open ? [{ id: PANE, title: 'filetree', isShown: true, isFocused: false, isPlaced: true }] : [] }))
  on('ui.close', () => ((panes.open = false), { value: undefined }))
  return { listed, panes, statuses }
}

async function mount($: any) {
  return $.ui.mount({ plugin: PANE, surface: 'terminal', component: 'Pane', requestId: PANE, props } as any)
}

const rowTexts = async (ui: any) => (await ui.findAll({ type: 'Button' })).map((b: any) => b.text)

test('the pane lists the session folder, folders first, without .git', async ($, on) => {
  const { listed } = engine(on, false)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' } as any)
  expect(listed).toEqual(['/work'])
  const ui = await mount($)
  expect(await ui.find({ type: 'Text', text: 'work' })).toBeDefined()
  expect(await rowTexts(ui)).toEqual(['▸ dist', '▸ src', '  notes.md', '  README.md'])
  await ui.unmount()
})

test('pressing a folder reads it once and opens and closes it', async ($, on) => {
  const { listed } = engine(on, false)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' } as any)
  const ui = await mount($)
  await ui.press({ key: '/work/src' })
  expect(await rowTexts(ui)).toEqual(['▸ dist', '▾ src', '  ▸ lib', '    main.ts', '  notes.md', '  README.md'])
  await ui.press({ key: '/work/src' })
  expect(await rowTexts(ui)).toEqual(['▸ dist', '▸ src', '  notes.md', '  README.md'])
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

// The padding between a name and its line counts, which depends on the width, as ' … '.
const pad = (text: string) => text.replace(/(?<=\S) {2,}/g, ' … ')

test('git colors each row and puts its lines on the right', async ($, on) => {
  engine(on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' } as any)
  const ui = await mount($)
  await ui.press({ key: '/work/src' })
  expect(await ui.find({ type: 'Text', text: /⎇ main ↑1/ })).toBeDefined()
  const rows = (await rowTexts(ui)).map(pad)
  expect(rows).toEqual(['▸ dist', '▾ src … +12 -3', '  ▸ lib', '    main.ts … +12 -3', '  notes.md … U', '  README.md'])
  expect((await ui.find({ type: 'Text', text: /^main\.ts$/ }))?.props.color).toBe('warning')
  expect((await ui.find({ type: 'Text', text: /^src$/ }))?.props.color).toBe('warning')
  expect((await ui.find({ type: 'Text', text: /^notes\.md$/ }))?.props.color).toBe('success')
  expect((await ui.find({ type: 'Text', text: /^dist$/ }))?.props.dimColor).toBe(true)
  expect((await ui.find({ type: 'Text', text: /^README\.md$/ }))?.props.color).toBeUndefined()
  // every row fits the pane's width
  for (const row of await rowTexts(ui)) expect(row.length).toBeLessThanOrEqual(40)
  await ui.unmount()
})

test('a session outside a repository shows the tree without git', async ($, on) => {
  engine(on, false)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' } as any)
  const ui = await mount($)
  expect(await ui.find({ type: 'Text', text: /⎇/ })).toBeUndefined()
  expect((await ui.find({ type: 'Text', text: /^src$/ }))?.props.color).toBe('suggestion')
  await ui.unmount()
})

test('changes in a burst are read from git once, after a short pause', async ($, on) => {
  const clock = mock.clock(on)
  const { statuses } = engine(on)
  added = 12
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' } as any)
  expect(statuses.length).toBe(1)
  const ui = await mount($)
  added = 20
  await $.classic.FileChanged({ file_path: '/work/.git/index', event: 'change' } as any)
  await $.classic.FileChanged({ file_path: '/work/.git/index', event: 'change' } as any)
  expect(statuses.length).toBe(1)
  await clock.advance(300)
  expect(statuses.length).toBe(2)
  expect(await ui.find({ type: 'Text', text: /\+20 -3/ })).toBeDefined()
  await ui.unmount()
})
