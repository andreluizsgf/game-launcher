# 0002 — SQLite (better-sqlite3) com migrações por `user_version`

- **Status:** aceita
- **Data:** 2026-10-10

## Contexto

A biblioteca precisa guardar:

- jogos de várias origens;
- tempo de jogo e histórico de sessões;
- vínculo com o IGDB;
- caminhos de exe e capa.

Tudo isso sobrevivendo a renomeações de pasta e atualizações do app.

## Decisão

- `better-sqlite3`, síncrono, num arquivo `library.db` no userData, com WAL.
- **Migrações** são uma lista de strings SQL em `src/main/db/schema.ts`. O índice é o `PRAGMA user_version`.
  Cada uma roda numa transação com `foreign_keys = OFF` (as reconstruções de tabela apagam tabelas
  referenciadas).
- Toda a SQL fica em `GamesRepo` (`src/main/db/games.ts`). O resto do app só vê o tipo `Game`.
- Os testes do repo (`*.db.test.ts`) rodam **dentro do Electron** (`ELECTRON_RUN_AS_NODE=1`): o
  `postinstall` recompila o better-sqlite3 para o ABI do Electron, então ele não carrega no Node puro.

## Consequências

- Mudar o schema = acrescentar uma migração no fim. **Nunca editar uma migração antiga** (bancos já migrados
  não a rodariam de novo).
- O `npm test` comum ignora `*.db.test.ts`. Use `npm run test:db`. O CI roda os dois.
- As configurações ficam fora do banco, em JSON (ADR 0005).
