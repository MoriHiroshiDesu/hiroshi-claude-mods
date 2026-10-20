import type { Register } from 'claude-code'

const PANE = 'ctrl-click-teste'
const LOG = '/tmp/ctrl-click.log' // troque por um caminho que o mod possa escrever

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'ctrl-click-teste', description: 'Abre o painel de teste do ctrl+clique' }).catch(() => {})
    return next(e)
  })

  on('command.run', { command: 'ctrl-click-teste' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Teste ctrl+clique' })
    return { text: 'Painel de teste aberto.' }
  })

  on('ui.message', { component: 'Pane', requestId: PANE }, async ($, e, next) => {
    const was = await $.fs.read(LOG).then(v => (typeof v === 'string' ? v : ''), () => '')
    await $.fs.write(LOG, `${was}${JSON.stringify(e.data)}\n`)
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    if (e.surface !== 'terminal') return $.ui.resolve(e).Text({ children: 'Só no terminal.' })
    const { Box, Text, Client } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        <Text>Clique na área abaixo: comum, ctrl, shift, alt.</Text>
        <Client key="alvo" module="./alvo.tsx" width="100%" height={8} />
      </Box>
    )
  })
}
