## Instalar

```sh
claude plugin marketplace add MoriHiroshiDesu/hiroshi-claude-mods
claude plugin install <mod>@hiroshi-claude-mods --scope user
```

Depois, `/reload-plugins` ou reinicie o Claude Code. Para trazer versões novas: `claude plugin marketplace update`.

## Mods

| Mod | O que faz |
|-----|-----------|
| `model-effort` | Mostra o modelo e o effort da sessão, alinhados à direita do rodapé do prompt (`sonnet 5.5 · high`). Verde até sonnet e até high; vermelho de opus e de xhigh para cima. |
| `git-band` | Uma linha acima do prompt em 4 colunas: branch ou worktree (↑↓), alterações não commitadas por cor, último commit e as linhas `+`/`-` dele. |
| `context-bar-hiroshi` | Fork do `context-bar` do hamzafer (MIT): a janela de contexto como barra empilhada acima do prompt, agora atualizada também depois de um `/compact`. `/context-bar` mostra ou esconde. |
