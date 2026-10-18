# 0007 — Entregar a tela ao jogo; overlay é a própria janela do launcher

- **Status:** aceita
- **Data:** 2026-10-10

## Contexto

O launcher roda em tela cheia. Ao abrir um jogo, ele precisa sair da frente, e voltar quando o jogo fecha.
Queremos também um menu durante o jogo (botão PS) para fechar o jogo, salvar estado no emulador etc.

Desenhar dentro do jogo exigiria injeção (hook de DirectX/Vulkan), que é frágil e problemática com anti-cheat.

## Decisão

- **Ao abrir um jogo:** `getOutOfTheWay` sai da tela cheia e depois minimiza (o Windows ignora `minimize()` numa
  janela em tela cheia).
- **Ao fechar:** `bringToFront` restaura a janela e fica `alwaysOnTop` por 500 ms. É o jeito usual de contornar
  a proteção contra roubo de foco do Windows. Depois volta para a tela cheia.
- **Overlay = trazer o launcher por cima do jogo.** O renderer mostra o menu do jogo atual. Esconder o overlay
  minimiza o launcher de novo.
  - **Atalhos:** botão PS (lido em background via HID, ADR 0008) ou `Ctrl+Shift+G`, registrado só enquanto há
    jogo rodando.
  - **Jogos em tela cheia exclusiva** minimizam, como num Alt+Tab.
  - **Pausa (desde a v0.13.0):** o jogo continua lendo o controle em segundo plano, então o menu "jogava" junto.
    Por isso o menu pausa o jogo (configurável em `pauseOnOverlay`, ligado por padrão):
    - **jogos de PC:** o Runner suspende todos os processos da pasta vigiada (`NtSuspendProcess`, o mesmo que o
      "Suspender processo" do Monitor de Recursos) e os retoma ao fechar o menu, ao fechar o jogo ou ao sair do
      launcher;
    - **emuladores:** não são suspensos, porque o menu precisa deles rodando para salvar ou carregar estado.
      Eles se pausam sozinhos ao perder o foco (`pause_nonactive` no RetroArch, `PauseOnFocusLoss` no PCSX2), e
      as ações do menu devolvem o foco ao emulador antes de agir.
    - **riscos:** jogos online podem desconectar enquanto suspensos, e um anti-cheat pode não gostar. Por isso a
      pausa pode ser desligada.
- **Ao abrir emuladores:** `focusWindowOf(pid)` espera a janela principal e chama `SetForegroundWindow`, com o
  truque do Alt (`keybd_event`). Sem isso o RetroArch abre sem foco e pausado.
- **Instaladores de repack:** recebem a tela do mesmo jeito.

## Consequências

- Não há código dentro do jogo: funciona com qualquer jogo e não incomoda anti-cheat.
- Trocar de janela tem custo: alguns jogos perdem o modo de vídeo ou pausam ao perder o foco.
- Os emuladores usam tela cheia "windowed" (borderless) para sobreviver à ida e volta do overlay.
- Ações in-game de emulador precisam devolver o foco ao emulador antes de agir (PCSX2 via SendKeys) ou usar um
  canal que não depende de foco (comandos UDP do RetroArch). Ver ADR 0012.
