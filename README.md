# Game Launcher

Launcher estilo console (PS5) para Windows. Junta numa tela só os jogos da sua pasta de jogos, da Steam e da Epic, e se controla inteiro pelo DualSense (ou teclado/mouse).

- Biblioteca com capas, ficha e tempo de jogo (catálogo do IGDB)
- Steam e Epic: jogos instalados e os da sua conta que não estão instalados
- Emuladores: PS3 (RPCS3), PS2 (PCSX2) e retrô (RetroArch) a partir de uma pasta de ROMs
- Busca de torrents pelo Telegram, download direto no qBittorrent pra pasta certa, com progresso no app
- Repacks (setup.exe): instala e depois apaga o instalador
- Overlay por cima do jogo (botão PS) pra voltar ao launcher ou fechar o jogo
- Conquistas (via Achievement Watcher Next)
- Suspender, reiniciar e desligar o PC pelo controle
- Atualiza sozinho

---

## 1. Instalar

1. Baixe o **`Game-Launcher-Setup-x.y.z.exe`** da [última release](https://github.com/andreluizsgf/game-launcher-releases/releases/latest).
2. Rode o instalador. O Windows pode avisar "O Windows protegeu o computador" (o app não é assinado): **Mais informações → Executar assim mesmo**.
3. Pronto. O app abre e passa a se atualizar sozinho: quando sai versão nova ele baixa em segundo plano e instala ao reiniciar (ou em **Configurações → Versão → verificar agora**).

> Existe também o `Game-Launcher-Portable-x.y.z.exe`, que roda sem instalar — mas **não se atualiza sozinho**. Prefira o instalador.

## 2. Primeira configuração

Tudo fica em **Configurações** (tecla `O` ou botão **OPTIONS**). Só o primeiro passo é obrigatório; o resto liga funções extras.

### Pasta de jogos (obrigatório)

**Configurações → Pasta de jogos** e escolha a pasta onde ficam seus jogos, ex.: `D:\Games`.

Cada subpasta direta é um jogo:

```
D:\Games\
  Hades\                 → "Hades"
  The Witcher 3\         → "The Witcher 3"
  Control [FitGirl]\     → repack: aparece com "Instalar"
```

O executável é achado sozinho (até 4 níveis de pasta). Jogos novos aparecem ao abrir o app, ao terminar um download ou em **Reescanear biblioteca**.

### Capas e fichas — IGDB (recomendado)

Sem isso os jogos aparecem só com as iniciais e a aba **Loja** fica vazia.

1. Entre em [dev.twitch.tv/console](https://dev.twitch.tv/console) com uma conta Twitch (precisa ter 2FA ligado).
2. **Register Your Application**: nome qualquer, OAuth Redirect URL `http://localhost`, categoria *Application Integration*, tipo *Confidential*.
3. Abra o app criado → copie o **Client ID** e gere um **Client Secret**.
4. No launcher: **IGDB Client ID** e **IGDB Client Secret** (dá pra colar com `Ctrl+V`).

Depois, no detalhe de cada jogo, **Identificar jogo** liga ele à ficha certa (capa, resumo, gêneros).

### Steam e Epic

- **Jogos instalados**: já vêm ligados. Dá pra desligar em **Biblioteca Steam** / **Biblioteca Epic Games**.
- **Jogos da conta que não estão instalados**:
  - **Epic**: **Conta Epic Games → Entrar** abre a página de login da própria Epic (use teclado/mouse; a senha não passa pelo app). Sem entrar, só aparece o que o launcher da Epic tem em cache — geralmente só parte da biblioteca.
  - **Steam**: precisa de uma Web API key. Gere em [steamcommunity.com/dev/apikey](https://steamcommunity.com/dev/apikey) (domínio: `localhost`) e cole em **Steam Web API key**. A conta usada é a última que entrou na Steam neste PC.

  Eles aparecem na prateleira **Na biblioteca** com o botão **Instalar na Steam/Epic**.

### Emuladores (opcional)

PS3 pelo **RPCS3**, PS2 pelo **PCSX2** e retrô (NES, SNES, N64, GB/GBC/GBA, DS, Mega Drive, Master System, Game Gear, PS1, PSP, Dreamcast, PC Engine, Arcade) pelo **RetroArch**.

1. Crie uma pasta de ROMs com **uma subpasta por console** e aponte em **Configurações → Pasta de ROMs**:
   ```
   D:\Roms\
     ps3\     → pastas de jogo (com PS3_GAME\ ou USRDIR\) ou .iso
     ps2\     → .iso, .chd, .cso…
     psx\     → .chd, .cue, .m3u…
     snes\    → .sfc, .smc, .zip
     gba\, n64\, megadrive\, nes\, psp\, nds\, dreamcast\, arcade\…
   ```
   Nomes aceitos também: `PS1`, `Mega Drive`, `Genesis`, `Super Nintendo`, `Game Boy Advance`… Uma pasta por jogo dentro do console também funciona.
2. Os emuladores são achados sozinhos nos lugares comuns (Arquivos de Programas, `C:\RetroArch-Win64`, ou uma pasta `Emuladores` ao lado da pasta de ROMs). Se não, aponte o `.exe` em **Configurações → RetroArch / PCSX2 / RPCS3**.
3. **RetroArch**: baixe os cores em *Online Updater → Core Downloader* (ex.: Snes9x, mGBA, Genesis Plus GX, SwanStation, Mupen64Plus-Next). O app avisa qual falta.
4. **RPCS3**: instale o firmware do PS3 nele uma vez. Jogos instalados dentro do RPCS3 (PSN/pkg) aparecem sozinhos.

No RetroArch o launcher já liga o driver de controle SDL2 (DualSense funciona por Bluetooth e cabo) e o analógico como direcional nos consoles sem analógico. Atalhos no controle, segurando o **touchpad** (clique; o Create é o Select dos jogos, por isso fica livre): **R1** salva estado, **L1** carrega, **R2** acelera (liga/desliga), **←/→** troca o slot, **Options** abre o menu do RetroArch. O botão **PS** durante o jogo abre o menu com *Salvar estado / Carregar estado / Acelerar / Fechar jogo*.

No PCSX2 o launcher liga o SDL com o modo aprimorado do DualSense e, se a porta 1 ainda não tiver controle mapeado, mapeia o DualSense sozinho (um mapeamento feito à mão é mantido). Os mesmos atalhos com o **touchpad** (R1 salva, L1 carrega, R2 acelera, ←/→ slot) e o menu do **PS** funcionam no PCSX2.

Os jogos ficam na prateleira **Emuladores**, com capa e ficha do IGDB do console certo. Jogar abre o emulador direto no jogo em tela cheia; tempo de jogo, overlay (botão PS) e "Fechar jogo" funcionam igual. Multi-disco: use um `.m3u` (aparece como um jogo só).

### Downloads — qBittorrent

1. Instale o [qBittorrent](https://www.qbittorrent.org/download).
2. No qBittorrent: **Ferramentas → Opções → Interface Web**:
   - marque **Interface Web (Controle remoto)** (porta padrão `8080`);
   - marque **Ignorar autenticação para clientes no localhost** — ou anote usuário e senha.
3. No launcher, se você não marcou o "ignorar autenticação": **qBittorrent usuário** e **qBittorrent senha**. A linha **qBittorrent Interface Web** mostra se conectou.
4. Se o launcher não achar o qBittorrent sozinho, aponte o `.exe` em **qBittorrent**.

Com isso os torrents vão direto pra `<pasta de jogos>\<nome do jogo>`, o progresso aparece no app e o jogo entra na biblioteca quando termina. Sem a Interface Web o app ainda abre o qBittorrent, mas sem progresso.

### Busca de torrents — Telegram (opcional)

Manda o nome do jogo pra um bot/canal do Telegram e mostra as respostas (links, torrents, comandos `/download…`) dentro do app.

1. Em [my.telegram.org](https://my.telegram.org) → **API development tools**, crie um app e copie **api_id** e **api_hash**.
2. No launcher: **Telegram API ID**, **Telegram API Hash**, **Telegram canal / bot** (`@usuario` ou link `t.me/...`).
3. **Telegram mensagem**: o texto enviado, `{title}` vira o nome do jogo (ex.: `/search {title}`).
4. **Telegram conta → Entrar**: telefone com DDI (`+55…`), depois o código que chega no Telegram (e a senha de 2 etapas, se tiver).

No detalhe de um jogo, botão **Telegram**. A mensagem só é enviada quando você aperta.

### Conquistas (opcional)

Instale o [Achievement Watcher Next](https://github.com/Shirowwww/Achievement-Watcher-Next) e deixe ele escanear seus jogos. O launcher lê o que ele encontrou e mostra **Conquistas · x/y** no detalhe do jogo. Nada a configurar.

### Abrir junto com o Windows

**Abrir ao ligar o PC** → o launcher abre em tela cheia no login. **Tela cheia** liga/desliga a tela cheia normal.

## 3. Controle

DualSense por **USB ou Bluetooth** (pareie pelo Windows: segure **PS + Create** até piscar → *Adicionar dispositivo Bluetooth*). Pode conectar com o app já aberto. Outros controles funcionam pelo modo padrão de gamepad.

| Ação | DualSense | Teclado |
|---|---|---|
| Mover | Direcional / analógico | Setas |
| Selecionar | ✕ | `Enter` |
| Voltar | ○ | `Esc` |
| Detalhes do jogo | △ | `T` |
| Adicionar jogo (busca) | □ | `S` |
| Configurações | OPTIONS | `O` |
| Trocar aba (Jogos / Loja) | L1 / R1 | `Q` / `E` |
| Trocar prateleira (Instalados / Emuladores / Na biblioteca…) | L2 / R2 | `Shift+Tab` / `Tab` |
| Voltar pro topo da lista | ○ | `Esc` |
| Overlay / menu de energia | PS | `Ctrl+Shift+G` (durante o jogo) |

O botão **PS**: com um jogo aberto, mostra o launcher por cima (dá pra voltar ao jogo ou fechá-lo); na tela inicial, abre o menu de energia (suspender, reiniciar, desligar, fechar o app); em outras telas, volta pro início.

## 4. Problemas comuns

| Sintoma | O que fazer |
|---|---|
| Jogo não aparece | Ele precisa estar numa subpasta direta da pasta de jogos. **Reescanear biblioteca**. |
| "Sem executável" | O exe está a mais de 4 pastas de profundidade, ou o nome parece de instalador/redist. |
| Download não aparece no app | Confira a Interface Web do qBittorrent (porta, usuário/senha). **qBittorrent Interface Web** em Configurações diz se conectou. |
| Repack instalou em outro lugar | Reinstale escolhendo `<pasta do jogo>\Jogo`, ou mova a pasta instalada pra dentro da pasta de jogos. |
| Controle conectado mas não mexe | Aperte qualquer botão; se continuar, desconecte e conecte de novo (o app procura o controle a cada 3 s). |
| ROM não aparece | A subpasta precisa ter o nome do console (`ps2`, `snes`, `gba`…) e a extensão ser de ROM daquele console. |
| Jogo da Steam/Epic não volta pro launcher ao fechar | Espere ~10 s; o app confere os processos a cada 5 s. |
| Não aparece atualização | **Configurações → Versão → verificar agora** mostra o erro, se houver. |

## 5. Desenvolvimento

Electron + React + TypeScript. Detalhes da stack, estrutura e fluxo de release: veja os comentários em `src/` e `.github/workflows/release.yml`.

```bash
npm ci                 # Node 22 (.nvmrc)
npm run dev            # app em modo dev
npm run dev:fixtures   # dev com uma pasta de jogos falsa
npm run typecheck
npm test               # testes unitários
npm run test:db        # testes do banco (rodam dentro do Electron)
```

**Release:** `npm version X.Y.Z --no-git-tag-version` → commit → `git tag vX.Y.Z` → push do commit e da tag. O CI (Windows) testa, gera instalador + portable e publica em [game-launcher-releases](https://github.com/andreluizsgf/game-launcher-releases); os apps instalados se atualizam sozinhos.
