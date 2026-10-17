# Architecture Decision Records

Cada ADR registra uma decisão estrutural: o contexto, o que foi decidido e o que isso implica.

- **Decisão nova:** crie `NNNN-titulo-curto.md` com o mesmo formato (Status, Data, Contexto, Decisão,
  Consequências).
- **Decisão que muda:** marque a antiga como `substituída por NNNN` em vez de reescrever a história.

| # | Decisão | Status |
|---|---|---|
| [0001](0001-electron-react-typescript.md) | Electron + React + TypeScript com electron-vite | aceita |
| [0002](0002-sqlite-migracoes.md) | SQLite (better-sqlite3) com migrações por `user_version` | aceita |
| [0003](0003-tabela-unica-de-jogos.md) | Uma tabela `games` para todas as origens; ocultar em vez de apagar | aceita |
| [0004](0004-ipc-tipado-result.md) | IPC tipado com envelope `Result<T>` | aceita |
| [0005](0005-configuracoes-e-segredos.md) | Configurações em JSON e segredos com safeStorage | aceita |
| [0006](0006-sessoes-por-processos-na-pasta.md) | Sessão de jogo = processos dentro da pasta vigiada | aceita |
| [0007](0007-janela-e-overlay.md) | Entregar a tela ao jogo; overlay é a janela do launcher | aceita |
| [0008](0008-input-e-dualsense.md) | Input por ações; DualSense via WebHID; PS reservado | aceita |
| [0009](0009-igdb-catalogo.md) | IGDB como catálogo e fonte de metadados | aceita |
| [0010](0010-downloads-telegram-qbittorrent.md) | Downloads: Telegram → qBittorrent; uma pasta por jogo | aceita |
| [0011](0011-steam-e-epic.md) | Steam e Epic sem APIs oficiais de launcher | aceita |
| [0012](0012-emuladores.md) | Emuladores externos, ROMs por sistema, config injetada | aceita |
| [0013](0013-integracao-windows-via-powershell.md) | Windows via PowerShell/CLI, stubs fora dele | aceita |
| [0014](0014-distribuicao-e-atualizacao.md) | Código privado, releases públicos, auto-update | aceita |
| [0015](0015-conquistas-via-awn.md) | Conquistas lidas do Achievement Watcher Next | aceita |
| [0016](0016-instalar-repacks.md) | Repacks: instalar em `Jogo` e limpar o instalador | aceita |
| [0017](0017-rejeitado-launcher-do-jogo.md) | Seletor de exe / launcher próprio do jogo | rejeitada |
