# 0006 — Sessão de jogo = processos rodando dentro da pasta vigiada

- **Status:** aceita
- **Data:** 2026-10-10 (ajustada em 2026-10-11 e 2026-10-14)

## Contexto

O PID do processo iniciado raramente é o jogo:

- launchers próprios e stubs abrem o exe real e saem;
- jogos da Steam e da Epic são abertos pela loja via protocolo (DRM, saves na nuvem, atualizações);
- emuladores podem abrir processos filhos.

Mesmo assim, precisamos saber quando o jogo começou e terminou, para contar o tempo de jogo e devolver a tela
ao launcher.

## Decisão

- `Runner` (`src/main/library/runner.ts`) define uma **pasta vigiada**:
  - a pasta do jogo;
  - para ROMs, a pasta do emulador (`LaunchSpec.watch`).
- A cada 5 s ele lista os processos (`Get-CimInstance Win32_Process`). O jogo está rodando se algum processo
  tem executável dentro dessa pasta.
- A lógica de estado é pura e testada (`nextWatch`):
  - carência até o jogo aparecer pela primeira vez: 20 s, ou 120 s para lojas, que podem atualizar antes;
  - depois de visto, a sessão termina após **2 leituras seguidas** sem processos (cobre a troca
    launcher → jogo).
- Jogos de loja são abertos com `shell.openExternal(launch_uri)`. Os demais com `spawn` destacado.
- "Fechar jogo" faz `taskkill /T /F` em todos os processos da pasta vigiada. Jogos costumam ignorar o pedido
  educado de fechar.
- Um jogo por vez.

## Consequências

- Funciona com qualquer launcher intermediário sem configuração por jogo.
- Leva até ~10 s para perceber que o jogo fechou.
- Um processo residente na pasta (ex.: anti-cheat que não sai) mantém a sessão aberta. Se acontecer, trate como
  exceção por jogo.
- Ferramentas da mesma pasta abertas por fora também contam como jogo.
- No Mac a sessão é simulada (`GL_STUB_SECONDS`).
