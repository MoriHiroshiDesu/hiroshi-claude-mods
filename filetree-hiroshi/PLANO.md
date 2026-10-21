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

## Abrir no editor (fase 7, em andamento)

Um botão `⧉ abrir`, com fundo colorido, logo depois do nome do arquivo (na ponta direita, sobre a contagem, quando o nome não deixa espaço) abre no editor o arquivo da árvore ou, num bloco de Alterações, o diff (no Zed, o arquivo; ver "Diff" abaixo). Zed e VS Code primeiro. Projeto já aberto no editor: o arquivo vira uma aba na janela dele, que vem para a frente. Projeto fechado: o editor abre o projeto com o arquivo em foco. O clique na linha continua abrindo e fechando pastas e blocos.

Descartados:
- um preview com realce de sintaxe dentro do próprio painel. Funcionaria (o elemento `Code`), mas o painel é estreito, o `Code` não rola sozinho e o editor dá diff lado a lado, edição e LSP;
- o ctrl+clique. O `Button` não informa as teclas modificadoras; o `Client` informa, mas no Warp o ctrl+clique chegou como clique comum (`ctrl: false`). Exigiria também um `Client` por linha tratando o clique comum.

### Como abrir (testado em 2026-10-19 e 2026-10-20, Zed 1.24.2 e 1.24.4, VS Code 1.138.0 e 1.126.0, GNOME no Wayland)

- **Zed:** `zed <pasta da sessão> <arquivo>:<linha>` reaproveita a janela do projeto e a traz para a frente. Mas, quando o projeto não tem janela, o Zed 1.24 o acrescenta à janela ativa, ao lado do projeto que estiver lá (visto com o `e-saude` aberto). `zed -n` abre uma janela nova sempre, mesmo com o projeto já aberto. O CLI não lista janelas; o banco do Zed (`~/.local/share/zed/db/0-stable/db.sqlite`) sim: `kv_store.session_id` é a sessão em curso, cada projeto aberto é uma linha de `workspaces` com esse `session_id` e o `window_id` da janela, e o `session_id` some da linha quando a janela fecha. O mod lê isso com `python3` (o `sqlite3` costuma não estar instalado): se a raiz está aberta sozinha numa janela, `zed <raiz> <arquivo>`; senão, `zed -n <raiz> <arquivo>`. Se a leitura falhar (sem `python3`, formato mudou), cai no comando sem `-n`.
- **VS Code:** só reaproveita a janela com **exatamente** a pasta passada; uma subpasta abre outra janela, e sem pasta o arquivo cai na última janela ativa, mesmo de outro projeto. O mod chama sempre `code <raiz do projeto> -g <arquivo>:<linha>`, a raiz sendo a pasta da sessão. Quem abriu no VS Code só uma subpasta do projeto ganha uma janela nova: limitação no README. Descartado: ler as janelas abertas do `~/.config/Code/User/globalStorage/storage.json` (`windowsState.openedWindows`), que não tira a janela da lista quando ela fecha (só ao sair do VS Code). `code --status` dá a lista ao vivo, mas com o nome curto da pasta e em ~3 s.
- **Diff:** os editores comparam dois arquivos, não uma revisão do git, e o "antes" vai para um arquivo temporário: `git show HEAD:<caminho>` para os arquivos do git; para os de fora, uma cópia feita no `tool.call` antes da primeira escrita do agente na sessão (o que dá também um "diff da sessão").
  - VS Code: `code <raiz> --diff <antes> <arquivo>` abre o diff lado a lado como aba na janela do projeto.
  - Zed: o `--diff` não reaproveita janela em nenhuma forma testada. `zed --diff <antes> <arquivo> <pasta>` abre uma janela nova da pasta, mesmo com ela aberta; sem a pasta, uma janela do diretório de onde o comando rodou (inclusive rodando de dentro da pasta do projeto); com `-e`, acrescenta esse diretório como projeto na primeira janela existente (o Zed 1.24 guarda vários projetos numa janela) e troca para ele. E o `--diff` tem de vir antes dos caminhos: depois do primeiro caminho, tudo é lido como caminho (`<pasta> --diff a b` abre um arquivo chamado `--diff`). Então no Zed o `⧉` de Alterações abre só o arquivo, `zed <raiz> <arquivo>:<linha do trecho mais recente>`, que cai na janela certa e mostra na margem as alterações em relação ao HEAD. Arquivos fora do git ficam sem marca de alteração no Zed.
