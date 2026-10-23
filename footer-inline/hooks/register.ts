import type { Register } from 'claude-code'

// Status lines whose text matches are held back from their own row and drawn
// at the end of the mode line instead.
const INLINE = /on demand/

export const isInline = (text: string | undefined) => text === undefined || INLINE.test(text)

export const tailOf = (held: string | undefined) => (held === undefined ? undefined : `  ·  ⚠ ${held}`)

export const register: Register = on => {
  let held: string | undefined

  on('ui.status', ($, e, next) => {
    if (!isInline(e.text)) {
      return next(e)
    }

    held = e.text
    $.ui.invalidate('ui.render')

    // Clear the plugin's own row: the text is drawn on the mode line instead.
    return next({ ...e, text: undefined })
  })

  on('ui.render', { component: 'PromptHint' }, (_$, e, next) => {
    const tail = tailOf(held)

    return tail === undefined ? next(e) : next({ ...e, props: { ...e.props, tail } })
  })
}
