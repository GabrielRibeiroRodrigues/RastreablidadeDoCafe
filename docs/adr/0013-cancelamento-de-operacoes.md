# 0013 — Cancelamento de ordens e expedições; estornos fora do recall

- **Status:** Aceito (2026-10-19). Complementa o [ADR 0007](0007-razao-de-estoque.md) e o [ADR 0009](0009-recall-orquestrado.md).

## Contexto

A correção de qualquer lançamento era o estorno de cada movimentação, uma a uma (ADR 0007). Isso deixava três problemas:

1. **Estorno não era levado em conta fora do razão.** Um item de expedição estornado (devolução, cliente errado) continuava contando como entregue: o rastreio para frente marcava o cliente como "afetado" e o recall mandava contatá-lo e somava a quantidade em "já expedido".
2. **Ordem de produção desfeita pela metade.** Estornar só o consumo, ou só a produção, deixava a ordem, a genealogia e o rendimento contando algo que não aconteceu; estornar tudo à mão exigia abrir vários lotes.
3. **Nada indicava que uma expedição ou ordem tinha sido desfeita.** Painel e relatórios a contavam normalmente.

## Decisão

- **Cancelamento como operação de primeira classe**: `POST /production-orders/:id/cancel` e `POST /shipments/:id/cancel` (só admin, motivo obrigatório). Numa transação, estornam todas as movimentações ainda não estornadas da operação e gravam `cancelled_at`, `cancel_reason` e `cancelled_by_id` (migration aditiva, `CHECK` mantém os três juntos). Nada é apagado.
- **Travas**: a linha da operação é travada (`FOR UPDATE`; dois cancelamentos simultâneos → um 200, um 409 `already-cancelled`). Na ordem de produção, todos os lotes envolvidos são travados em ordem fixa antes dos estornos, e a produção é estornada primeiro: se o lote gerado já foi usado ou expedido, o razão recusa com saldo insuficiente e nada muda.
- **Estorno avulso** de uma movimentação que pertence a uma ordem de produção (a produção do lote gerado ou o consumo de um insumo dela) responde 409 `use-cancellation`. Itens de expedição continuam estornáveis um a um (devolução parcial).
- **Rastreio e recall**: cada expedição do rastreio para frente traz `reversed`. Itens estornados continuam listados (transparência), mas não tornam o cliente "afetado", nem entram nos totais do recall. Arestas de ordens canceladas trazem `productionOrder.cancelled` e continuam no grafo — o recall de um lote verde ainda alcança, de forma conservadora, um derivado de ordem cancelada (sem saldo).
- **Painel, desempenho e série de rendimento** ignoram operações canceladas. Os relatórios CSV ganham "Cancelada em" (produção) e "Estornado em" (expedição, por item).

## Consequências

- Corrigir uma ordem ou expedição lançada errada é um clique, com motivo e trilha de auditoria (`production_order.cancelled`, `shipment.cancelled`).
- O recall deixa de gerar contatos falsos por devoluções já registradas.
- Uma ordem cujo lote gerado já foi consumido não pode ser cancelada diretamente: é preciso cancelar antes o que o usou (de trás para frente na cadeia). Isso é intencional — mantém o razão coerente.
