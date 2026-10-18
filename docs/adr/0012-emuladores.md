# 0012 — Emuladores externos, pasta de ROMs por sistema e configuração injetada

- **Status:** aceita
- **Data:** 2026-10-14 (atalhos revistos em 2026-10-17)

## Contexto

O usuário joga PS3, PS2 e retro em geral, com as ROMs numa pasta separada. Quer abrir direto no jogo, em tela
cheia, com o DualSense funcionando, e ter salvar/carregar estado e acelerar pelo controle e pelo menu do PS,
sem configurar cada emulador à mão.

## Decisão

### Estrutura

- **Emuladores externos**, não embutidos: **RetroArch** (retro e PS1/PSP via cores), **PCSX2** (PS2) e
  **RPCS3** (PS3). O exe é detectado nos lugares comuns, inclusive numa pasta "Emuladores" ao lado da pasta de
  ROMs, ou escolhido em Settings.
- **Pasta de ROMs** com uma subpasta por sistema. A tabela `SYSTEMS` (`shared/systems.ts`) é a única fonte de
  verdade:
  - nomes de pasta aceitos;
  - extensões;
  - cores do RetroArch em ordem de preferência;
  - plataforma do IGDB.
- **Scan** (`emulators/scan.ts`):
  - agrupa discos (cue/bin, m3u);
  - lê jogos PS3 em pasta via `PARAM.SFO`, mais os jogos HG instalados no HDD do RPCS3;
  - `external_id = <sistema>:<caminho relativo em minúsculas>`.
- **Lançamento** (`launchArgs`): direto no jogo, em tela cheia, sem a UI do emulador. A pasta vigiada é a do
  emulador (ADR 0006).

### Configuração injetada a cada lançamento, sem sobrescrever a do usuário

- **RetroArch:**
  - Um arquivo de overrides no userData passado com `--appendconfig`: driver de controle **SDL2** (o único que lê
    o DualSense em todos os modos), analógico como direcional em sistemas digitais, tela cheia borderless e pausa ao perder o foco
    (`pause_nonactive`, para o menu do PS não jogar junto, ADR 0007).
  - Atalhos e comandos de rede UDP em `localhost:55355`.
- **PCSX2:**
  - Edição **idempotente** do `PCSX2.ini`. O caminho do INI depende do modo:
    - portable: `<pasta do exe>/inis`;
    - normal: `Documentos\PCSX2\inis`, com fallback em `%APPDATA%\PCSX2`.
  - Liga o SDL com o modo aprimorado do DualSense e a pausa ao perder o foco (`UI/PauseOnFocusLoss`).
  - Mapeia a porta 1 **só se ainda não houver controle mapeado**.
  - Acrescenta os atalhos, que aceitam múltiplos valores, sem duplicar.
  - Remove os atalhos antigos que o próprio launcher gravou.
- **RPCS3:** só `--no-gui --fullscreen`. Não há configuração injetada.

### Atalhos no controle (segurando o Create)

| Botão | Ação |
|---|---|
| R1 | salva estado |
| L1 | carrega estado |
| R2 | acelera |
| ←/→ | troca o slot |
| Options | menu do RetroArch |

Por que Create + touchpad como Select:

- O botão **PS** é do launcher (ADR 0008).
- Até a v0.12.0 o Create era o modificador **e** o Select do jogo. Como o Select é apertado o tempo todo em
  PS1/PS2, isso disparava ações sem querer.
- Na v0.12.1 os atalhos foram para o touchpad. O usuário preferiu o contrário: o **touchpad vira o Select** do
  jogo e o **Create fica só para os atalhos** (v0.12.2).
- **RetroArch:** `input_playerN_select_btn = "20"` (touchpad) e `input_enable_hotkey_btn = "4"` (Create).
- **PCSX2:**
  - `Pad1/Select = SDL-0/Touchpad`; um `Select = SDL-0/Back` deixado por versões anteriores é migrado;
  - os chords dos atalhos usam `SDL-0/Back &`.
- **RPCS3:** fica fora. O launcher não injeta configuração nele, então lá o Create continua sendo o Select.

### Menu in-game (botão PS)

O menu oferece *Salvar estado / Carregar estado / Acelerar / Fechar jogo*:

- **RetroArch:** comandos UDP (`SAVE_STATE`, `LOAD_STATE`, `FAST_FORWARD`…). Não dependem de foco.
- **PCSX2:** não tem interface de comando. O launcher devolve o foco à janela dele e envia as teclas que o INI
  liga às ações, via `SendKeys` (F1 salva, F3 carrega, Pause acelera).

## Consequências

- **Sistema novo:** uma linha em `SYSTEMS`.
- **Emulador novo:** `EmulatorId`, detecção, `launchArgs` e, se precisar, um módulo de configuração no molde do
  `pcsx2.ts` (receita no CLAUDE.md).
- Mudanças nos formatos de config dos emuladores podem quebrar a injeção. Por isso ela é tolerante: falha vira
  aviso no log e o jogo abre mesmo assim.
- Ainda **não validado em hardware real:**
  - a numeração SDL dos botões no RetroArch, incluindo o touchpad como Select;
  - os nomes de atalho e o SendKeys do PCSX2;
  - o `--fullscreen` do RPCS3.
- O launcher **não** baixa ROMs nem integra com sites de ROM. Ele trabalha com os arquivos que o usuário já tem.
