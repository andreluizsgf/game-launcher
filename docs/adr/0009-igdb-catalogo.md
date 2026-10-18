# 0009 — IGDB como catálogo e fonte de metadados

- **Status:** aceita
- **Data:** 2026-10-10

## Contexto

Pastas de jogos têm nomes de release ("Game.Name.v1.2-GROUP") e não trazem capa, resumo nem gênero. Queremos
também uma "loja" para descobrir jogos, uma wishlist e lançamentos aguardados. ROMs precisam de capa do console
certo.

## Decisão

- **IGDB** (Twitch OAuth client credentials) via `IgdbClient`. As credenciais são do usuário (Settings ou env),
  com o secret cifrado.
- **Busca:** por plataforma. O padrão é PC Windows; jogos emulados usam o `igdbPlatform` do sistema
  (`shared/systems.ts`).
- **Loja (`StoreService`):** seções montadas com consultas IGDB (populares, lançamentos, por gênero/tema), cache
  de 30 min. Os ids de gênero, tema e popularidade são resolvidos por nome a cada atualização, nunca fixos no
  código.
- **Arte:** baixada uma vez para `userData/art` (`cacheArt`) e servida via `media://`.
  - Capa em `cover_big_2x` (528×748), nítida no tile em foco.
  - Fundo: `pickWide` escolhe a maior artwork em paisagem (proporção ≥ 1,5). Se não houver, a maior screenshot
    em paisagem; só então qualquer imagem. A primeira artwork do IGDB costuma ser pôster em retrato ou logo.
  - O nome do arquivo inclui o `image_id`. Quando as regras mudam, `ART_VERSION` (em `library.ts`) é
    incrementado e a arte dos jogos ligados ao IGDB é baixada de novo em background, uma vez.
- **Vínculo automático** só quando o título casa (`titlesMatch`). O usuário corrige com "Identificar jogo"
  (`catalog:link`).
  - Se o vínculo aponta para uma entrada só de wishlist, ela é absorvida.
  - Se aponta para uma linha oculta (pasta antiga), as duas se reúnem.
- **Steam e Epic:** usam a arte das próprias lojas (CDN da Steam e imagens do catálogo Epic). Só os jogos Epic
  instalados consultam o IGDB, para pegar resumo e gêneros.
- **Limite de taxa** (4 req/s): a identificação em lote usa um pool de 2 a 6 tarefas.

## Consequências

- Sem credenciais IGDB o app funciona, mas sem metadados, sem loja e sem busca.
- `GL_STORE_MOCK=1` permite desenvolver a loja sem rede.
