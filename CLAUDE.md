# Game Launcher — guia para agentes

Launcher estilo PS5 para Windows (Electron + React + TypeScript), feito para ser usado no sofá com DualSense.
Desenvolvido no Mac; o comportamento específico do Windows tem stub no macOS/Linux.

- Visão geral da arquitetura: [docs/architecture.md](docs/architecture.md)
- Decisões e o porquê delas: [docs/adr/](docs/adr/README.md). Leia a ADR da área antes de mudar algo estrutural.
- Manual do usuário (instalação, configuração, controles): [README.md](README.md)

## Comandos

```bash
npm run dev                 # app em modo dev (hot reload do renderer)
npm run dev:fixtures        # dev com uma pasta de jogos falsa (fixtures/, gitignored)
npm run typecheck           # tsc dos dois projetos (node + web)
npm test                    # vitest (unitários, sem SQLite)
npm run test:db             # testes *.db.test.ts dentro do Electron (better-sqlite3 é compilado pra ele)
npm run build:win           # pacote Windows local (normalmente quem empacota é o CI)
```

Variáveis de dev: `GL_GAMES_ROOT`, `GL_ROMS_ROOT` (pastas quando não configuradas), `GL_STUB_SECONDS` (duração
da sessão falsa no Mac), `GL_STORE_MOCK=1` (loja sem IGDB), `GL_AWN_DIR` (dados falsos do Achievement Watcher),
`IGDB_CLIENT_ID`/`IGDB_CLIENT_SECRET`, `GL_SNAPSHOT=<dir>` (screenshots roteirizados, ver
`src/main/devSnapshot.ts`; edite os passos pra checar uma tela e restaure o arquivo com `git checkout` depois).

Antes de dar a tarefa como pronta: `npm run typecheck && npm test` (e `npm run test:db` se mexeu em `src/main/db`).

## Mapa do código

```
src/shared/      tipos e lógica pura usados pelos dois lados (types.ts = contrato IPC, systems.ts, titleKey.ts)
src/preload/     window.api: uma linha por canal IPC (implementa LauncherApi)
src/main/        processo principal (Node): tudo que toca disco, rede, processos, Windows
  index.ts         bootstrap: settings, DB, sessões, IPC, janela
  ipc/             registro dos canais; index.ts monta os serviços e liga uns nos outros
  db/              schema.ts (migrações), games.ts (GamesRepo: toda SQL fica aqui)
  library/         Library (rescan, launch, install, uninstall), Runner (sessões), scanner, exePicker, Catalog
  platforms/       Steam e Epic (instalados, biblioteca da conta, login Epic)
  emulators/       ROMs (scan), argumentos de lançamento, config do RetroArch/PCSX2, comandos in-game
  catalog/         IGDB (busca, loja, arte)
  downloads/       qBittorrent Web API e watcher de progresso
  telegram/        bot do Telegram → .torrent → qBittorrent
  achievements/    leitura do Achievement Watcher Next
  system/          energia (suspender/reiniciar/desligar)
  sessions.ts      hooks do Runner: playtime, entregar a tela ao jogo, overlay
  window.ts        janela, WebHID do DualSense, minimizar/trazer pra frente
src/renderer/src/ React
  App.tsx          roteamento por estado (tab + overlay), handlers de alto nível
  app/             hooks de estado (biblioteca, sessão de jogo, status, input)
  screens/         telas (Home, LibraryGrid, GameDetail, Settings, Store, Search…)
  input/           barramento de ações, gamepad, DualSense via HID, teclado
  library/         lógica pura de prateleiras e filtros (testada)
```

## Convenções

- **Estilo:** aspas simples, sem ponto e vírgula, largura 120, 2 espaços. **Não rode o prettier**: ele não pega
  essa config e reformata o arquivo inteiro (aspas duplas, ponto e vírgula). Edite à mão e confira as linhas longas.
- **Idiomas:** código, comentários e commits em inglês; tudo que o usuário vê (UI, erros, README) em português.
- **Comentários:** explicam o porquê (quirk do Windows, formato de arquivo, limite de API), não o quê. JSDoc curto
  em exports.
