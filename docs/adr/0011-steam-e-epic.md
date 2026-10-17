# 0011 — Integração com Steam e Epic sem APIs oficiais de launcher

- **Status:** aceita
- **Data:** 2026-10-11 (instalados), 2026-10-12 (biblioteca da conta), 2026-10-14 (login Epic)

## Contexto

O usuário tem jogos na Steam e na Epic e quer vê-los junto com os da pasta: os instalados e também os comprados
que não estão instalados. Nenhuma das duas oferece uma API de "launcher de terceiros".

## Decisão

### Jogos instalados (arquivos locais)

- **Steam:**
  - a raiz vem do registro, ou do caminho padrão;
  - `libraryfolders.vdf` lista as bibliotecas;
  - cada `appmanifest_*.acf` é um jogo (parser VDF próprio em `platforms/vdf.ts`).
- **Epic:** `C:\ProgramData\Epic\EpicGamesLauncher\Data\Manifests\*.item` (JSON).

### Jogos da conta (não instalados)

- **Steam:** `IPlayerService/GetOwnedGames` com a **Steam Web API key** do usuário (cifrada). O SteamID vem do
  `loginusers.vdf` (`mostrecent`), sem precisar de login.
- **Epic:**
  - **Sem login:** `catcache.bin` do launcher da Epic. Fallback incompleto, só cobre parte da biblioteca.
  - **Com login:** OAuth com o client público do Epic Games Launcher.
    1. Uma `BrowserWindow` com partição própria (`persist:epic-login`) abre a página de login da Epic.
    2. Lê o `authorizationCode` da página de redirect.
    3. Troca o code por tokens.
    4. Consulta o library-service da Epic.
    5. Busca os itens no catálogo (bulk) para pegar título e arte.
  - O refresh token é cifrado e rotativo. A biblioteca fica em cache por 30 min; o catálogo, em
    `epic-library.json`, para sempre.

### Abrir e instalar

- **Abrir:**
  - Steam: `steam://rungameid/<appid>`.
  - Epic: `com.epicgames.launcher://apps/<AppName>?action=launch&silent=true`.
  - Nos dois casos a sessão é acompanhada pela pasta (ADR 0006).
- **Instalar** um jogo não instalado: abre o diálogo da própria loja.
- **Desinstalar:**
  - Steam: `steam://uninstall/<appid>`.
  - Epic: recusa e orienta a usar o launcher da Epic.

### Sincronização

- `syncPlatform` (ADR 0003): instalados ganham da entrada da conta com o mesmo id (`merge`).
- Ao voltar o foco para o launcher (após instalar algo na loja), há um rescan, limitado a uma vez por minuto.

## Consequências

- Formatos internos (`catcache.bin`, endpoints da Epic) podem mudar sem aviso. Falha = lista da conta indisponível
  (`ownedKnown=false`), sem quebrar os instalados.
- O OAuth da Epic com a conta real não foi validado em hardware pelo desenvolvedor.
- Para uma nova loja (GOG, Xbox, Ubisoft, EA), siga o mesmo formato: manifests locais para instalados, API ou
  cache para a conta, protocolo para abrir. Receita no CLAUDE.md.
