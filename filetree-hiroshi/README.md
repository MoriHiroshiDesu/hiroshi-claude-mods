# filetree-hiroshi

A árvore de arquivos da sessão num painel lateral do Claude Code, mostrando onde o agente lê e escreve e, abaixo dela, os diffs que ele faz.

Inspirado no [claude-code-filetree](https://github.com/data-goblin/claude-code-filetree), do data-goblin (MIT). Esta é uma implementação própria, mais enxuta, com modo foco e seção de diffs.

## O que mostra

- **Árvore do diretório da sessão**, com pastas antes e ordem natural. Clique ou Enter abre e fecha uma pasta.
- **Status git por arquivo:** amarelo modificado, verde novo, vermelho apagado ou em conflito, apagado o que está no `.gitignore`. À direita, as linhas `+N -N` contra o último commit, somadas nas pastas. No cabeçalho, o total e a branch com ↑↓.
- **Onde o agente está:** `●` pulsando em azul quando lê e em laranja quando escreve, `○` até o próximo prompt. A pasta do arquivo se abre e a árvore rola até ele.
- **Modo foco:** quando os arquivos ativos estão longe demais na árvore para caberem juntos, ela mostra só o caminho até eles e resume o resto em `⋯ N arquivos`. `f` fixa o foco ligado ou desligado; de novo, volta ao automático.
- **Alterações:** abaixo da árvore, cada arquivo escrito na sessão com `+N -N` e os trechos alterados. O mais recente fica aberto; clique abre e fecha os outros. `d` recolhe a seção e `c` a limpa.

## Quando abre

Sozinho, no início da sessão e na primeira escrita do agente, se o terminal estiver em tela cheia (`/tui fullscreen`) e largo o bastante para o painel caber ao lado da conversa: 144 colunas, ou 110 depois que você abriu o painel com `/filetree` uma vez. Um `/reload-plugins` fecha o painel e o abre de novo. Escritas fora do diretório da sessão aparecem só em Alterações, com o caminho a partir de `~`. `/filetree` abre ou fecha a qualquer momento; depois que você fecha o painel, ele não reabre sozinho na mesma sessão.

O painel de diff do próprio Claude Code (`/diff`) também abre sozinho quando o agente edita, e os dois viram abas no mesmo espaço: o que abriu por último fica na frente. Como o filetree já mostra os diffs, feche o de diff no `×`; ele fica fechado, nesta e nas próximas sessões, até você rodar `/diff` de novo.

## Teclas (com o painel focado)

| Tecla | O que faz |
|-------|-----------|
| Enter ou clique | abre ou fecha a pasta, ou o bloco de alterações |
| roda do mouse | rola a árvore; ela para de seguir o agente até o próximo prompt |
| `f` | foco: fixa ligado ou desligado, e de novo volta ao automático |
| `d` | recolhe ou mostra as alterações |
| `c` | limpa as alterações |

## Limitações

- Escritas feitas por comandos de shell (`sed -i`, `>>`) são descobertas comparando o git antes e depois: aparecem com `+N -N`, sem os trechos. Um arquivo novo, que o git ainda não acompanha, alterado de novo por shell passa despercebido.
- Leituras por shell são reconhecidas só quando o comando é de leitura e cita o arquivo (`cat`, `sed -n`, `head`), até 5 arquivos por comando.
- `git add`, commits e checkouts feitos em outro terminal atualizam o painel na hora a partir da sessão seguinte à instalação; até lá, ele se atualiza a cada prompt.

## Desenvolvimento

```sh
claude plugin validate filetree-hiroshi
claude plugin test "$PWD/filetree-hiroshi"
npx tsc -p filetree-hiroshi   # depois que o Claude Code carregou o mod e gravou os tipos
```

O plano e as decisões estão em [PLANO.md](PLANO.md).