- **Erros pro usuário:** `throw new Error('mensagem em português')` dentro de um handler `handle(...)`; chega
  ao renderer como `{ ok: false, error }` e vira toast. Não faça `try/catch` só pra relançar.
- **Lógica pura separada de I/O:** parsers e regras em funções exportadas e testadas (ex.: `parseAppManifest`,
  `applyPcsx2Settings`, `launchArgs`, `applyFilter`); a classe só orquestra.
- **Windows:** use PowerShell/CLI via `execFile` com `windowsHide: true` (ADR 0013). Todo caminho Windows-only
  precisa de `if (process.platform !== 'win32')` com stub ou retorno vazio, pra o dev no Mac funcionar.
- **Segredos:** nunca em texto puro. Campo `xxxEnc` em `StoredSettings` + `encrypt`/`decrypt` (safeStorage). O
  renderer só recebe `hasXxx: boolean` (ADR 0005).
- **Testes:** `*.test.ts` ao lado do arquivo. Testes que precisam do SQLite são `*.db.test.ts`.

## Receitas

### Novo canal IPC
1. Tipo em `LauncherApi` (`src/shared/types.ts`).
2. Linha em `src/preload/index.ts` (`ipcRenderer.invoke('area:acao', ...)`).
3. Handler no `src/main/ipc/<area>.ts` com `handle('area:acao', fn)` (retorna `Result<T>`). Use `ipcMain.handle`
   direto só pra leituras que nunca falham (`library:list`).
4. Eventos main→renderer: `send(channel, payload)` no `ipc/index.ts` e um `on(...)` no preload.

### Nova configuração
1. Campo em `StoredSettings` + `DEFAULTS` (`src/main/settings.ts`). Segredo: `xxxEnc` e canal próprio `settings:setXxx`.
2. Versão pública em `Settings` (`shared/types.ts`) e `publicSettings`.
3. Item na tela `Settings.tsx` e, se o usuário precisar fazer algo, uma seção no README (e no README do repo de releases).

### Mudança no banco
Acrescente uma string ao fim de `MIGRATIONS` em `src/main/db/schema.ts` (nunca edite uma migração antiga).
Atualize `GameRow`, `toGame` e o tipo `Game`. Teste em `games.db.test.ts`.

### Nova loja/plataforma (ex.: GOG, Xbox, Ubisoft)
Siga o formato de `platforms/steam.ts` e `platforms/epic.ts` (ADR 0011):
1. Um módulo que devolve `PlatformGame[]` (instalados com `folder`/`exePath`; os da conta com `folder: null`).
   `launchUri` = protocolo da loja (o Runner abre o URI e acompanha os processos pela pasta).
2. Acrescente o valor em `GameSource` (`shared/types.ts`). Não precisa de migração: `source` é TEXT.
3. Em `Library.syncPlatforms`: `repo.syncPlatform('<fonte>', merge(instalados, conta), contaConhecida)`.
   Passe `ownedKnown=false` quando a lista da conta falhou, senão os jogos dela somem.
4. Arte: baixe em background (`fetchArt`) e salve com `repo.setArt`.
5. Desinstalar: decida em `Library.uninstall` (abrir a loja ou recusar). Dê um nome à origem em `SOURCE_NAME`
   (`renderer/src/library/gridFilter.ts`): é o que aparece no filtro "Origem" do grid.
6. Toggle e credenciais em Settings (receita acima), testes dos parsers com fixtures em string.

### Novo sistema emulado ou emulador (ADR 0012)
- **Sistema usando um emulador existente:** uma entrada em `SYSTEMS` (`src/shared/systems.ts`) com `id`, nomes de
  pasta aceitos, extensões, `cores` do RetroArch e `igdbPlatform`. O scan, o lançamento e a busca no IGDB
  saem disso.
