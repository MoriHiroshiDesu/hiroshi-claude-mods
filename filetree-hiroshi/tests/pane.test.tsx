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
  '/work/src/lib': [file('util.ts')],
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
  const clock = mock.clock(on)
  mock.env(on, { HOME: '/home/u' })
  const listed: string[] = []
  const statuses: number[] = []
  const opened: string[] = []
  const panes = { open: false }
  on('session.start', (_$: any, e: any) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: '/work' }))
  on('command.register', () => ({ value: undefined }))
  on('classic.FileChanged', () => ({}))
  on('fs.list', (_$: any, e: any) => {
    listed.push(e.path)
    return { value: DISK[e.path] ?? [] }
  })
  on('fs.exists', (_$: any, e: any) => ({ value: e.path in DISK || Object.entries(DISK).some(([d, es]) => es.some(f => `${d}/${f.name}` === e.path)) }))
  on('process.run', (_$: any, e: any) => (e.argv.includes('status') && statuses.push(1), {
    value: { ...(repo ? gitOut(e.argv) : { exitCode: 128, stdout: '' }), stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
  }))
  on('ui.open', (_$: any, e: any) => ((panes.open = true), opened.push(e.id), { value: { isPlaced: true } }))
  on('ui.panes', () => ({ value: panes.open ? [{ id: PANE, title: 'filetree', isShown: true, isFocused: false, isPlaced: true }] : [] }))
  on('ui.close', () => ((panes.open = false), { value: undefined }))
  // The tools themselves: each call answered as done.
  on('tool.call', (_$: any, e: any) =>
    e.tool === 'Bash' && /^sed -n/.test(e.command) ? { result: { stdout: '' }, text: '', isReadOnly: true } : { result: {}, text: 'ok' },
  )
  return { clock, listed, panes, statuses, opened }
}

