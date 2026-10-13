import { expect, test } from 'claude-code/testing'

import { modelName } from './register'

type Body = Parameters<typeof test>[1]
type Engine = Parameters<Extract<Body, (...args: never[]) => unknown>>[0]
type On = Parameters<Extract<Body, (...args: never[]) => unknown>>[1]

// The plugin notes the model and effort on a request (`turn.step`). Nothing sits beneath
// the plugin to answer the request, so the call ends in an error after the plugin ran.
type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

async function step($: Engine, model: string, effort: Effort) {
  try {
    for await (const chunk of $.turn.step({ turnId: 't1', index: 0, model, effort, messageCount: 1 })) void chunk
  } catch {
    // the bottom of the chain has no model to call: the plugin's hook already ran
  }
}

// The engine draws the footer's labels as one dim string; the plugin draws its own tree
// so the model and effort can carry a color. This hook stands for the engine's drawing
// and shows what the plugin handed it when the plugin leaves the footer to it.
async function footer($: Engine, on: On, modes: string[], model = 'claude-sonnet-5-5', effort: Effort = 'high') {
  on('ui.render', { component: 'SessionMode' }, async ($$, e) => {
    const { Text } = $$.ui.resolve(e)
    return <Text>{e.props.modes.join(' & ')}</Text>
  })
  await step($, model, effort)
  const ui = await $.ui.mount({ plugin: 'model-effort', surface: 'terminal', component: 'SessionMode', props: { modes } })
  const text = (await ui.find({ type: 'Text' }))?.text
  const parts = await ui.findAll({ type: 'Text' })
  const tint = (shown: string) => parts.find(part => part.text === shown)?.props.color
  const modelTint = tint(modelName(model))
  const effortTint = tint(effort)
  await ui.unmount()
  return { text, modelTint, effortTint }
}

test('the footer gets the model and effort as one more label', async ($, on) => {
  expect((await footer($, on, ['focus'])).text).toBe('focus & sonnet 5.5 · high')
})

test('with no other label the footer carries only the model and effort', async ($, on) => {
  expect((await footer($, on, [])).text).toBe('sonnet 5.5 · high')
})

test('sonnet at high effort is drawn green', async ($, on) => {
  expect(await footer($, on, [])).toMatchObject({ modelTint: 'success', effortTint: 'success' })
})

test('opus at xhigh effort is drawn red', async ($, on) => {
  const drawn = await footer($, on, [], 'claude-opus-5-5', 'xhigh')
  expect(drawn).toMatchObject({ text: 'opus 5.5 · xhigh', modelTint: 'error', effortTint: 'error' })
})
