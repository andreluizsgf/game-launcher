# 0010 — Downloads: bot do Telegram → qBittorrent; uma pasta por jogo

- **Status:** aceita
- **Data:** 2026-10-10

## Contexto

O usuário obtém os jogos por um bot do Telegram que responde com arquivos .torrent ou magnets. O fluxo manual
era copiar o título, mandar ao bot, baixar o .torrent, abrir no qBittorrent, escolher a pasta e esperar.

## Decisão

- **Telegram:**
  - `TelegramService` usa a biblioteca `telegram` (MTProto) com a **conta do usuário** (login por telefone,
    código e 2FA; sessão cifrada).
  - O bot é consultado só quando o usuário aperta o botão do Telegram num jogo. O modelo da mensagem é
    configurável (`{title}`).
  - As respostas aparecem num painel navegável com o controle (botões e comandos do bot).
- **qBittorrent:**
  - **Entrega:** pela linha de comando do qBittorrent (`--save-path=<pasta de jogos>/<título> --skip-dialog=true`).
    Uma instância já aberta recebe o torrent.
  - **Progresso:** `DownloadWatcher` consulta a **Web API** (a cada 2 s; 15 s se estiver offline) e associa cada
    torrent ao jogo pela subpasta (`gameFolderOf`) ou pelo título.
  - **Torrent concluído:** dispara rescan e toast.
- Quando o download começa, o jogo é adicionado à biblioteca a partir do IGDB, se ainda não estiver lá.
- **Desinstalar** remove os torrents da pasta do qBittorrent (sem apagar arquivos), para ele não ficar em erro de
  "arquivos ausentes", e depois manda a pasta para a Lixeira.

## Consequências

- O app depende do qBittorrent (exe detectado ou escolhido) e da Web UI dele ligada para mostrar progresso.
- A estrutura `<pasta de jogos>/<título>/<pasta do release>/…` explica a profundidade 4 do scanner.
- Repacks baixados chegam como instalador (ADR 0016).
- Integração com outros clientes de torrent exigiria abstrair `QbWebApi` e `addToQbittorrent`.