const start = ($: any) => $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' } as any)
const filetree = ($: any) => $.command.run({ command: 'filetree', args: '', columns: 160 } as any)
const mount = ($: any) => $.ui.mount({ plugin: PANE, surface: 'terminal', component: 'Pane', requestId: PANE, props } as any)
const rowTexts = async (ui: any) => (await ui.findAll({ type: 'Button' })).map((b: any) => b.text)
const named = async (ui: any, name: string) => ui.find({ type: 'Text', text: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}$`) })
// The padding between a name and its line counts, which depends on the width, as ' … '.
const pad = (text: string) => text.replace(/(?<=\S) {2,}/g, ' … ')

test('the pane lists the session folder, folders first, without .git', async ($, on) => {
  const { listed } = engine(on, false)
  await start($)
  expect(listed).toEqual(['/work'])
  await filetree($)
  const ui = await mount($)
  expect(await ui.find({ type: 'Text', text: 'work' })).toBeDefined()
  expect(await rowTexts(ui)).toEqual(['▸ dist', '▸ src', '  notes.md', '  README.md'])
  await ui.unmount()
})

test('pressing a folder reads it once and opens and closes it', async ($, on) => {
  const { listed } = engine(on, false)
  await start($)
  await filetree($)
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
  await start($)
  expect(panes.open).toBe(false) // never opened at the start of a session
  expect((await filetree($)).text).toBe('filetree aberto.')
  expect(panes.open).toBe(true)
  expect((await filetree($)).text).toBe('filetree fechado.')
  expect(panes.open).toBe(false)
})

test('git colors each row and puts its lines on the right', async ($, on) => {
  engine(on)
  await start($)
  await filetree($)
  const ui = await mount($)
  await ui.press({ key: '/work/src' })
  expect(await ui.find({ type: 'Text', text: /⎇ main ↑1/ })).toBeDefined()
  const rows = (await rowTexts(ui)).map(pad)
  expect(rows).toEqual(['▸ dist', '▾ src … +12 -3', '  ▸ lib', '    main.ts … +12 -3', '  notes.md … U', '  README.md'])
  expect((await named(ui, 'main.ts'))?.props.color).toBe('warning')
  expect((await named(ui, 'src'))?.props.color).toBe('warning')
  expect((await named(ui, 'notes.md'))?.props.color).toBe('success')
  expect((await named(ui, 'dist'))?.props.dimColor).toBe(true)
  expect((await named(ui, 'README.md'))?.props.color).toBeUndefined()
  // every row fits the pane's width
  for (const row of await rowTexts(ui)) expect(row.length).toBeLessThanOrEqual(40)
  await ui.unmount()
})

test('a session outside a repository shows the tree without git', async ($, on) => {
  engine(on, false)
  await start($)
  await filetree($)
  const ui = await mount($)
  expect(await ui.find({ type: 'Text', text: /⎇/ })).toBeUndefined()
  expect((await named(ui, 'src'))?.props.color).toBe('suggestion')
  await ui.unmount()
})

test('changes in a burst are read from git once, after a short pause', async ($, on) => {
  const { clock, statuses } = engine(on)
  added = 12
  await start($)
  expect(statuses.length).toBe(1)
  await filetree($)
  const ui = await mount($)
  added = 20
  await $.classic.FileChanged({ file_path: '/work/.git/index', event: 'change' } as any)
  await $.classic.FileChanged({ file_path: '/work/.git/index', event: 'change' } as any)
  expect(statuses.length).toBe(1)
  await clock.advance(300)
  expect(statuses.length).toBe(2)
  expect(await ui.find({ type: 'Text', text: /\+20 -3/ })).toBeDefined()
  added = 12
  await ui.unmount()
})

const edit = (path: string) => ({ tool: 'Edit', tool_use_id: 't1', file_path: path, old_string: 'a', new_string: 'b', replace_all: false })

test('the first write opens the pane, opens the folder down to the file and marks it', async ($, on) => {
  const { clock, opened } = engine(on)
  await start($)
  expect(opened).toEqual([])
  await $.tool.call(edit('/work/src/lib/util.ts') as any)
  expect(opened).toEqual([PANE])
  const ui = await mount($)
  expect((await rowTexts(ui)).map(pad)).toEqual(['▸ dist', '▾ src … +12 -3', '  ▾ lib', '    ● util.ts', '    main.ts … +12 -3', '  notes.md … U', '  README.md'])
  expect((await named(ui, 'util.ts'))?.props.color).toMatch(/^#/) // the write tone, pulsing
  expect(await ui.find({ type: 'Text', text: /─ Alterações/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /● src\/lib\/util\.ts/ })).toBeDefined()
  // once the agent moves on, the file keeps a ○ until the next prompt
  await clock.advance(5000)
  await ui.redraw()
  expect((await rowTexts(ui)).map(pad)).toContain('    ○ util.ts')
  expect(await ui.find({ type: 'Text', text: /○ src\/lib\/util\.ts/ })).toBeDefined()
  await ui.unmount()
})

test('a write outside the session folder opens the pane with no tree, the file named from ~', async ($, on) => {
  const { opened } = engine(on)
  await start($)
  await $.tool.call(edit('/home/u/.config/app.toml') as any)
  expect(opened).toEqual([PANE])
  const ui = await mount($)
  expect(await rowTexts(ui)).toEqual([])
  expect(await ui.find({ type: 'Text', text: /⎇/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /○ ~\/\.config\/app\.toml ↗/ })).toBeDefined()
  // the tree shows up with the first write inside the folder
  await $.tool.call(edit('/work/README.md') as any)
  expect(await rowTexts(ui)).toContain('● README.md')
  await ui.unmount()
})

test('a read pulses the file and opens its folder, without opening the pane', async ($, on) => {
  const { opened } = engine(on)
  await start($)
  await filetree($)
  await $.tool.call({ tool: 'Read', tool_use_id: 't2', file_path: '/work/src/main.ts' } as any)
  const ui = await mount($)
  expect((await rowTexts(ui)).map(pad)).toContain('  ● main.ts … +12 -3')
  expect(await ui.find({ type: 'Text', text: /Alterações/ })).toBeUndefined()
  await ui.unmount()
  expect(opened).toEqual([PANE]) // only /filetree opened it
})

test('a read-only shell command marks the files it names', async ($, on) => {
  engine(on)
  await start($)
  await filetree($)
  await $.tool.call({ tool: 'Bash', tool_use_id: 't3', command: 'sed -n 1,40p src/main.ts | head' } as any)
  const ui = await mount($)
  expect((await rowTexts(ui)).map(pad)).toContain('  ● main.ts … +12 -3')
  await ui.unmount()
})
