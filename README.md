## Instalar

```sh
claude plugin marketplace add MoriHiroshiDesu/hiroshi-claude-mods
claude plugin install <mod>@hiroshi-claude-mods --scope user
```

Depois, `/reload-plugins` ou reinicie o Claude Code. Para trazer versões novas, atualize o marketplace e depois os mods instalados:

```sh
claude plugin marketplace update hiroshi-claude-mods
claude plugin update <mod>@hiroshi-claude-mods
```

Sem o nome, `claude plugin marketplace update` atualiza todos os marketplaces registrados. Depois, `/reload-plugins` de novo.

## Mods

| Mod | O que faz |
|-----|-----------|
| `model-effort` | Mostra o modelo e o effort da sessão, alinhados à direita do rodapé do prompt (`sonnet 5.5 · high`). Verde até sonnet e até high; vermelho de opus e de xhigh para cima. |
| `git-band` | Uma linha acima do prompt em 4 colunas: branch ou worktree (↑↓), alterações não commitadas por cor, último commit e as linhas `+`/`-` dele. A opção `columns` escolhe quais colunas aparecem e em que ordem ([guia](git-band/CONFIGURACAO.md)). |
| `context-bar-hiroshi` | Fork do `context-bar` do hamzafer (MIT): a janela de contexto como barra empilhada acima do prompt, agora atualizada também depois de um `/compact` e enquanto a tarefa roda, sem esperar o fim do turno. `/context-bar` mostra ou esconde. |
| `filetree-hiroshi` | Árvore de arquivos da sessão num painel lateral, com o status git e as linhas `+`/`-` de cada arquivo, marcando onde o agente lê (azul) e escreve (laranja). Modo foco quando os arquivos estão longe na árvore (`f`) e, abaixo dela, os diffs de cada arquivo escrito (`d` oculta, `c` limpa). Um botão `⧉ abrir` ao lado do nome, ao passar o mouse, abre o arquivo ou o diff no Zed ou no VS Code, só com o mouse. Com a opção `icons` (`nerd`), ícones de Nerd Fonts por tipo de arquivo e pasta, com ícones próprios para arquivos de IA e do Docker. Abre sozinho na primeira escrita; `/filetree` abre ou fecha. Detalhes no [README do mod](filetree-hiroshi/README.md); as opções `icons`, `editor` e `width` estão no [guia de configuração](filetree-hiroshi/CONFIGURACAO.md). Inspirado no `claude-code-filetree` do data-goblin (MIT). |
| `footer-inline` | Leva o status do `tool-diet` (`⚠ 10 tools on demand`) para o fim da linha do modo (`auto mode on`), em vez de uma linha só dele embaixo do prompt. Só mexe em status que contêm `on demand`; os de outros mods ficam como estão. Troque a regex `INLINE` em `hooks/register.ts` para mover outros. |
