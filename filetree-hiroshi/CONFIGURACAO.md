# Configurar o filetree-hiroshi

O plugin tem duas opções: `icons` (ícones de Nerd Fonts na árvore) e `editor` (onde o botão `⧉ abrir` abre os arquivos). Este guia mostra onde mudá-las e o que fazer quando não pegam. O que cada recurso faz está no [README](README.md).

## Onde mudar

**Pelo `/config`:** dentro do Claude Code, abra `/config`, escolha o plugin `filetree-hiroshi` e mude a opção. Depois rode `/reload-plugins`.

**Pelo `settings.json`:** a opção fica em `pluginConfigs`, na chave `<plugin>@<marketplace>`. Para o plugin instalado deste marketplace, a chave é `filetree-hiroshi@hiroshi-claude-mods`:

```json
{
  "pluginConfigs": {
    "filetree-hiroshi@hiroshi-claude-mods": {
      "options": {
        "editor": "auto",
        "icons": "nerd"
      }
    }
  }
}
```

O arquivo é `~/.claude/settings.json` (vale para todos os projetos). Depois de editar, rode `/reload-plugins`.

A chave inclui o marketplace de propósito: uma opção salva em `filetree-hiroshi@inline` (a chave de quando o plugin é carregado direto de uma pasta) **não vale** para o plugin instalado pelo marketplace. Foi o que fez os ícones sumirem depois de trocar a cópia local pela instalada: a opção continuava lá, mas na chave errada, e o plugin usava o padrão (`off`).

## `icons`

| Valor | O que faz |
|---|---|
| `off` (padrão) | a árvore com `▾`/`▸` e `●`/`○`, sem ícones |
| `nerd` | os ícones, e os logos de IA (Claude, OpenAI, Gemini, Copilot e o robô dos agentes, da Nerd Fonts 3.5) quando o terminal consegue desenhá-los; senão, os glifos da 2.3 |
| `nerd-2.3` | os ícones, sempre só com os glifos da 2.3 |

O padrão é `off` porque o plugin não tem como saber se o terminal tem os glifos. Sem eles aparecem caixinhas.

### O que o terminal precisa

A fonte do terminal tem de ser uma Nerd Font (o nome termina em `NF` ou `Nerd Font`), de qualquer versão a partir da 2.3. Com isso, `nerd` e `nerd-2.3` mostram os ícones comuns.

Os logos de IA são da 3.5. No `nerd`, o plugin pergunta ao fontconfig (`fc-list`) no início de cada sessão se há uma fonte com eles onde o terminal vai procurar:

- **Warp** (detectado por `TERM_PROGRAM` ou `WARP_CLIENT_VERSION`, inclusive dentro do `tmux`): só conta a fonte do terminal em `~/.config/warp-terminal/settings.toml` (`font_name`). O Warp não carrega a `Symbols Nerd Font Mono` instalada à parte (`failed to load font 'SymbolsNFM'` em `~/.local/state/warp-terminal/warp.log`) e, quando precisa de um glifo que só ela tem, a tela inteira some. Por isso, no Warp, use uma Nerd Font como fonte do terminal.
- **Outros terminais** (GNOME e semelhantes): contam todas as fontes instaladas, porque buscam nas outras fontes o glifo que falta na principal.
- **Sem `fc-list`** (macOS, Windows): ficam os glifos da 2.3.

Se a fonte do terminal for anterior à 3.5 e o terminal não buscar glifos em outras fontes, use `nerd-2.3`: lá os logos novos apareceriam como caixinha.

### Sem trocar a fonte do terminal

Instale a `Symbols Nerd Font Mono` (`NerdFontsSymbolsOnly.zip` na [página de releases](https://github.com/ryanoasis/nerd-fonts/releases/latest)):

```sh
unzip NerdFontsSymbolsOnly.zip -d ~/.local/share/fonts/NerdFontsSymbolsOnly
fc-cache -f
```

Reinicie o terminal. Use a variante **Mono**: a outra desenha ícones mais largos que uma coluna. Isso só funciona em terminais que buscam nas fontes do sistema (o do GNOME busca; o Warp não).

## `editor`

| Valor | O que faz |
|---|---|
| `auto` (padrão) | o editor em cujo terminal a sessão roda (terminal integrado do VS Code ou do Zed); fora deles, o primeiro instalado, nesta ordem: Zed, VS Code |
| `zed` | sempre o Zed |
| `code` | sempre o VS Code |

O `$EDITOR` não entra na conta. Um valor que não seja um desses três vale como `auto`.

## Se algo não funcionou

| Sintoma | O que verificar |
|---|---|
| Nenhum ícone, só `▾`/`▸` e `●`/`○` | `icons` está `off`, ou a opção está na chave errada. Confira que o `pluginConfigs` tem `filetree-hiroshi@hiroshi-claude-mods` (`claude plugin list` mostra o nome completo do plugin instalado) e rode `/reload-plugins`. |
| Caixinhas no lugar dos ícones | O terminal não usa uma Nerd Font. Troque a fonte do terminal por uma `NF`. |
| Caixinhas só nos logos de IA | A fonte é anterior à 3.5 e o terminal não busca glifos em outras fontes. Use `icons: "nerd-2.3"`. |
| A tela do Warp some | O Warp precisou de um glifo que só a `Symbols Nerd Font Mono` tem. Use uma Nerd Font como fonte do terminal e não dependa da Symbols. |
| O `⧉` abre o editor errado | Fixe `editor` em `zed` ou `code`. |
| Mudei e nada mudou | Rode `/reload-plugins`. Ele fecha o painel e o abre de novo. |
