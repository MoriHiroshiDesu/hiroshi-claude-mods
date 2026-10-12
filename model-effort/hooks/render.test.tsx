import { expect, test } from 'claude-code/testing'

type Body = Parameters<typeof test>[1]
type Engine = Parameters<Extract<Body, (...args: never[]) => unknown>>[0]
type On = Parameters<Extract<Body, (...args: never[]) => unknown>>[1]

// The plugin notes the model and effort on a request (`turn.step`). Nothing sits beneath
// the plugin to answer the request, so the call ends in an error after the plugin ran.
async function step($: Engine, model: string, effort: 'low' | 'medium' | 'high' | 'xhigh' | 'max') {
  try {
    for await (const chunk of $.turn.step({ turnId: 't1', index: 0, model, effort, messageCount: 1 })) void chunk
  } catch {
    // the bottom of the chain has no model to call: the plugin's hook already ran
  }
}

// The footer draws its labels joined by ` & `; this hook stands for the engine's drawing
// and shows what the plugin handed it.
async function footer($: Engine, on: On, modes: string[]) {
  on('ui.render', { component: 'SessionMode' }, async ($$, e) => {
    const { Text } = $$.ui.resolve(e)
    return <Text>{e.props.modes.join(' & ')}</Text>
  })
  await step($, 'claude-sonnet-5-5', 'high')
  const ui = await $.ui.mount({ plugin: 'model-effort', surface: 'terminal', component: 'SessionMode', props: { modes } })
  const text = (await ui.find({ type: 'Text' }))?.text
  await ui.unmount()
  return text
}

test('the footer gets the model and effort as one more label', async ($, on) => {
  expect(await footer($, on, ['focus'])).toBe('focus & sonnet 5.5 · high')
})

test('with no other label the footer carries only the model and effort', async ($, on) => {
  expect(await footer($, on, [])).toBe('sonnet 5.5 · high')
})
