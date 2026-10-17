# 0003 — Uma tabela `games` para todas as origens; ocultar em vez de apagar

- **Status:** aceita
- **Data:** 2026-10-11 (origens Steam/Epic), 2026-10-14 (emuladores)

## Contexto

Os jogos vêm de:

- uma pasta de jogos;
- da Steam e da Epic (instalados ou só comprados);
- de ROMs;
- do catálogo do IGDB (wishlist, "Aguardados").

A UI trata todos do mesmo jeito: capa, detalhes, jogar, tempo de jogo. Pastas são movidas e renomeadas, e
lojas instalam e desinstalam por fora.

## Decisão

- Uma só tabela, com `source` (`folder` | `steam` | `epic` | `emulator`) e `external_id` (único por source).
- `folder IS NULL` significa **não instalado**: entrada de catálogo ou jogo da conta.
- Sincronização incremental por origem:
  - **pasta:** `sync`, chaveado pelo caminho da pasta;
  - **lojas e ROMs:** `syncPlatform`, chaveado pelo `external_id`.
- O que sumiu é **ocultado** (`hidden = 1`), não apagado. Se voltar, volta com tempo de jogo, sessões e vínculo
  com o IGDB.
- Pasta movida ou renomeada: uma pasta nova com o mesmo título de uma linha cuja pasta sumiu **é a mesma**
  (`titlesMatch`). A linha é realocada.
- Uma pasta nova que bate com uma entrada de catálogo não instalada **instala** essa entrada, em vez de criar
  outra.
- `syncPlatform(..., ownedKnown=false)`: quando a lista da conta falhou (sem rede, token expirado), os jogos só
  da conta **não** são ocultados.
- Uma pasta que pertence a uma loja (a mesma pasta do manifest Steam/Epic) é ignorada pelo scan da pasta de
  jogos, para não duplicar.

## Consequências

- Nova origem não precisa de migração: é um valor novo de `source` mais um módulo que produz `PlatformGame[]`
  (ver ADR 0011 e a receita no CLAUDE.md).
- Consultas da UI filtram `hidden = 0`. A ordenação padrão é: instalados primeiro, por último jogado.
- Casar por título é heurístico (`titleKeys`: nome inteiro e nome sem subtítulo, nunca prefixo, para "Hades"
  não casar com "Hades II"). Quando erra, o usuário corrige com "Identificar jogo".
