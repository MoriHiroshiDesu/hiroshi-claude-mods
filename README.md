## Instalar

```sh
claude plugin marketplace add MoriHiroshiDesu/hiroshi-claude-mods
claude plugin install <mod>@hiroshi-claude-mods --scope user
```

Depois, `/reload-plugins` ou reinicie o Claude Code. Para trazer versões novas: `claude plugin marketplace update`.

## Mods

| Mod | O que faz |
|-----|-----------|
| `model-effort` | Mostra o modelo e o effort da sessão, alinhados à direita do rodapé do prompt (`sonnet 5.5 · high`). |
| `git-band` | Uma linha acima do prompt em 4 colunas: branch ou worktree (↑↓), alterações não commitadas por cor, último commit e as linhas `+`/`-` dele. |
