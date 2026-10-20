# filetree-hiroshi: plano do MVP

Painel lateral com a árvore de arquivos do projeto, que mostra onde o agente está lendo e escrevendo, e, abaixo dela, uma seção com os diffs que ele vai fazendo.

Inspirado no [claude-code-filetree](https://github.com/data-goblin/claude-code-filetree) (data-goblin, MIT). O que for copiado de lá entra com atribuição no README e o LICENSE do original, como no `context-bar-hiroshi`.

## O problema que o MVP resolve

No filetree, quando o agente mexe em dois arquivos distantes na árvore (ex.: `src/...` lá em cima e `README.md` lá embaixo), um deles fica fora da tela. Ele centraliza no arquivo mais recente e só fixa no topo os que ficaram **acima** (`register.tsx:1442-1452` do original); quem fica abaixo some.

Solução: **modo foco**, em que a árvore mostra só o caminho até os arquivos ativos e resume o resto em linhas `⋯ N itens`. A **seção de diffs** também serve de lista de atividade, sempre com todos os arquivos tocados.

## Layout

```
 filetree · main ↑1                      ◉ foco
▾ hiroshi-claude-mods                  +14 -4
  ▾ git-band/hooks
    ⋯ 2 itens
    ● register.tsx                     +12 -3
  ⋯ 4 pastas
  ● README.md                           +2 -1
─ Alterações ──────────────────────────────────
▾ git-band/hooks/register.tsx  +12 -3     agora
   42 - const width = 80
   42 + const width = cols()
   43   const SEP: Seg = { text: ' │ ' }
▸ README.md  +2 -1                        12s
```

- `●` com shimmer: o agente está mexendo nele agora (laranja para escrita, azul para leitura).
- `○`: tocado neste turno, mas já não está ativo.
- A seção de diffs ocupa até 40% da altura do painel. Só o arquivo mais recente fica expandido; os outros mostram uma linha de cabeçalho.

## Escopo

**Entra no MVP**
1. Árvore navegável (expandir e recolher pastas, cursor, rolagem), com pastas antes e ordenação natural.
2. Status git por arquivo (cor) e `+N -N` por arquivo e pasta, mais a branch e ↑↓ no cabeçalho.
3. Marcação de atividade: leitura (Read, Grep, Glob) e escrita (Edit, Write, NotebookEdit), revelando a pasta do arquivo se estiver recolhida.
4. Modo foco automático, com tecla para alternar.
5. Seção de diffs com os trechos alterados.
6. O painel abre sozinho na primeira escrita do agente (ver "Abertura e escopo"); `/filetree` abre e fecha na mão.

## Abertura e escopo

- **Raiz fixa:** a árvore é sempre a do diretório da sessão (o cwd em que a sessão começou). Um `cd` do agente não troca a raiz.
- **Abre sozinho no início da sessão e nas escritas:** com o terminal em tela cheia, o painel abre com a árvore assim que a sessão começa (o primeiro desenho da faixa acima do prompt diz se o terminal acopla painéis). Um `/reload-plugins` fecha o painel, e o `session.start` que vem depois o abre de novo. Fora isso, abre quando o agente escreve ou edita um arquivo (Edit, Write, NotebookEdit ou mudança detectada depois de um Bash). Leituras não abrem o painel.
- **Escrita dentro do diretório da sessão:** o painel mostra a árvore e a seção de diffs.
- **Escrita fora do diretório da sessão:** o arquivo entra só na seção de diffs, com o caminho a partir de `~` (ex.: `~/.config/foo.toml`), e nunca na árvore. Se até ali só houve escritas fora, o painel abre só com a seção de diffs, ocupando a altura toda; a árvore aparece na primeira escrita dentro do diretório.
- **Leituras fora do diretório:** ignoradas (não marcam nada).
- **`/filetree`:** abre o painel completo a qualquer momento, com a árvore mesmo sem escritas; de novo fecha. Depois de fechado pela pessoa (`/filetree`, `×` ou tecla), o painel não reabre sozinho na mesma sessão.

**Fica de fora (talvez depois)**: preview de arquivo, busca, rastrear operações git/gh no rodapé, tamanho de pastas, ícones Nerd Font, contexto do arquivo selecionado no prompt, `/filetree <path>`.

## Estrutura

```
filetree-hiroshi/
  .claude-plugin/plugin.json   name, version 0.1.0, description, "types": "./types/index.d.ts"
  hooks/hooks.json             { "modules": ["./register.tsx"] }
  hooks/register.tsx           eventos e desenho do painel (fino: só liga as peças)
  hooks/tree.ts                puro: modelo da árvore, linhas visíveis, projeção do modo foco
  hooks/diff.ts                puro: structuredPatch → blocos e linhas da seção de diffs
  hooks/git.ts                 puro + process: status, numstat, branch (parser no estilo do git-band)
  hooks/rows.tsx               Client das linhas: teclas e shimmer (base: rows.tsx do original)
  types/index.d.ts             contrato do $.state
  tests/*.test.ts(x)
  tsconfig.json
```

Manter `tree.ts`, `diff.ts` e o parser do `git.ts` sem `$` deixa a lógica testável sem o motor.

## Estado (`$.state`, declarado em `types/index.d.ts`)

| Chave | Conteúdo |
|---|---|
| `tree` | `root`, `nodes` (por caminho: nome, tipo, pai, filhos carregados), `expanded[]`, `cursor`, `scroll` (`null` = segue o agente) |
| `git` | `branch`, `ahead`, `behind`, `status` por caminho (`?`, `M`, `D`, `A`), `diff` por caminho `[add, del]` já somado nas pastas |
| `activity` | por caminho: `tone` (`read` ou `write`), `since`, `live` (tool.call em curso) |
| `focus` | `mode`: `auto`, `on` ou `off`; `manual` (a pessoa navegou neste turno) |
| `changes` | lista por arquivo, a mais recente primeiro: `path`, `outside` (fora do diretório da sessão), `added`, `removed`, `hunks[]`, `at`, `expanded` |
| `panel` | `open`, `closedByUser`, `showTree` (vira `true` na primeira escrita dentro do diretório ou no `/filetree`) |

## Eventos

| Evento | Uso |
|---|---|
| `session.start` | registra `/filetree`, guarda o diretório da sessão como raiz, lê a raiz (`$.fs.list`) e roda o git; pede a abertura do painel ao primeiro desenho em tela cheia |
| `ui.render` `AbovePrompt` | não desenha nada: guarda se o terminal acopla painéis e, no início da sessão, abre o painel por um timer (um desenho não pode gravar estado) |
| `command.run` `filetree` | abre ou fecha o painel (`$.ui.open`); fechar marca `closedByUser`, porque o `ui.close` do próprio mod chega com origem `plugin` |
| `tool.call` Read, Grep, Glob | antes do `next`: marca `live` e `read`; depois: tira o `live`. Grep e Glob marcam no máximo N arquivos do resultado |
| `tool.call` Edit, Write, NotebookEdit | antes: `live` e `write`, revela a pasta. Depois: lê o `structuredPatch` do resultado (Edit e Write já trazem os hunks prontos, sem rodar git) e o empurra em `changes`; agenda a atualização do git |
| `tool.call` Bash | depois: se o comando não for só leitura, agenda a atualização do git; arquivos alterados aparecem em `changes` só com `+N -N` vindo do `git diff --numstat`, sem hunks no MVP |
| `classic.FileChanged` | atualiza o nó e o git (com debounce de 300 ms) para mudanças feitas fora do agente |
| `prompt.submit` | novo turno: zera `focus.manual`, apaga os `○` do turno anterior |
| `ui.render` Pane | monta cabeçalho + árvore (normal ou projetada) + seção de diffs, dentro de `scroll.bodyRows` |
| `ui.scroll`, `ui.focus`, `ui.message` | rolagem, foco e teclas vindas do Client (`rows.tsx`) |

Ponto a validar na fase 1: o original lê teclas e mouse por um `Client` (`ClientModule` em `rows.tsx`) e faz a rolagem na mão por `ui.message`. Confirmar se isso ainda é o caminho nesta versão ou se a rolagem nativa do Pane já basta.

## Modo foco: regra da projeção

Entrada: árvore completa + os arquivos que o agente tocou no turno (os ativos, `●`, e os recentes, `○`) + o cursor. O conjunto `A` dos ativos (os `live` e os tocados nos últimos 4 s) decide quando o foco liga.

1. Uma linha aparece se for **ancestral** de algum arquivo em `A`, se **estiver** em `A` ou se for o cursor.
2. Em cada pasta exibida, irmãos ocultos consecutivos viram uma linha `⋯ N itens` (ou `⋯ N pastas` / `⋯ N arquivos` quando forem todos do mesmo tipo).
3. Uma pasta com um único filho exibido junta os nomes numa linha só (`git-band/hooks`), como o "compact folders" do VS Code.
4. A projeção só existe para desenhar: não muda `expanded`. Ao sair do foco, a árvore volta exatamente como estava.

Quando liga e desliga:
- `auto` (padrão): liga quando há 2 ou mais arquivos ativos **e** eles não cabem juntos na janela atual. Desliga 3 s depois que `A` esvazia.
- A pessoa rolou ou moveu o cursor durante o turno: `manual = true` e o auto não liga mais até o próximo prompt.
- Tecla `f` (botão `f: foco` ao lado da branch): no `auto`, fixa o contrário do que aparece (`on` se o foco não está ativo, `off` se está); apertada de novo, volta para `auto`.

Com um arquivo só ativo, sem foco: a janela segue o arquivo, como no original.

## Seção de diffs

- Fonte: `structuredPatch` de Edit e Write (`oldStart`, `newStart`, `lines` com prefixo `+`, `-` ou espaço). Várias edições no mesmo arquivo se acumulam no mesmo bloco; o `+N -N` do cabeçalho vem do numstat do git quando ele chegar, para refletir o arquivo real.
- Desenho: número da linha (de `newStart`), sinal colorido (verde `+`, vermelho `-`, contexto apagado), texto cortado na largura do painel. Até 12 linhas por bloco expandido, depois um `⋯ +N linhas`.
- Altura: até 40% de `bodyRows`; se não houver alterações, a seção some e a árvore ocupa tudo. Sem árvore (só escritas fora do diretório), ocupa tudo.
- Arquivos fora do diretório da sessão aparecem com o caminho a partir de `~` e um `↗` no cabeçalho do bloco; o `+N -N` deles vem só do `structuredPatch`, já que podem não estar num repositório git.
- Teclas: `d` mostra ou esconde a seção; `enter` num bloco expande ou recolhe; `c` limpa a lista.
- Duração: acumula a sessão inteira; só o `c` limpa.
- Implementação: os trechos são desenhados pelo elemento `Code` com `format: 'diff'` (números, cores e realce de sintaxe iguais aos diffs do Claude Code). A coluna de idade (`agora`, `12s`) ficou de fora, porque exigiria redesenhar o painel a cada segundo.
- Rolagem: com a seção embaixo, a árvore rola numa janela própria (o corpo do painel é desenhado do tamanho exato, para a seção ficar sempre à vista). A janela segue o arquivo que o agente tocou por último; a roda do mouse sobre a árvore e o anel de foco do teclado a movem, e aí ela para de seguir até o próximo prompt.

## Fases

Cada fase termina carregável, com testes passando (`claude plugin validate`, `tsc -p`, `claude plugin test`) e um commit.

1. ✓ **Esqueleto**: manifesto, `/filetree`, painel abre com a raiz, expandir e recolher, cursor e rolagem. Resolver aqui a dúvida do Client e da rolagem.
2. ✓ **Git**: status por cor, `+N -N` por arquivo e pasta, branch ↑↓ no cabeçalho, atualização por FileChanged.
3. ✓ **Atividade e abertura**: tons de leitura e escrita via `tool.call`, revelar a pasta, shimmer nos `live`, `○` no fim; abertura automática na primeira escrita e o respeito ao `closedByUser`.
4. ✓ **Modo foco**: projeção em `focus.ts`, regra do auto, tecla `f`, indicador `◉ foco` no cabeçalho.
5. ✓ **Diffs**: `diff.ts`, a seção, teclas `d`, `enter` e `c`, divisão da altura.
6. ✓ **Fechamento**: README do mod e da raiz, `marketplace.json`, atribuição ao original, teste manual num projeto grande.

## Testes

- `tree.test.ts`: ordenação; linhas visíveis com pastas expandidas; **projeção com dois arquivos distantes** (um em `src/a/b/x.ts`, outro no `README.md` da raiz, com 50 arquivos entre eles) cabendo em menos de 10 linhas; agrupamento `⋯ N itens`; pastas compactadas; saída do foco devolve a árvore igual.
- `diff.test.ts`: `structuredPatch` → linhas numeradas; acúmulo de duas edições no mesmo arquivo; corte em 12 linhas.
- `git.test.ts`: parser de `status --porcelain -z` e `numstat -z`, soma nas pastas, arquivos binários.
- `render.test.tsx`: painel com e sem alterações, foco ligado, larguras pequenas (24 colunas); painel só com diffs (escrita fora do diretório).
- `register.test.ts`: o painel abre no início em tela cheia, não no main screen nem numa leitura; abre na primeira escrita; um reload o abre de novo; escrita fora do diretório abre sem árvore e não cria nó; depois de fechado pela pessoa, não reabre.

## Decisões tomadas

1. A seção de diffs guarda as alterações da **sessão inteira**; a tecla `c` limpa.
2. Arquivos ignorados pelo `.gitignore` **aparecem**, apagados (inclusive `node_modules`, que fica recolhido e só é lido ao expandir). Só a pasta `.git` fica escondida.
3. O painel **abre sozinho no início da sessão** (em tela cheia) e na primeira escrita. A árvore é só do diretório da sessão; escritas fora dele vão só para a seção de diffs (detalhes em "Abertura e escopo").
