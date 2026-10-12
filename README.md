# hiroshi-claude-mods

Mods pessoais do Claude Code: plugins que mudam a interface ou o comportamento do próprio Claude Code.

## Instalar

```sh
claude plugin marketplace add <usuario>/hiroshi-claude-mods
claude plugin install <mod>@hiroshi-claude-mods --scope user
```

Depois, `/reload-plugins` ou reinicie o Claude Code. Para trazer versões novas: `claude plugin marketplace update`.

## Mods

| Mod | O que faz |
|-----|-----------|
| `model-effort` | Mostra o modelo e o effort da sessão, alinhados à direita do rodapé do prompt (`sonnet 5.5 · high`). |

## Adicionar um mod

1. Crie a pasta `<mod>/` com `.claude-plugin/plugin.json`, `hooks/hooks.json` e `hooks/register.tsx`.
2. Registre em `plugins` no `.claude-plugin/marketplace.json`.
3. Valide com `claude plugin validate .` e teste com `claude plugin test <mod>`.
4. Ao mudar um mod já publicado, aumente a `version` no `plugin.json`, senão as outras máquinas não atualizam.