- Os dois editores sobem num processo próprio e sobrevivem ao fim do comando.
- Qual editor: opção `userConfig` (`auto`, `zed` ou `code`); no `auto`, `TERM_PROGRAM` e depois o que estiver instalado (o `$EDITOR` pode ser um editor de terminal).
- Nesta máquina o `zed` do PATH é um wrapper (`~/.local/bin/zed-project`): num projeto com `.zed/theme` ou overrides de tema, ele abre o Zed com `--user-data-dir` próprio, numa instância separada, e a janela já aberta pode não ser reaproveitada. Fora disso ele só repassa ao binário. Fica como limitação conhecida, não como caso a tratar.

### O ícone (spike validado em 2026-10-20, Warp)

- Só em arquivos (na árvore e nos blocos de Alterações), nunca em pastas. Aparece só com o ponteiro sobre a linha: um `Box` com `position="absolute"`, `left` logo depois do nome, `display="none"` e `hover={{ display: 'flex' }}` dentro do `Box` com `key` da linha, que é o escopo do hover. Quando o nome não deixa espaço antes da contagem, usa `right={0}` e cobre a contagem (`+N -N`) só enquanto o ponteiro está ali. A linha não perde colunas.
- O `⧉ abrir` é um `Button` `plain` com um `Text` de fundo `suggestion` (num terminal não dá para aumentar o glifo), com `key` próprio (`abrir:<caminho>`). O clique nele cai no `onPress` dele, não no da linha.
- Fora do anel de foco: a API não tem prop para isso, e um `Button` escondido entra no anel do Tab e das setas. O hook `ui.focus` do painel desvia: quando o anel vai cair num `abrir:`, segue para o próximo elemento na mesma direção do movimento (comparando a posição de destino com a do elemento focado, na ordem do desenho); sem próximo, o anel fica onde está. A ordem dos `key` é guardada a cada desenho.
- Só mouse: não há tecla para abrir no editor (uma tecla `e` foi cogitada e removida). Em pasta, o ícone não existe.

### Falta

1. Testar o desvio do foco com o painel aberto durante um reload do mod (num teste do spike a navegação travou uma vez e não se repetiu).

## Ícones por tipo de arquivo (fase 8, falta o teste manual)

Ícones de Nerd Fonts na árvore: um por tipo de arquivo e um para pasta aberta ou fechada. Sem mudar a fonte do terminal.

### O que o teste mostrou (2026-10-21, Warp no Linux, fonte do terminal Monaspace Krypton NF)

- O Warp **faz fallback por glifo** para fontes do sistema. Instalar a `Symbols Nerd Font Mono` (v3.5.1, pacote `NerdFontsSymbolsOnly`) em `~/.local/share/fonts` e reiniciar o Warp bastou para desenhar glifos que a fonte do terminal não tem (`e7c6`, `e800`, `e8e8`). Não precisa trocar a fonte nem instalar o `10-nerd-font-symbols.conf` do pacote.
- Cada glifo testado ocupa **1 coluna**: as barras de `|X|`, `|X |` e `|Xm|` alinham com a referência `|a|`, e o ícone não invade a letra seguinte. Vale para a faixa BMP (Seti, devicons, Font Awesome, Octicons: `E5FA` a `F2E0`) e para o Material (`F0001+`, fora do BMP).
- Usar sempre a variante **Mono** da Symbols (a sem "Mono" desenha ícones de 1,5 coluna). Quem já usa uma fonte NF (`Mono` ou não) não precisa de nada.
- Falta confirmar no painel real: largura dentro do Ink (`wrap="truncate-end"`) e a linha no limite da largura.

### Decisões

1. **Pasta**: o ícone de pasta aberta ou fechada **substitui** o `▾`/`▸`. A coluna do glifo continua uma só.
2. **Arquivo**: o ícone do tipo **substitui** o `●`/`○` e ganha a cor ou o brilho da atividade (leitura, escrita, recente). Sem atividade, o ícone do arquivo tem a cor do tipo (a do status git fica só no nome) e o da pasta, a do nome. Arquivo oculto ou ignorado fica esmaecido, como o nome.
3. **Ativação**: opção `icons` (`nerd` ou `off`) em `userConfig`, como a `editor`. Padrão `off`, porque o mod não consegue detectar se a fonte tem os glifos; sem a fonte, o padrão ligado mostraria caixinhas. Com `off`, a árvore fica exatamente como hoje.
4. **Codepoints**: só faixas estáveis. `nf-seti`, `nf-dev`, `nf-fa` e `nf-oct` (BMP) e `nf-md` (`F0001+`, em JS é um par de surrogates, e `string-width` conta 1 coluna). Fora: os `nf-mdi` antigos (`F500` a `FD46`), removidos na Nerd Fonts v3.
5. **Largura**: ícone + um espaço, sempre. `fitRow` recebe o `lead` já com o ícone, como hoje recebe o glifo.

### Estrutura

