# 0001 — Electron + React + TypeScript com electron-vite

- **Status:** aceita
- **Data:** 2026-10-10

## Contexto

Queremos um launcher em tela cheia, com cara de console (PS5), para Windows, controlado pelo DualSense. Ele
precisa abrir processos, ler o disco, falar com APIs (IGDB, Steam, Epic, Telegram, qBittorrent) e se atualizar
sozinho. O desenvolvimento é feito num Mac.

## Decisão

- **Electron** (atualmente 44), com renderer em **React 18** e **TypeScript** nos três alvos (main, preload,
  renderer).
- Build com **electron-vite** e empacotamento com **electron-builder**.
- Código compartilhado em `src/shared` (alias `@shared`). Dois tsconfig: `tsconfig.node.json` (main, preload,
  shared) e `tsconfig.web.json` (renderer, shared).

## Consequências

- UI em HTML/CSS: animações e layout estilo console sem engine gráfica.
- O Chromium dá Gamepad API e WebHID, a base do suporte ao DualSense (ADR 0008).
- O app roda no Mac para desenvolver. Tudo que é específico do Windows ganha stub (ADR 0013).
- O pacote fica pesado (~100 MB), o que é aceitável para um app pessoal.
- Dependência nativa só o `better-sqlite3` (ADR 0002). Evitar outras: cada uma complica o CI e o rebuild pro
  Electron.
