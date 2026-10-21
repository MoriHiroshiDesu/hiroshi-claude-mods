# filetree-hiroshi

A árvore de arquivos da sessão num painel lateral do Claude Code, mostrando onde o agente lê e escreve e, abaixo dela, os diffs que ele faz.

Inspirado no [claude-code-filetree](https://github.com/data-goblin/claude-code-filetree), do data-goblin (MIT). Esta é uma implementação própria, mais enxuta, com modo foco e seção de diffs.

## O que mostra

- **Árvore do diretório da sessão**, com pastas antes e ordem natural. Clique ou Enter abre e fecha uma pasta.
- **Status git por arquivo:** amarelo modificado, verde novo, vermelho apagado ou em conflito, apagado o que está no `.gitignore`. À direita, as linhas `+N -N` contra o último commit, somadas nas pastas. No cabeçalho, o total e a branch com ↑↓.
- **Onde o agente está:** `●` pulsando em azul quando lê e em laranja quando escreve, `○` até o próximo prompt (com os [ícones](#ícones) ligados, o próprio ícone do arquivo pulsa e fica na cor do tom até o próximo prompt). A pasta do arquivo se abre e a árvore rola até ele.
- **Modo foco:** quando os arquivos ativos estão longe demais na árvore para caberem juntos, ela mostra só o caminho até eles e resume o resto em `⋯ N arquivos`. `f` fixa o foco ligado ou desligado; de novo, volta ao automático.
- **Alterações:** abaixo da árvore, cada arquivo escrito na sessão com `+N -N` e os trechos alterados. O mais recente fica aberto; clique abre e fecha os outros. `d` recolhe a seção e `c` a limpa.
- **Abrir no editor:** com o mouse sobre a linha de um arquivo aparece um botão `⧉ abrir` logo depois do nome (na ponta direita, sobre a contagem, quando o nome é comprido). Clicar nele abre o arquivo no Zed ou no VS Code; numa alteração, abre o diff. Se o projeto já está aberto no editor, o arquivo vira uma aba na janela dele; se não, o editor abre o projeto com o arquivo em foco. Ao clicar, um aviso (toast) no Claude Code confirma que o arquivo está sendo aberto. Só o mouse abre: não há atalho de teclado.

## Quando abre

Sozinho, no início da sessão e na primeira escrita do agente, se o terminal estiver em tela cheia (`/tui fullscreen`) e largo o bastante para o painel caber ao lado da conversa: 144 colunas, ou 110 depois que você abriu o painel com `/filetree` uma vez. Um `/reload-plugins` fecha o painel e o abre de novo. Um `/clear` começa uma sessão nova: a árvore é lida de novo, as alterações somem e o painel abre como no início (o Claude Code não avisa o mod de um `/clear` com `session.start`, então o mod percebe pela troca do id da sessão). Escritas fora do diretório da sessão aparecem só em Alterações, com o caminho a partir de `~`. `/filetree` abre ou fecha a qualquer momento; depois que você fecha o painel, ele não reabre sozinho na mesma sessão.

O painel de diff do próprio Claude Code (`/diff`) também abre sozinho quando o agente edita, e os dois viram abas no mesmo espaço: o que abriu por último fica na frente. Como o filetree já mostra os diffs, feche o de diff no `×`; ele fica fechado, nesta e nas próximas sessões, até você rodar `/diff` de novo.

## Teclas (com o painel focado)

| Tecla | O que faz |
|-------|-----------|
| Enter ou clique | abre ou fecha a pasta, ou o bloco de alterações |
| roda do mouse | rola a árvore; ela para de seguir o agente até o próximo prompt |
| `f` | foco: fixa ligado ou desligado, e de novo volta ao automático |
| `d` | recolhe ou mostra as alterações |
| `c` | limpa as alterações |
| clique no `⧉` | abre o arquivo no editor; numa alteração, o diff |

O `⧉` só aparece com o mouse sobre a linha e fica fora do Tab e das setas.

## Ícones

A opção `icons` do plugin (em `/config`) liga os ícones de Nerd Fonts: um por tipo de arquivo (TypeScript, JSON, Markdown, Dockerfile, `package.json`…) e um de pasta aberta ou fechada, no lugar do `▾`/`▸`. O padrão é `off`, porque o mod não tem como saber se o terminal tem os glifos: sem eles aparecem caixinhas.

Com `nerd`, o ícone do arquivo tem a cor do tipo e o da pasta, a do nome (a do status git). Quando o agente lê ou escreve num arquivo, o ícone dele passa a ter a cor e o brilho da atividade, no lugar do `●`/`○`.

Os glifos vêm da [Nerd Fonts](https://www.nerdfonts.com). Duas formas de tê-los, sem trocar a fonte do terminal se você não quiser:

- se a fonte do terminal já é uma Nerd Font (o nome termina em `NF` ou `Nerd Font`), nada a instalar;
- senão, instale a `Symbols Nerd Font Mono` (`NerdFontsSymbolsOnly.zip` na [página de releases](https://github.com/ryanoasis/nerd-fonts/releases/latest)), por exemplo em `~/.local/share/fonts` seguido de `fc-cache -f`, e reinicie o terminal. Funciona em terminais que buscam nas fontes do sistema os glifos que a fonte principal não tem; o Warp faz isso (testado). Use a variante **Mono**: a outra desenha ícones mais largos que uma coluna.

## Editor

A opção `editor` do plugin (em `/config`) escolhe onde abrir: `auto` (padrão), `zed` ou `code`. No `auto`, vale o editor em cujo terminal a sessão roda (o terminal integrado do VS Code ou do Zed); fora deles, o primeiro instalado, nessa ordem. O `$EDITOR` não entra na conta.

O diff compara o arquivo com a versão do último commit; um arquivo fora do git é comparado com uma cópia feita antes da primeira escrita do agente na sessão. Essas versões ficam numa pasta temporária (`/tmp/filetree-hiroshi-*`), apagada no fim da sessão.

## Limitações

- Escritas feitas por comandos de shell (`sed -i`, `>>`) são descobertas comparando o git antes e depois: aparecem com `+N -N`, sem os trechos. Um arquivo novo, que o git ainda não acompanha, alterado de novo por shell passa despercebido.
- Leituras por shell são reconhecidas só quando o comando é de leitura e cita o arquivo (`cat`, `sed -n`, `head`), até 5 arquivos por comando.
- No Zed, o `⧉` de uma alteração abre o arquivo na linha do trecho mais recente, não o diff lado a lado: o `--diff` do Zed (1.24) sempre abre outra janela. O Zed marca na margem as linhas alteradas contra o último commit; um arquivo fora do git fica sem essas marcas.
- No Zed, o mod lê o banco do próprio Zed (com `python3`) para saber se o projeto já tem uma janela só dele; se não tem, abre uma janela nova em vez de deixar o Zed pôr o projeto na janela de outro. Se a leitura falhar, o Zed decide a janela, e pode acrescentar o projeto à janela ativa.
- O VS Code só reaproveita a janela aberta exatamente na pasta da sessão. Se você abriu nele só uma subpasta do projeto, o arquivo abre numa janela nova.
- `git add`, commits e checkouts feitos em outro terminal atualizam o painel na hora a partir da sessão seguinte à instalação; até lá, ele se atualiza a cada prompt.

## Desenvolvimento

```sh
claude plugin validate filetree-hiroshi
claude plugin test "$PWD/filetree-hiroshi"
npx tsc -p filetree-hiroshi   # depois que o Claude Code carregou o mod e gravou os tipos
```

O plano e as decisões estão em [PLANO.md](PLANO.md).
