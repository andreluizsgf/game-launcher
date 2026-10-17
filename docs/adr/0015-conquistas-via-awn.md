# 0015 — Conquistas lidas do Achievement Watcher Next (somente leitura)

- **Status:** aceita
- **Data:** 2026-10-10

## Contexto

Queremos mostrar conquistas como no PS5. Cada loja ou emulador tem um formato diferente, e o Achievement
Watcher Next (AWN) já resolve isso para Steam, Epic, GOG, Ubisoft e emuladores.

## Decisão

- Ler o snapshot do AWN (`cache/library_snapshot/library.json` na pasta de dados dele) e casar com o jogo pelo
  título (`AwnReader.forGame`).
- **Somente leitura.** O formato é interno ("format 2"). Qualquer coisa inesperada é tratada como "sem
  conquistas".

## Consequências

- Sem o AWN instalado, não há conquistas, e o app funciona normalmente.
- Se o AWN mudar o formato, só essa leitura quebra, sem erro visível.
- `GL_AWN_DIR` aponta para dados falsos em dev.
