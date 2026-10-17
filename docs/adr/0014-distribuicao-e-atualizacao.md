# 0014 — Repo de código e repo de releases públicos; atualização automática

- **Status:** aceita
- **Data:** 2026-10-10

## Contexto

O código começou privado (o repo de releases separado existe por isso). O app instalado precisa se atualizar sozinho, mas o `electron-updater` com GitHub
precisa ler os releases sem token.

## Decisão

- **Repositórios:**
  - `andreluizsgf/game-launcher`: código. Era privado e virou **público** em 2026-10-17, porque o Actions em repo
    privado consome a cota de minutos paga (Windows conta em dobro); em repo público não custa nada.
  - `andreluizsgf/game-launcher-releases`: só instaladores e README do usuário, **público**.
- **CI** (`.github/workflows/release.yml`):
  - roda em tag `v*`, em `windows-2022` (o `windows-latest` traz um VS que o node-gyp ainda não detecta);
  - executa typecheck, testes, testes de DB e build;
  - publica com `electron-builder --publish always` usando `RELEASES_TOKEN` (PAT fine-grained, só no repo de
    releases).
- **Artefatos:**
  - instalador NSIS (`Game-Launcher-Setup-x.y.z.exe`, sem espaços para casar com o `latest.yml`);
  - exe portable.
- **Atualização:**
  - **Instalado:** `electron-updater` checa a cada 4 h, baixa em background (blockmap) e instala ao reiniciar ou
    ao sair. O NSIS desinstala a versão anterior em silêncio e instala a nova.
  - **Portable:** não se atualiza (roda de uma cópia temporária). Só avisa que há versão nova.
- **Fluxo de release:** `npm version` → commit → tag → push (detalhes no CLAUDE.md).

## Consequências

- Os dois repos são públicos: nada sensível pode ir para nenhum deles (segredos ficam cifrados no PC, ADR 0005).
  O repo de releases continua separado porque o app instalado busca atualizações nele.
- Versões seguem semver simples. `isNewer` compara `x.y.z`.
