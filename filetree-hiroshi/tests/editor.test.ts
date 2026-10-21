import { expect, test } from 'claude-code/testing'

import {
  beforePath,
  chooseEditor,
  diffArgv,
  diffKey,
  hashOf,
  hasOwnWindow,
  installedFrom,
  isIcon,
  isTempDir,
  openArgv,
  openKey,
  skipIcons,
  tempDir,
} from '../hooks/editor'

test('the configured editor wins; on auto, the terminal it runs in, then the first installed', () => {
  expect(chooseEditor('code', 'zed', ['zed'])).toBe('code')
  expect(chooseEditor('auto', 'vscode', ['zed', 'code'])).toBe('code')
  expect(chooseEditor('auto', 'zed', ['zed', 'code'])).toBe('zed')
  expect(chooseEditor('auto', 'WarpTerminal', ['code'])).toBe('code')
  expect(chooseEditor(undefined, 'WarpTerminal', ['zed', 'code'])).toBe('zed')
  // VS Code's terminal, but no `code` on the PATH: the one there is
  expect(chooseEditor('auto', 'vscode', ['zed'])).toBe('zed')
  expect(chooseEditor('auto', undefined, [])).toBeUndefined()
})

test('which tells the installed editors by the name of each path it prints', () => {
  expect(installedFrom('/home/u/.local/bin/zed\n/usr/bin/code\n')).toEqual(['zed', 'code'])
  expect(installedFrom('/usr/bin/code\n')).toEqual(['code'])
  expect(installedFrom('')).toEqual([])
})

test('a file opens with the project folder, at its line when one is given', () => {
  expect(openArgv('zed', '/w', '/w/src/a.ts', 12)).toEqual(['zed', '/w', '/w/src/a.ts:12'])
  expect(openArgv('zed', '/w', '/w/src/a.ts')).toEqual(['zed', '/w', '/w/src/a.ts'])
  expect(openArgv('code', '/w', '/w/src/a.ts', 12)).toEqual(['code', '/w', '-g', '/w/src/a.ts:12'])
  expect(openArgv('code', '/w', '/w/src/a.ts', 0)).toEqual(['code', '/w', '-g', '/w/src/a.ts'])
})

test('a change opens as a diff in VS Code, and as the file at its newest hunk in Zed', () => {
  expect(diffArgv('code', '/w', '/tmp/d/x/a.ts.HEAD', '/w/a.ts', 9)).toEqual(['code', '/w', '--diff', '/tmp/d/x/a.ts.HEAD', '/w/a.ts'])
  expect(diffArgv('zed', '/w', '/tmp/d/x/a.ts.HEAD', '/w/a.ts', 9)).toEqual(['zed', '/w', '/w/a.ts:9'])
})

test('in Zed, a project without a window of its own opens in a new one', () => {
  expect(openArgv('zed', '/w', '/w/a.ts', 3, true)).toEqual(['zed', '-n', '/w', '/w/a.ts:3'])
  expect(diffArgv('zed', '/w', '', '/w/a.ts', 3, true)).toEqual(['zed', '-n', '/w', '/w/a.ts:3'])
  expect(openArgv('code', '/w', '/w/a.ts', 3, true)).toEqual(['code', '/w', '-g', '/w/a.ts:3'])
})

test('a project has its own Zed window when it is open there alone', () => {
  const alone = [{ paths: ['/w'], window: 7 }, { paths: ['/e'], window: 1 }]
  expect(hasOwnWindow(alone, '/w')).toBe(true)
  expect(hasOwnWindow(alone, '/w/')).toBe(true)
  // Added to another project's window, as Zed does when the folder had no window.
  expect(hasOwnWindow([{ paths: ['/e'], window: 1 }, { paths: ['/w'], window: 1 }], '/w')).toBe(false)
  expect(hasOwnWindow([{ paths: ['/e'], window: 1 }], '/w')).toBe(false)
  // A window of several folders is not the project's, nor a subfolder's window.
  expect(hasOwnWindow([{ paths: ['/w', '/x'], window: 7 }], '/w')).toBe(false)
  expect(hasOwnWindow([{ paths: ['/w/src'], window: 7 }], '/w')).toBe(false)
  expect(hasOwnWindow([{ paths: ['/w'], window: null }], '/w')).toBe(false)
})

test('the before side keeps the file name, apart for two files of the same name', () => {
  expect(beforePath('/tmp/d', '/w/src/a.ts', 'HEAD')).toMatch(/^\/tmp\/d\/[0-9a-z]+\/a\.ts\.HEAD$/)
  expect(beforePath('/tmp/d', '/w/lib/a.ts', 'antes')).toMatch(/\/a\.ts\.antes$/)
  expect(beforePath('/tmp/d', '/w/src/a.ts', 'HEAD')).not.toBe(beforePath('/tmp/d', '/w/lib/a.ts', 'HEAD'))
  expect(hashOf('/w/src/a.ts')).toBe(hashOf('/w/src/a.ts'))
})

test('the temporary folder is the session’s own, and only such a folder is removed', () => {
  expect(tempDir('/tmp/', 1700)).toBe('/tmp/filetree-hiroshi-1700')
  expect(tempDir('', 1700)).toBe('/tmp/filetree-hiroshi-1700')
  expect(isTempDir('/tmp/filetree-hiroshi-1700')).toBe(true)
  expect(isTempDir('/tmp')).toBe(false)
  expect(isTempDir('/home/u/filetree-hiroshi-x')).toBe(false)
})

// Keys in drawing order: the header, two files with their ⧉, a folder, a change with its ⧉.
const ORDER = ['focus', '/w/a.ts', openKey('/w/a.ts'), '/w/src', '/w/b.ts', openKey('/w/b.ts'), 'clear', 'change:/w/a.ts', diffKey('/w/a.ts')]

test('the icons are kept out of the focus ring', () => {
  expect(ORDER.filter(isIcon)).toEqual([openKey('/w/a.ts'), openKey('/w/b.ts'), diffKey('/w/a.ts')])
  // Tab from a row lands on its own ⧉: on to the next row
  expect(skipIcons(ORDER, '/w/a.ts', openKey('/w/a.ts'))).toBe('/w/src')
  // Shift+Tab from the row below lands on the ⧉ above: its row
  expect(skipIcons(ORDER, '/w/src', openKey('/w/a.ts'))).toBe('/w/a.ts')
  // a click on a ⧉ from elsewhere: its row
  expect(skipIcons(ORDER, 'focus', openKey('/w/b.ts'))).toBe('/w/b.ts')
  expect(skipIcons(ORDER, '/w/b.ts', diffKey('/w/a.ts'))).toBe('change:/w/a.ts')
  // Tab from the last row: round to the first that is no icon
  expect(skipIcons(ORDER, 'change:/w/a.ts', diffKey('/w/a.ts'))).toBe('focus')
  expect(skipIcons(ORDER, undefined, 'abrir:/nowhere')).toBeUndefined()
})
