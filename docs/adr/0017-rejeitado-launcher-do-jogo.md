# 0017 — Rejeitado: tratar o launcher próprio do jogo (seletor de exe)

- **Status:** rejeitada
- **Data:** 2026-10-16

## Contexto

Alguns jogos (ex.: Batman: Arkham Asylum) abrem primeiro uma janela de launcher própria, onde é preciso clicar
em "Jogar". Chegamos a implementar um seletor de executável, para o usuário escolher o exe do jogo em vez do
launcher.

## Decisão

O usuário pediu para remover a mudança, e ela foi revertida antes do commit. O comportamento atual fica: o exe
é escolhido automaticamente (`pickExe`). Launchers são apenas penalizados por nome (`SOFT_PENALTY`), não
proibidos.

## Consequências

- Não reintroduzir seletor de exe nem automação de clique no launcher do jogo sem pedido explícito.
- A sessão já cobre a troca launcher → jogo (ADR 0006).
- A coluna `exe_override` continua no schema e é respeitada pelo Runner, mas nenhuma UI a preenche.