- `hooks/icons.ts` (puro, sem `$`): `iconFor(node, { open })` devolve `{ glyph, color }`. Ordem de busca: nome exato (`package.json`, `Dockerfile`, `.gitignore`, `README.md`, `LICENSE`…), depois extensão (`.ts`, `.tsx`, `.json`, `.md`, `.py`, `.rs`…), depois o ícone genérico de arquivo. Pasta: aberta ou fechada. Link simbólico: ícone próprio.
- `register.tsx`: onde hoje calcula `glyph` (linha da árvore), chama `iconFor` quando `icons === 'nerd'`; senão, o caminho de hoje.
- Ícones próprios (pedido depois do primeiro teste no Warp): IA e Docker. `CLAUDE.md`, `.claude` e `.claude-plugin` com o logo do Claude (`cod-claude`, Codicons da Nerd Fonts 3.5, em tan para não parecer o laranja de escrita do agente); `AGENTS.md`, `.agents`, `.cursor` e `.cursorrules` com o robô; `.codex` com o logo da OpenAI; `GEMINI.md` e `.gemini`; `copilot-instructions.md`. Pasta de IA tem um ícone só (aberta ou fechada) e mantém a cor dele, a não ser que o git tenha algo a dizer sobre ela. Docker: a baleia (`fa-docker`) em `Dockerfile`, `Dockerfile.*`, `docker-compose*.yml`, `compose*.yaml` e `.dockerignore`.
- O botão de abrir vira ` \uf08e abrir ` (link externo, do mesmo tamanho) com `icons: nerd`; com `off` continua o `⧉`.
- Os glifos ficam no código como `\uXXXX`: gravados direto, são invisíveis num editor sem Nerd Font.
- Fora do escopo: ícones nos blocos de Alterações (continuam com `▾`/`▸` do bloco), outras pastas especiais (`node_modules`, `src`, `.github`), cor própria por linguagem além do que já existe.

### Feito

`hooks/icons.ts` (tabela por nome e por extensão, códigos conferidos no `glyphnames.json` da v3.5.1), opção `icons` em `plugin.json`, ligação na linha da árvore em `register.tsx`, seção no README. Com `off` a saída é a de antes. Tudo no bloco Seti (`E5FA` a `E6B7`) e Font Awesome, que as Nerd Fonts antigas e a Krypton NF já têm.

### Falta

1. O teste manual no Warp, com `icons: nerd` em `/config` (ver abaixo).
2. Decidir se vale ícone nos blocos de Alterações e pastas especiais, depois de ver a árvore.

### Testes

- `icons.test.ts`: nome exato ganha da extensão; extensão desconhecida e arquivo sem extensão caem no genérico; maiúsculas e minúsculas; pasta aberta e fechada diferem; **todo glifo da tabela tem largura 1**.
- `pane.test.tsx`: com `icons: 'off'` a saída é igual à de hoje; com `nerd`, a linha mantém as colunas (cabe em 24 colunas) e a atividade colore o ícone.
- Manual no Warp: painel estreito, nome truncado, linha com `+N -N`, hover do `⧉ abrir`, pulso do agente num arquivo e numa pasta recolhida.

## Fases

Cada fase termina carregável, com testes passando (`claude plugin validate`, `tsc -p`, `claude plugin test`) e um commit.

1. ✓ **Esqueleto**: manifesto, `/filetree`, painel abre com a raiz, expandir e recolher, cursor e rolagem. Resolver aqui a dúvida do Client e da rolagem.
2. ✓ **Git**: status por cor, `+N -N` por arquivo e pasta, branch ↑↓ no cabeçalho, atualização por FileChanged.
3. ✓ **Atividade e abertura**: tons de leitura e escrita via `tool.call`, revelar a pasta, shimmer nos `live`, `○` no fim; abertura automática na primeira escrita e o respeito ao `closedByUser`.
4. ✓ **Modo foco**: projeção em `focus.ts`, regra do auto, tecla `f`, indicador `◉ foco` no cabeçalho.
5. ✓ **Diffs**: `diff.ts`, a seção, teclas `d`, `enter` e `c`, divisão da altura.
6. ✓ **Fechamento**: README do mod e da raiz, `marketplace.json`, atribuição ao original, teste manual num projeto grande.
7. ✓ **Abrir no editor**: o botão `⧉ abrir` (no hover; só mouse, sem tecla) abre o arquivo ou o diff no Zed ou no VS Code (detalhes em "Abrir no editor").
8. **Ícones por tipo**: `icons.ts`, opção `icons` em `plugin.json`, árvore com ícone de pasta e de arquivo no lugar de `▾`/`▸` e `●`/`○` (detalhes em "Ícones por tipo de arquivo").

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
4. Os ícones são **opcionais** (`icons: off` por padrão): o mod não detecta a fonte, e sem os glifos o painel mostraria caixinhas. Os ícones substituem os glifos `▾`/`▸` e `●`/`○`, sem coluna extra.
