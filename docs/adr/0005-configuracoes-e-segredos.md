# 0005 — Configurações em JSON e segredos com safeStorage

- **Status:** aceita
- **Data:** 2026-10-10

## Contexto

O app guarda várias credenciais:

- client secret do IGDB;
- api hash e sessão do Telegram;
- senha da Web UI do qBittorrent;
- chave da Steam Web API;
- refresh token da Epic.

O usuário nunca cola tokens no chat do desenvolvimento, e o repositório de releases é público.

## Decisão

- `settings.json` no userData, com tipo `StoredSettings` e `DEFAULTS` mesclados na leitura (campos novos não
  quebram arquivos antigos).
- Todo segredo é um campo `xxxEnc`, cifrado com `safeStorage` (DPAPI no Windows, Keychain no Mac) via
  `encrypt`/`decrypt`. Se a decifragem falhar, o valor é tratado como ausente.
- O renderer recebe `Settings` (`publicSettings`), **sem segredos**: só `hasXxx: boolean` ou um nome de exibição
  (`epicAccount`). Segredos entram por canais próprios (`settings:setIgdbSecret`, `settings:setSteamApiKey`…).
- Variáveis de ambiente servem de fallback em dev (`IGDB_CLIENT_ID/SECRET`, `GL_GAMES_ROOT`, `GL_ROMS_ROOT`).

## Consequências

- Segredos não passam pela ponte IPC na leitura nem aparecem em logs.
- Trocar de máquina ou de usuário do Windows invalida os segredos (DPAPI). O usuário precisa informá-los de novo.
- A sessão Epic usa um refresh token rotativo: a cada renovação ele é regravado (`saveLogin`).
