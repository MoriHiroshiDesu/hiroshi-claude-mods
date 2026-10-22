# Configurar o git-band

O plugin tem uma opção, `columns`: quais colunas a faixa mostra e em que ordem.

## `columns`

Uma lista separada por vírgula. O padrão é `branch,changes,commit,lines`.

| Coluna | O que mostra |
|---|---|
| `branch` | a branch (ou a pasta do worktree e a branch), com `↑`/`↓` |
| `changes` | as alterações não commitadas, por cor (`●` staged, `~` modificado, `?` novo, `✖` apagado), ou `✓` |
| `commit` | o hash, o assunto e a idade do último commit; o assunto encolhe para caber na largura |
| `lines` | as linhas `+`/`-` do último commit |

Exemplos:

| Valor | Resultado |
|---|---|
| `branch,commit` | só a branch e o último commit |
| `commit,branch` | o commit primeiro, depois a branch |
| `branch,changes` | a branch e o estado da árvore, sem o commit |

Nomes desconhecidos e repetidos são ignorados; se não sobrar nenhum válido, a faixa mostra as quatro colunas. Num repositório sem commits, `commit` mostra `sem commits` e `lines` some.

## Onde mudar

**Pelo `/config`:** abra `/config`, escolha o plugin `git-band` e edite `Colunas`. Depois rode `/reload-plugins`.

**Pelo `settings.json`:** a opção fica em `pluginConfigs`, na chave `<plugin>@<marketplace>`:

```json
{
  "pluginConfigs": {
    "git-band@hiroshi-claude-mods": {
      "options": {
        "columns": "branch,commit"
      }
    }
  }
}
```

Se mudou e nada mudou, rode `/reload-plugins`.
