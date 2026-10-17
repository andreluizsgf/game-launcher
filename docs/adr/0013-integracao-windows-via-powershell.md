# 0013 — Integração com o Windows via PowerShell/CLI, com stubs fora do Windows

- **Status:** aceita
- **Data:** 2026-10-10

## Contexto

O app precisa:

- listar processos com caminho do executável;
- matar árvores de processos;
- focar janelas de outros processos;
- enviar teclas;
- esperar instaladores terminarem;
- suspender, reiniciar e desligar o PC.

Addons nativos (ffi, node-window-manager…) complicam o build no CI e o rebuild para o ABI do Electron. Além
disso, o desenvolvimento é no Mac.

## Decisão

- Usar ferramentas do sistema via `execFile(..., { windowsHide: true })`:
  - **processos:** `Get-CimInstance Win32_Process`, `taskkill /T /F`;
  - **instaladores:** `Start-Process -Wait`;
  - **energia:** `shutdown`, e `SetSuspendState('Suspend')` (o `rundll32` hibernaria);
  - **foco e teclas:** `Add-Type` com P/Invoke de `user32` (`SetForegroundWindow`, `ShowWindow`, `keybd_event`)
    e `System.Windows.Forms.SendKeys`.
- Os scripts PowerShell ficam inline no módulo que os usa, com valores interpolados escapados (`'` → `''`).
- Todo caminho Windows-only checa `process.platform !== 'win32'` e devolve um stub: sessão simulada, lista
  vazia ou `Promise.resolve()`.

## Consequências

- Nenhuma dependência nativa além do SQLite.
- Cada chamada abre um PowerShell (~200–500 ms). É aceitável nos usos atuais (poll de 5 s, ações pontuais), mas
  evite em laços quentes.
- Esse comportamento só é verificável no PC real. Ao mexer nele, peça teste ao usuário.