- **Emulador novo:** acrescente em `EmulatorId`/`EMULATOR_NAME`, `EXE`/`FOLDER` (`emulators/launch.ts`), um `case`
  em `launchArgs` (abrir direto no jogo, tela cheia, sem UI) e o seletor em Settings.
  - Se ele precisar de configuração (controle, atalhos), crie `emulators/<nome>.ts` e aplique antes de lançar.
    Faça como o PCSX2: editar o INI de forma idempotente e preservar o que o usuário configurou.
  - Ações in-game (salvar/carregar estado, acelerar) entram em `Library.emulatorAction` e na lista do
    `GameDetail`.
- **Botões reservados:** o **PS** é do launcher e abre o menu in-game. Os atalhos de emulador ficam atrás do
  **Create** (`SDL-0/Back`, botão SDL 4). O Select do jogo vai para o **clique do touchpad** (`SDL-0/Touchpad`,
  botão SDL 20), para segurar o Create nunca chegar ao jogo.

### Nova tela ou input
- Uma tela recebe input com `useInput(handler, active)`. Só o handler ativo mais recente recebe as ações (pilha).
- Ações disponíveis em `input/actions.ts`. Para mapear um botão novo, mexa em `gamepad.ts` (Gamepad API padrão),
  `dualsense.ts` (HID) e `keyboard.ts` (atalho de teclado equivalente). Mantenha os três em sincronia.
- Tudo precisa ser navegável só com o controle. O mouse é secundário.

## Mudanças visuais: validar localmente antes de subir

**Regra:** nada que mude a aparência (CSS, layout, telas, componentes, arte) vai para commit, tag ou release antes
de o usuário aprovar rodando localmente. Cada release custa um build no CI, e a validação no PC só acontece
depois da atualização automática; errar no visual custa um ciclo inteiro.

1. Implemente e rode `npm run typecheck && npm test`.
2. Abra o app para o usuário validar: `npm run dev` (ou `npm run dev:fixtures` se a biblioteca local não tiver o
   caso). Para telas difíceis de alcançar, gere screenshots com `GL_SNAPSHOT` (ver Comandos) e mostre-os.
   Teste também em janela pequena (1280×720), que é como o PC com escala de 150% enxerga a tela.
3. Diga o que mudou e onde olhar. **Espere o OK explícito** antes de commitar e soltar a versão.
4. Ajustes pedidos voltam ao passo 2.

Mudanças sem efeito visual (lógica, integrações, docs) seguem direto para o release.

## Release

Só quando o usuário pedir. Mudança visual só depois da validação local (seção acima).

1. `npm version X.Y.Z --no-git-tag-version`
2. Commit (terminando com a linha `Co-Authored-By` indicada pelo ambiente).
3. `git tag vX.Y.Z` e `git push`, depois `git push origin vX.Y.Z`.

O CI (`.github/workflows/release.yml`, windows-2022) testa, empacota e publica no repo **público**
`andreluizsgf/game-launcher-releases`. O app instalado se atualiza sozinho (ADR 0014). Não espere o CI terminar.

Se mudar algo que o usuário precisa saber, atualize o `README.md` e também o README do repo de releases. Este
último é uma cópia sem a seção "Desenvolvimento" e é enviado com `gh api -X PUT
repos/andreluizsgf/game-launcher-releases/contents/README.md`, passando o `sha` atual.

## Cuidados

- Este repositório é **público** (desde 2026-10-17; Actions sem custo). Nunca commite segredos, tokens nem dados
  pessoais: tudo sensível fica cifrado no settings.json do usuário (ADR 0005).
- Muita coisa só existe no Windows e **não foi validada em hardware real** por quem desenvolve no Mac:
  - foco de janela;
  - atalhos do RetroArch e do PCSX2 e o SendKeys;
  - o RPCS3;
  - o OAuth da Epic.

  Ao mexer nisso, diga ao usuário o que precisa ser testado no PC.
- Desinstalar só move para a Lixeira e só pastas que estão **diretamente** dentro da pasta de jogos
  (`isDirectChild`). Não afrouxe essa checagem.
- Um jogo cuja pasta sumiu fica **oculto** (`hidden = 1`), não é apagado: mantém tempo de jogo e vínculo com o
  IGDB caso volte (ADR 0003).
- Rejeitado pelo usuário: seletor de exe / automação do launcher próprio do jogo (ADR 0017). Não reintroduza sem
  pedido.
