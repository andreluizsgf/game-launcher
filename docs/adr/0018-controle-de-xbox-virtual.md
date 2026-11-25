# 0018 — DualSense como Xbox 360 virtual via ViGEmBus, por jogo

- **Status:** aceita
- **Data:** 2026-11-25

## Contexto

Alguns jogos de PC (ex.: Hi-Fi Rush) só leem XInput: o DualSense não funciona neles. A saída comum é o
DS4Windows, mais um programa pra instalar e deixar aberto. Nenhum app cria um controle de Xbox sozinho no
Windows: isso exige um driver de barramento. O de fato padrão é o **ViGEmBus** (é o que o DS4Windows usa).
O projeto foi arquivado pelo autor em 2023, mas o driver segue funcionando e é amplamente instalado.

## Decisão

- **Por jogo, não global.** `games.input_mode = 'xinput'` (coluna que já existia) liga o pad virtual. Num jogo
  que aceita os dois controles, o input chegaria em dobro, e esconder o DualSense exigiria outro driver
  (HidHide). Ligado só onde precisa, nenhum dos dois problemas aparece.
- **Driver via FFI, sem compilar.** `main/vpad/vigem.ts` fala com o ViGEmBus por `DeviceIoControl` usando o
  **koffi** (binários prontos), reproduzindo o protocolo do ViGEmClient (`BusShared.h`): achar a interface
  (`CM_Get_Device_Interface_ListW`), `CHECK_VERSION`, `PLUGIN_TARGET` + `WAIT_DEVICE_READY` (assíncronos, numa
  thread do koffi) e `XUSB_SUBMIT_REPORT` a cada relatório. O addon `vigemclient` do npm foi descartado: compila
  com node-gyp na instalação, o que quebra o `npm install` no Mac e pesa no CI.
- **Quem lê o DualSense é o renderer**, pelo mesmo WebHID de sempre (ADR 0008), que já recebe relatórios com o
  jogo em foco. `input/virtualPad.ts` mapeia para XUSB (`shared/xusb.ts`, testado) e manda por IPC
  fire-and-forget, só quando muda. Evita abrir o HID duas vezes e duplicar o parser no main.
- **Ciclo de vida:** o pad é plugado em `onStart` da sessão e removido em `onEnd`; mudar o toggle com o jogo
  aberto aplica na hora. O XInput é hot-plug, então plugar depois do lançamento basta. Se o processo cair, o bus
  remove os pads do handle fechado.
- **Botões:** Create → Back, Options → Start, L2/R2 analógicos. O **PS não é mapeado** (Guide): continua do
  launcher. Com o launcher em foco (menu do PS) o pad virtual recebe estado neutro.
- O próprio launcher ignora o Xbox virtual: com um pad Sony presente, os outros não contam (ADR 0008).

## Consequências

- O usuário instala o ViGEmBus uma vez (instruções no README). Sem ele, lançar o jogo mostra um aviso e o jogo
  abre normalmente.
- Sem vibração por enquanto: exigiria `XUSB_REQUEST_NOTIFICATION` pendente num segundo handle e um relatório de
  saída pro DualSense.
- Só o caminho WebHID alimenta o pad. Se o DualSense só aparecer pela Gamepad API, nada é repassado (e repassar
  de lá arriscaria realimentar o próprio Xbox virtual).
- Não validado em hardware no desenvolvimento (Mac); fora do Windows o pad é um no-op.
