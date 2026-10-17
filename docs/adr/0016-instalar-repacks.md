# 0016 — Repacks: instalar em `<pasta do jogo>\Jogo` e limpar o instalador depois

- **Status:** aceita
- **Data:** 2026-10-12

## Contexto

Muitos downloads são repacks: a pasta traz um `setup.exe` e arquivos `.bin`, não o jogo. Sem tratamento, o
scanner escolheria o `setup.exe` como "o jogo".

## Decisão

- O `exePicker` detecta o instalador (`pickInstaller`: `setup.exe` ou `install.exe`) e o guarda em
  `installer_path`. Ele não vira o exe do jogo.
- **"Instalar"** roda o setup com `Start-Process -Wait`, apontando para `<pasta do jogo>\Jogo`. Para Inno Setup
  passa `/DIR="..."`, então o diálogo já vem preenchido. O launcher sai da frente e volta quando o setup fecha.
  Depois, rescan.
- **"Apagar instalador"**, só depois que o exe está dentro de `Jogo`:
  1. tira o torrent do qBittorrent;
  2. manda tudo, exceto `Jogo`, para a Lixeira.
- **Segurança:** só pastas diretamente dentro da pasta de jogos (`isDirectChild`).

## Consequências

- Não dá para garantir o destino se o usuário trocar a pasta no instalador. Nesse caso o launcher avisa que
  não achou o jogo.
- Lixeira, não exclusão definitiva: dá para desfazer.
