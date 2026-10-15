# 0008 — Genealogia como grafo de arestas e rastreio com WITH RECURSIVE

- **Status:** Aceito (2026-10-15)

## Contexto

Um lote embalado vem de um blend, que vem de dois torrados, que vêm de dois lotes verdes de fazendas diferentes. No recall é preciso responder em segundos: "de onde veio?" e "para quem foi?".

## Decisão

1. **Genealogia como lista de arestas** (`lot_origins`: filho, pai, quantidade consumida, ordem de produção). Só inclusão (trigger), como o razão de estoque.
2. **Produção executada de uma vez** (um POST, uma transação): consumo dos insumos, lote novo, movimentações e arestas — tudo ou nada. Travas nos lotes em ordem fixa (por id) evitam deadlock entre ordens concorrentes.
3. **Rastreio com `WITH RECURSIVE`** no Postgres, filtrado por empresa em cada nível, com proteção contra ciclos (`path`) e limite de profundidade.
4. **Rendimento em kg**: sacas convertidas (60 kg); embalagens/unidades fora do cálculo.

## Alternativas consideradas

- **Closure table** (todos os pares ancestral-descendente materializados): leitura O(1), mas escrita cara e difícil de manter imutável. Para o volume de uma pequena indústria, a recursão é rápida com os índices `(company_id, child_lot_id)` e `(company_id, parent_lot_id)`.
- **Banco de grafos**: exagero para o porte e mais uma peça na infraestrutura (custo na AWS).
- **Ordem com ciclo rascunho → concluída**: útil para planejamento, mas adiado; a execução imediata mantém a regra atômica e simples.

## Consequências

- O mesmo grafo serve ao rastreio para trás, para frente, à página pública e ao recall (Semana 4).
- Testes pendentes (adiados a pedido): grafo em diamante, limite de profundidade, isolamento por empresa nas consultas recursivas, produção concorrente sobre o mesmo insumo.
