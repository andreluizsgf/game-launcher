# Arquitetura

## Processos

```
┌──────────────────────────── Electron ─────────────────────────────┐
│ main (Node)                                                        │
│   index.ts → settings, SQLite, Runner (sessions.ts), IPC, janela   │
│   ipc/index.ts monta os serviços:                                  │
│     Library ─ Catalog(IGDB) ─ GamesRepo(SQLite)                    │
│     DownloadWatcher(qBittorrent) ─ TelegramService                 │
│     EpicAccount ─ StoreService ─ Updater ─ AwnReader               │
│        ▲ invoke → Result<T>            │ send(evento)              │
│ preload: window.api (LauncherApi)      ▼                           │
│ renderer (React): App → telas; input → inputBus                    │
└────────────────────────────────────────────────────────────────────┘
          │ spawn / shell.openExternal / PowerShell
          ▼
  jogo .exe · steam:// · com.epicgames.launcher:// · RetroArch/PCSX2/RPCS3 · qBittorrent
```

- O **renderer** não acessa disco nem rede (exceto imagens `media://` e as do IGDB). Tudo passa por
  `window.api`. O contrato fica em `src/shared/types.ts` (`LauncherApi`).
- As chamadas renderer→main são `ipcRenderer.invoke` e devolvem `Result<T>`
  (`{ok:true,value} | {ok:false,error}`) (ADR 0004).
- Eventos main→renderer:

  | Evento | Quando |
  |---|---|
  | `library:changed` | a biblioteca mudou (texto opcional vira toast) |
  | `downloads:update` | progresso dos downloads |
  | `game:started` / `game:ended` | um jogo abriu / fechou |
  | `overlay:state` | o menu in-game abriu ou fechou |
  | `update:state` | estado da atualização automática |
  | `telegram:*` | mensagens e progresso do fluxo do Telegram |

- Capas locais são servidas por `media://local/<caminho codificado>` (protocolo registrado em `index.ts`).

## Modelo de dados

Uma tabela `games` para tudo (ADR 0003). O que distingue as linhas:

| campo | significado |
|---|---|
| `source` | `folder` (pasta de jogos), `steam`, `epic`, `emulator` |
| `folder` | onde está instalado; **NULL = não instalado** (wishlist do IGDB ou jogo da conta Steam/Epic) |
| `external_id` | appid Steam, AppName Epic, `<sistema>:<caminho relativo>` para ROM |
| `launch_uri` | protocolo da loja (Steam/Epic); jogos de pasta e ROMs não têm |
| `platform` | id do sistema emulado (`ps2`, `snes`…) |
| `igdb_id` | vínculo com o catálogo (capa, resumo, gêneros, data) |
| `installer_path` | repack ainda não instalado (`setup.exe` na pasta) |
| `hidden` | a pasta ou a loja não tem mais o jogo; a linha fica guardada (tempo de jogo, vínculo) |

`sessions` guarda cada partida; `total_seconds` e `last_played_at` ficam desnormalizados em `games`.
As configurações **não** estão no banco: ficam em `settings.json` no userData, com os segredos cifrados (ADR 0005).

## Rescan (`Library.rescan`)

Roda ao abrir o app, quando um download termina, quando o usuário pede e quando a janela recebe foco
(no máximo uma vez por minuto e nunca durante um jogo).

1. **Pasta de jogos.**
   - `scanRoot` olha cada subpasta direta (até 4 níveis de profundidade).
   - `exePicker` escolhe o exe por nome, tamanho e lista de bloqueio, ou detecta `setup.exe` de repack.
   - `repo.sync` mantém ids e tempo de jogo, oculta as pastas que sumiram e liga uma pasta movida à linha
     antiga pelo título.
2. **Lojas.**
   - Os instalados vêm dos manifests locais (Steam `appmanifest_*.acf`, Epic `Manifests/*.item`).
   - Os da conta vêm da Steam Web API (com a chave) e da Epic (logado pela conta, ou pelo `catcache.bin`).
   - `repo.syncPlatform(source, jogos, ownedKnown)`; a arte de linhas novas baixa em background.
3. **ROMs.**
   - `scanRoms` lê `<pasta de ROMs>/<sistema>/…` e o HDD do RPCS3.
   - `repo.syncPlatform('emulator', …)`; jogos novos são identificados no IGDB pela plataforma do console.

## Ciclo de vida de um jogo

```
Library.launch
  ├─ pasta: Runner.launch(game)                → spawn do exe
  ├─ loja:  Runner.launch(game)                → shell.openExternal(launch_uri)
  └─ ROM:   prepara o emulador (INI do PCSX2 / overrides do RetroArch)
            Runner.launch(game, {exe, args, watch: pasta do emulador})
Runner: onStart → sessão no DB, launcher minimiza, foco vai pro jogo
        a cada 5 s lista processos; "rodando" = algum processo com caminho dentro da pasta vigiada
        encerra após 2 leituras sem processos (há carência pro jogo aparecer na 1ª vez: 20 s; lojas 120 s)
        onEnd → fecha a sessão, launcher volta pra frente em tela cheia
Botão PS durante o jogo → overlay: a janela do launcher por cima do jogo (ADR 0007)
  emulador: abre direto o menu do jogo (salvar/carregar estado, acelerar, fechar)
"Fechar jogo" → taskkill /T /F em todo processo da pasta vigiada
```

## Downloads

```
Busca (IGDB) → "Baixar" → TelegramService manda o título ao bot configurado
  → respostas/botões aparecem no painel → .torrent/magnet chega
  → addToQbittorrent(exe, torrent, <pasta de jogos>/<título>)   (CLI, sem diálogo)
  → DownloadWatcher consulta a Web API do qBittorrent a cada 2 s → progresso no tile
  → terminou → rescan → jogo instalado (ou repack com "Instalar")
```

## Renderer

- **Navegação por estado, sem router.** `tab` (`games`/`store`) mais um `overlay` (`detail`, `settings`,
  `search`, `storeDetail`, `power`) em `App.tsx`.
- **Home.**
  - A prateleira "Instalados" é a fileira horizontal estilo PS5.
  - As outras (Emuladores, Na biblioteca, Aguardados…) usam `LibraryGrid`, com filtros (`library/gridFilter.ts`).
  - L2/R2 (ou Tab) trocam de prateleira em qualquer lugar.
- **Input.**
  - `gamepad.ts` (Gamepad API, ou HID para DualSense) e `keyboard.ts` emitem `Action`s no `inputBus`.
  - Só o handler ativo mais recente (pilha) recebe as ações.
  - Com um jogo em foco, o pad não move o launcher; só o PS é observado (ADR 0008).
- **Hooks em `app/`.** `useLibrary` (lista e foco), `useGameSession` (jogo rodando, overlay),
  `useSystemStatus` (downloads, update, disco), `useInputDevices` (pad e botão PS), `useToast`.

## Testes

- `npm test`: Vitest para a lógica pura (parsers de manifest/VDF/SFO, regras de exe, scan de ROMs, filtros,
  argumentos de emulador, edição de INI, parse do Telegram, match de downloads).
- `npm run test:db`: `GamesRepo` com SQLite real, rodando dentro do Electron (ADR 0002).
- O CI roda typecheck, os dois conjuntos de teste e o build em cada tag.
