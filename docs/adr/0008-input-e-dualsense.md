# 0008 — Input por ações; DualSense via WebHID; botão PS reservado ao launcher

- **Status:** aceita
- **Data:** 2026-10-10 (atalhos de emulador revistos em 2026-10-17)

## Contexto

O app é usado do sofá, só com o controle. No Windows, a Gamepad API do Chromium muitas vezes não vê o DualSense
por Bluetooth, ou recebe zeros congelados quando a Steam troca o formato de relatório. O teclado precisa
funcionar como alternativa, no dev e no PC.

## Decisão

- **Ações abstratas** (`input/actions.ts`): `up/down/left/right/confirm/back/details/secondary/options/`
  `pageLeft/pageRight/triggerLeft/submit`.
  - As telas assinam com `useInput(handler, active)`.
  - Há uma **pilha** de handlers: só o mais recente ativo recebe as ações (modais e sobreposições funcionam sem
    coordenação).
- **Fontes de input:**
  - `gamepad.ts`: Gamepad API no mapeamento padrão.
  - `dualsense.ts` + `hidPads.ts`: o DualSense lido por **WebHID**, que entende todos os formatos de relatório.
    A janela libera dispositivos HID da Sony sem seletor (`grantSonyHid`).
    - Se há pad Sony, os outros são ignorados, para que um Xbox virtual não duplique o input.
    - O HID ganha enquanto estiver recebendo relatórios.
  - `keyboard.ts`: setas, Enter, Esc, Q/E, T, S, O, Tab/Shift+Tab.
- **Com um jogo em foco** o pad não move o launcher (`document.hasFocus()`). Só o **botão PS** é observado, e é
  ele que abre o overlay (ADR 0007).
- **Botões reservados:**
  - **PS** é do launcher e nunca é mapeado em emulador.
  - Os atalhos de emulador ficam atrás do **clique do touchpad**, que não existe nos consoles emulados.
  - Create/Select é botão de jogo e não serve de modificador (ADR 0012).

## Consequências

- Uma tela nova só precisa decidir o que cada ação faz. Teclado e controle vêm de graça.
- Botão novo = atualizar `gamepad.ts`, `dualsense.ts` e `keyboard.ts` juntos.
- Não acorda o PC da suspensão: isso depende do Bluetooth do Windows e não do app.
