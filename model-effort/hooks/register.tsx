import { atom, read, update } from 'claude-code'
import type { Engine, Register } from 'claude-code'

const model = atom({ plugin: 'model-effort', key: 'model' } as const, '')
const effort = atom({ plugin: 'model-effort', key: 'effort' } as const, '')

// 'claude-sonnet-5-5' -> 'sonnet 5.5'; 'claude-3-5-sonnet-20241022' -> 'sonnet 3.5';
// 'opus[1m]' -> 'opus 1m'. An id with no family word is shown as it came.
export function modelName(raw: string): string {
  const context = /\[(\w+)\]$/.exec(raw)?.[1]
  const parts = raw
    .replace(/\[\w+\]$/, '')
    .replace(/^claude-/, '')
    .replace(/-\d{8}$/, '')
    .split('-')
    .filter(part => part !== '')
  const family = parts.find(part => /^[a-z]/i.test(part))
  if (family === undefined) return raw
  const version = parts.filter(part => /^\d+$/.test(part)).join('.')
  return [family, version, context].filter(part => part !== undefined && part !== '').join(' ')
}

export function label(rawModel: string, rawEffort: string): string {
  if (rawModel === '') return ''
  return rawEffort === '' ? modelName(rawModel) : `${modelName(rawModel)} · ${rawEffort}`
}

// The model is the session's (what /model shows); a failed read keeps the last one.
async function sync($: Engine): Promise<void> {
  const current = await $.session.model().catch(() => '')
  if (current !== '') await update($, model, () => current).catch(() => {})
}

export const register: Register = on => {
  // Read the model at the moments it can change:
  // the session start, a /model run, a /config row, and each prompt as a net.
  on('session.start', async ($, e, next) => {
    await sync($)
    return next(e)
  })

  // /model sets the model without a prompt or a request: read it once the command is done.
  // A hook here gates the command, so a failed read must not break it.
  on('command.run', { command: 'model' }, async ($, e, next) => {
    const result = await next(e)
    await sync($)
    return result
  })

  // The /config Model row, when it is the one that changed.
  on('config.set', { key: 'model' }, async ($, e, next) => {
    const result = await next(e)
    await sync($)
    return result
  })

  // A hook on the prompt gates it: a failed read must not hold the prompt back.
  on('prompt.submit', async ($, e, next) => {
    await sync($)
    return next(e)
  })

  // The effort is only known on a request: note what the main loop's step asks for.
  on('turn.step', async function* ($, e, next) {
    if (e.agentId === undefined) {
      const used = e.effort === undefined ? '' : String(e.effort)
      await update($, model, () => e.model)
      await update($, effort, () => used)
    }
    return yield* next(e)
  })

  // The dim labels at the right of the prompt footer: one more, so it takes no extra row.
  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const text = label(await read($, model), await read($, effort))
    if (text === '') return next(e)
    return next({ ...e, props: { ...e.props, modes: [...e.props.modes, text] } })
  })
}
