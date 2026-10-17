# 0004 — IPC tipado com envelope `Result<T>`

- **Status:** aceita
- **Data:** 2026-10-10 (reorganizado em 2026-10-11)

## Contexto

O renderer (React) não tem acesso a Node (`contextIsolation: true`). Erros do processo principal precisam virar
mensagens legíveis (toast) sem que cada tela trate exceções de IPC.

## Decisão

- O contrato fica em `LauncherApi` (`src/shared/types.ts`). O preload implementa uma linha por canal e o expõe
  como `window.api`.
- Canais seguem o padrão `area:acao` (`game:launch`, `settings:pickRomsRoot`, `epic:login`…).
- Ações que podem falhar são registradas com `handle()` (`src/main/ipc/result.ts`): a exceção vira
  `{ ok: false, error: message }`. Leituras que não falham usam `ipcMain.handle` direto.
- Mensagens de erro em **português**, escritas para o usuário final, lançadas onde o problema é detectado.
- Os serviços são instanciados uma vez em `ipc/index.ts` e ligados por callbacks. Por exemplo: download
  terminou → rescan → evento `library:changed`. Os handlers ficam divididos por área: `library`, `settings`,
  `telegram`, `system`.

## Consequências

- Canal novo = 3 arquivos (types, preload, ipc/<area>), sempre na mesma forma.
- O renderer checa `res.ok` e mostra `res.error` sem conhecer a origem do erro.
- Nada de lógica de negócio no preload nem nos handlers: eles só delegam a serviços testáveis.
