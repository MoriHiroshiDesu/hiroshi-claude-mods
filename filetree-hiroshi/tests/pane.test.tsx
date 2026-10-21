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
function engine(on: any, repo = true, extra: FsEntry[] = []) {
  const clock = mock.clock(on)
  mock.env(on, { HOME: '/home/u' })
  const listed: string[] = []
  const statuses: number[] = []
  const opened: string[] = []
  const runs: string[][] = []
  const toasts: string[] = []
  const focusedOn: (string | undefined)[] = []
  const files: Record<string, string> = {} // what $.fs.read and $.fs.write see
  const panes = { open: false }
  on('session.start', (_$: any, e: any) => ({ cwd: e.cwd }))
  on('session.end', () => ({ sessionId: 's1' }))
  on('session.cwd', () => ({ value: '/work' }))
  on('command.register', () => ({ value: undefined }))
  on('classic.FileChanged', () => ({}))
  on('fs.list', (_$: any, e: any) => {
    listed.push(e.path)
    return { value: [...(DISK[e.path] ?? []), ...(e.path === '/work' ? extra : [])] }
  })
  on('fs.exists', (_$: any, e: any) => ({ value: e.path in DISK || Object.entries(DISK).some(([d, es]) => es.some(f => `${d}/${f.name}` === e.path)) }))
  on('process.run', (_$: any, e: any) => (runs.push([...e.argv]), e.argv.includes('status') && statuses.push(1), {
    value: { ...(repo ? gitOut(e.argv) : { exitCode: 128, stdout: '' }), stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
  }))
  on('ui.open', (_$: any, e: any) => ((panes.open = true), opened.push(e.id), { value: { isPlaced: true } }))
  on('ui.panes', () => ({ value: panes.open ? [{ id: PANE, title: 'filetree', isShown: true, isFocused: false, isPlaced: true }] : [] }))
  on('ui.close', () => ((panes.open = false), { value: undefined }))
  on('ui.toast', (_$: any, e: any) => (toasts.push(e.text), { value: undefined }))
  on('ui.focus', (_$: any, e: any) => (focusedOn.push(e.element), {}))
  on('fs.read', (_$: any, e: any) => {
    if (!(e.path in files)) throw new Error(`ENOENT ${e.path}`)
    return { value: files[e.path] }
  })
  on('fs.write', (_$: any, e: any) => ((files[e.path] = e.text), { value: undefined }))
  on('ui.render', { component: 'AbovePrompt' }, ($: any, e: any) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text> // the engine's own band
  })
  // The tools themselves: each call answered as done.
  on('tool.call', (_$: any, e: any) =>
    e.tool === 'Bash' && /^sed -n/.test(e.command)
      ? { result: { stdout: '' }, text: '', isReadOnly: true }
      : e.tool === 'Edit'
        ? { result: { filePath: e.file_path, structuredPatch: [{ oldStart: 3, oldLines: 2, newStart: 3, newLines: 2, lines: [' keep', `-${e.old_string}`, `+${e.new_string}`] }] }, text: 'ok' }
        : { result: {}, text: 'ok' },
  )
  return { clock, listed, panes, statuses, opened, runs, toasts, focusedOn, files }
}

const start = ($: any) => $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' } as any)
const filetree = ($: any) => $.command.run({ command: 'filetree', args: '', columns: 160 } as any)
const mount = ($: any, bodyRows = 30) =>
  $.ui.mount({ plugin: PANE, surface: 'terminal', component: 'Pane', requestId: PANE, props: { ...props, scroll: { offset: 0, bodyRows } } } as any)
// The tree's rows: the Buttons keyed by a path.
const rowTexts = async (ui: any) =>
  (await ui.findAll({ type: 'Button' })).filter((b: any) => b.key?.startsWith('/')).map((b: any) => b.text)
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
  expect(panes.open).toBe(false) // nothing drew yet to say the terminal docks panes
  expect((await filetree($)).text).toBe('filetree aberto.')
  expect(panes.open).toBe(true)
  expect((await filetree($)).text).toBe('filetree fechado.')
  expect(panes.open).toBe(false)
})

// The band above the prompt, drawn as the session starts: it says whether the terminal docks panes.
const band = ($: any, isFullscreen: boolean) =>
  $.ui.mount({ plugin: PANE, surface: 'terminal', component: 'AbovePrompt', props: {}, viewport: { columns: 160, rows: 40, isFullscreen } } as any)

test('a fullscreen session opens the pane at its start, with the tree', async ($, on) => {
  const { clock, opened } = engine(on, false)
  await start($)
  const above = await band($, true)
  await clock.advance(0)
  expect(opened).toEqual([PANE])
  const ui = await mount($)
  expect(await rowTexts(ui)).toEqual(['▸ dist', '▸ src', '  notes.md', '  README.md'])
  await ui.unmount()
  await above.unmount()
})

test('on the main screen the pane waits for /filetree', async ($, on) => {
  const { clock, opened } = engine(on, false)
  await start($)
  const above = await band($, false)
  await clock.advance(0)
  expect(opened).toEqual([])
  await above.unmount()
})

test('a reload opens the pane again, unless the person closed it', async ($, on) => {
  const { clock, opened, panes } = engine(on, false)
  await start($)
  const first = await band($, true)
  await clock.advance(0)
  expect(opened).toEqual([PANE])
  await first.unmount()
  panes.open = false // an unload closes it
  await start($)
  const second = await band($, true)
  await clock.advance(0)
  expect(opened).toEqual([PANE, PANE])
  await second.unmount()
  await filetree($) // the person closes it
  await start($)
  const third = await band($, true)
  await clock.advance(0)
  expect(opened).toEqual([PANE, PANE])
  await third.unmount()
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
  expect(await ui.find({ type: 'Button', text: /src\/lib\/util\.ts/ })).toBeDefined()
  // once the agent moves on, the file keeps a ○ until the next prompt
  await clock.advance(5000)
  await ui.redraw()
  expect((await rowTexts(ui)).map(pad)).toContain('    ○ util.ts')
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
  expect(await ui.find({ type: 'Button', text: /~\/\.config\/app\.toml ↗/ })).toBeDefined()
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

const many = Array.from({ length: 20 }, (_, i) => file(`a${String(i).padStart(2, '0')}.ts`))
const texts = async (ui: any) => (await ui.findAll({ type: 'Text' })).map((t: any) => t.text)
// Whether the tree is cut down by focus: it then has `⋯ N` rows.
const inFocus = async (ui: any) => (await texts(ui)).some((t: string) => /^\s*⋯ \d+ (pasta|arquivo|ite)/.test(t))

test('two active files too far apart for the pane turn focus on, and it lets go once they go quiet', async ($, on) => {
  const { clock } = engine(on, true, many)
  await start($)
  await filetree($)
  const ui = await mount($, 14)
  await $.tool.call(edit('/work/src/lib/util.ts') as any)
  expect(await inFocus(ui)).toBe(false) // one file: the whole tree, followed
  await $.tool.call(edit('/work/README.md') as any)
  expect(await rowTexts(ui)).toEqual(['▾ src/lib', '  ● util.ts', '● README.md'])
  expect(await texts(ui)).toEqual(expect.arrayContaining(['⋯ 1 pasta', '⋯ 21 arquivos']))
  expect(await ui.find({ type: 'Text', text: /◉ foco/ })).toBeDefined()
  // the agent goes quiet: 4 s active, then 3 s more
  await clock.advance(4300)
  expect(await rowTexts(ui)).toEqual(['▾ src/lib', '  ○ util.ts', '○ README.md'])
  await clock.advance(3300)
  expect(await inFocus(ui)).toBe(false)
  expect(await ui.find({ type: 'Text', text: /○ foco/ })).toBeDefined()
  await ui.unmount()
})

test('f holds focus on or off, and pressed again goes back to auto', async ($, on) => {
  engine(on, true, many)
  await start($)
  await filetree($)
  const ui = await mount($, 14)
  // auto and off: f holds it on
  await $.tool.call(edit('/work/README.md') as any)
  await ui.press({ key: 'focus' })
  expect(await rowTexts(ui)).toEqual(['● README.md'])
  expect(await ui.find({ type: 'Text', text: /◉ foco fixo/ })).toBeDefined()
  // again: back to auto
  await ui.press({ key: 'focus' })
  expect(await inFocus(ui)).toBe(false)
  expect(await ui.find({ type: 'Text', text: /^○ foco$/ })).toBeDefined()
  // auto and on: f holds it off, so two far files no longer cut the tree down
  await $.tool.call(edit('/work/src/lib/util.ts') as any)
  expect(await rowTexts(ui)).toEqual(['▾ src/lib', '  ● util.ts', '● README.md'])
  await ui.press({ key: 'focus' })
  expect(await ui.find({ type: 'Text', text: /○ foco desligado/ })).toBeDefined()
  expect(await inFocus(ui)).toBe(false)
  await $.tool.call(edit('/work/a00.ts') as any)
  expect(await inFocus(ui)).toBe(false)
  await ui.unmount()
})

test('the changes below the tree show the newest file\'s hunks; d folds them, c clears them', async ($, on) => {
  engine(on)
  await start($)
  await $.tool.call({ ...edit('/work/notes.md'), old_string: 'old line', new_string: 'new line' } as any)
  await $.tool.call({ ...edit('/work/README.md'), old_string: 'a', new_string: 'b' } as any)
  const ui = await mount($)
  const code = await ui.find({ type: 'Code' })
  expect(code?.props).toMatchObject({ format: 'diff', path: '/work/README.md', source: '@@ -3,2 +3,2 @@\n keep\n-a\n+b' })
  expect((await ui.find({ key: 'change:/work/README.md' }))?.text).toMatch(/^▾ README\.md +\+1 -1$/)
  expect((await ui.find({ key: 'change:/work/notes.md' }))?.text).toMatch(/^▸ notes\.md/)
  // pressing a file's row opens or closes its hunks
  await ui.press({ key: 'change:/work/notes.md' })
  expect((await ui.findAll({ type: 'Code' })).map((c: any) => c.props.path)).toEqual(['/work/README.md', '/work/notes.md'])
  await ui.press({ key: 'change:/work/README.md' })
  expect((await ui.findAll({ type: 'Code' })).map((c: any) => c.props.path)).toEqual(['/work/notes.md'])
  // d folds the section to its rule, c clears it
  await ui.press({ key: 'diffs' })
  expect(await ui.find({ type: 'Code' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /─ Alterações \(2\)/ })).toBeDefined()
  await ui.press({ key: 'diffs' })
  await ui.press({ key: 'clear' })
  expect(await ui.find({ type: 'Text', text: /Alterações/ })).toBeUndefined()
  await ui.unmount()
})

test('the tree scrolls in a window of its own that follows the agent, the changes kept below it', async ($, on) => {
  engine(on, true, many)
  await start($)
  await filetree($)
  const ui = await mount($, 14)
  await $.tool.call(edit('/work/README.md') as any)
  const rows = await rowTexts(ui)
  expect(rows).toContain('● README.md')
  expect(rows).not.toContain('▸ dist') // the window moved down to README.md
  // the pane's body never outgrows its rows, so the engine has nothing to scroll (the ⧉
  // icons sit over their rows, and the e key's Button beside f)
  const lines = (await ui.findAll({ type: 'Button' })).filter((b: any) => !b.key?.startsWith('abrir'))
  const drawn = lines.length + (await ui.findAll({ type: 'Code' })).length * 3
  expect(drawn).toBeLessThanOrEqual(14)
  expect(await ui.find({ type: 'Code' })).toBeDefined()
  await ui.unmount()
})

// The person's Tab, arrows or click moving the pane's focus ring onto `element`.
const tab = ($: any, element: string) => $.ui.focus({ component: 'Pane', requestId: PANE, element, origin: { kind: 'person' } } as any)

// The editor's commands among the ones run: what is neither git nor which.
const editorRuns = (runs: string[][]) => runs.filter(argv => argv[0] === 'zed' || argv[0] === 'code')

test('a file\'s row has a ⧉ that opens it in the editor, with the project folder', { options: { editor: 'zed' } }, async ($, on) => {
  const { runs } = engine(on)
  await start($)
  await filetree($)
  const ui = await mount($)
  expect(await ui.find({ key: 'abrir:/work/README.md' })).toBeDefined()
  expect(await ui.find({ key: 'abrir:/work/src' })).toBeUndefined() // folders have none
  // the tree's rows read as before: the icon is drawn over them, shown under the pointer
  expect(await rowTexts(ui)).toContain('  README.md')
  await ui.press({ key: 'abrir:/work/README.md' })
  expect(editorRuns(runs)).toEqual([['zed', '/work', '/work/README.md']])
  await ui.unmount()
})

test('in VS Code a change opens as a diff with HEAD\'s version written to the session\'s folder', { options: { editor: 'code' } }, async ($, on) => {
  const { runs } = engine(on)
  await start($)
  await $.tool.call(edit('/work/README.md') as any)
  const ui = await mount($)
  await ui.press({ key: 'abrir-diff:/work/README.md' })
  expect(runs).toContainEqual(['git', '-C', '/work', 'show', 'HEAD:./README.md'])
  const [diff] = editorRuns(runs)
  expect(diff?.slice(0, 3)).toEqual(['code', '/work', '--diff'])
  expect(diff?.[3]).toMatch(/^\/tmp\/filetree-hiroshi-\d+\/[0-9a-z]+\/README\.md\.HEAD$/)
  expect(diff?.[4]).toBe('/work/README.md')
  await ui.unmount()
})

test('in Zed a change opens as the file at its newest hunk', { options: { editor: 'zed' } }, async ($, on) => {
  const { runs } = engine(on)
  await start($)
  await $.tool.call(edit('/work/README.md') as any)
  const ui = await mount($)
  await ui.press({ key: 'abrir-diff:/work/README.md' })
  expect(editorRuns(runs)).toEqual([['zed', '/work', '/work/README.md:3']])
  await ui.unmount()
})

test('with no editor found a press says so', async ($, on) => {
  const { runs, toasts } = engine(on)
  await start($)
  await filetree($)
  const ui = await mount($)
  await ui.press({ key: 'abrir:/work/README.md' })
  expect(editorRuns(runs)).toEqual([])
  expect(toasts.some(t => /nenhum editor/.test(t))).toBe(true)
  await ui.unmount()
})

test('the focus ring steps past the icons, and e opens the row it is on', { options: { editor: 'zed' } }, async ($, on) => {
  const { runs, focusedOn, toasts } = engine(on)
  await start($)
  await filetree($)
  const ui = await mount($)
  // landing on a ⧉ from elsewhere: its own row instead
  await tab($, 'abrir:/work/notes.md')
  expect(focusedOn.at(-1)).toBe('/work/notes.md')
  // from its own row (Tab): on to the next row
  await tab($, 'abrir:/work/notes.md')
  expect(focusedOn.at(-1)).toBe('/work/README.md')
  // Tab from the last row: round to the first that is no icon
  await tab($, 'abrir:/work/README.md')
  expect(focusedOn.at(-1)).toBe('focus')
  await tab($, '/work/README.md')
  await ui.press({ key: 'abrir-focado' })
  expect(editorRuns(runs)).toEqual([['zed', '/work', '/work/README.md']])
  // on a folder, e only says what it does
  await tab($, '/work/src')
  await ui.press({ key: 'abrir-focado' })
  expect(editorRuns(runs)).toHaveLength(1)
  expect(toasts.at(-1)).toMatch(/e abre/)
  await ui.unmount()
})

test('a first write keeps a copy of the file as it was, and the session\'s end removes the folder', async ($, on) => {
  const { runs, files } = engine(on)
  await start($)
  files['/work/new.txt'] = 'old text'
  await $.tool.call(edit('/work/new.txt') as any)
  await $.tool.call(edit('/work/brand-new.txt') as any)
  const copies = () => Object.keys(files).filter(path => path.startsWith('/tmp/'))
  // one copy, of the file that existed; none for the new one
  expect(copies()).toHaveLength(1)
  const [copy] = copies() as [string]
  expect(copy).toMatch(/^\/tmp\/filetree-hiroshi-\d+\/[0-9a-z]+\/new\.txt\.antes$/)
  expect(files[copy]).toBe('old text')
  // a second write keeps the first copy
  files['/work/new.txt'] = 'newer text'
  await $.tool.call(edit('/work/new.txt') as any)
  expect(files[copy]).toBe('old text')
  await $.session.end({ reason: 'other' } as any)
  expect(runs).toContainEqual(['rm', '-rf', copy.split('/').slice(0, 3).join('/')])
})

