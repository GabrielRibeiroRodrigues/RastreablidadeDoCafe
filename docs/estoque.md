# Lotes e estoque (API)

Decisão: [ADR 0007](adr/0007-razao-de-estoque.md). Código: `apps/api/src/modules/inventory/`.

## Conceitos

- **Lote**: unidade rastreável (`CAF-2026-000123`). Nasce no recebimento (e, na Semana 3, na produção). Guarda produto, fornecedor, validade, quantidade original e os dados de qualidade do café.
- **Razão de estoque**: toda entrada, saída e transferência é uma linha imutável. O saldo é **calculado** do razão.
- **Estorno**: a única forma de corrigir — nova linha com origem e destino invertidos.

```mermaid
flowchart LR
  R[POST /receipts] -->|cria lote + RECEIPT| L[(lots)]
  R --> M[(stock_movements)]
  MV[POST /movements<br/>ISSUE · TRANSFER · ADJUSTMENT · CONSUMPTION] --> M
  RV[POST /movements/:id/reverse] -->|REVERSAL| M
  M -->|Σ entradas − Σ saídas| S[GET /stock<br/>GET /lots/:id]
```

## Rotas

| Método e rota                    | Perfis                                                | Descrição                                                                                                      |
| -------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `POST /v1/receipts`              | admin, operador                                       | Recebimento: cria o lote (código automático) e a entrada. Aceita `Idempotency-Key`                             |
| `GET /v1/lots`                   | todos                                                 | Lista com saldo total. Filtros: `q` (código), `productId`, `supplierId`, `status`, `expiresWithinDays`; `sort` |
| `GET /v1/lots/:id`               | todos                                                 | Detalhe com saldo por local                                                                                    |
| `PATCH /v1/lots/:id`             | admin, operador                                       | Corrige validade e dados de qualidade (código, produto e quantidade não mudam)                                 |
| `PATCH /v1/lots/:id/status`      | quarentena: admin, operador · bloquear/liberar: admin | `{ status, reason }`; `CONSUMED` é automático                                                                  |
| `POST /v1/movements`             | admin, operador (ajuste: só admin)                    | `ISSUE`, `TRANSFER`, `ADJUSTMENT` (motivo obrigatório), `CONSUMPTION`. Aceita `Idempotency-Key`                |
| `POST /v1/movements/:id/reverse` | admin                                                 | Estorno `{ reason }`                                                                                           |
| `GET /v1/movements`              | todos                                                 | Histórico. Filtros: `lotId`, `locationId`, `type`, `from`, `to`                                                |
| `GET /v1/stock`                  | todos                                                 | Posição: saldo por lote e local. Filtros: `productId`, `locationId`, `lotStatus`, `q`                          |

## Inventário (contagem física)

Contagem por local; as diferenças viram ajustes ao aplicar ([ADR 0015](adr/0015-inventario-contagem-fisica.md)).

| Método e rota                                | Perfis          | Descrição                                                                                                                             |
| -------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /v1/inventory-counts`                  | admin, operador | `{ locationId, notes? }`: abre com os lotes que têm saldo no local. Uma aberta por local (409 `/problems/inventory-count-open`)       |
| `GET /v1/inventory-counts`                   | todos           | Lista. Filtros: `status`, `locationId`                                                                                                |
| `GET /v1/inventory-counts/:id`               | todos           | Detalhe com itens: saldo na abertura, saldo atual (ou na aplicação), contado e diferença                                              |
| `PUT /v1/inventory-counts/:id/items/:itemId` | admin, operador | `{ countedQuantity }` (aceita `"0"`)                                                                                                  |
| `POST /v1/inventory-counts/:id/items`        | admin, operador | `{ lotId, countedQuantity }`: lote achado no local que não estava na lista                                                            |
| `POST /v1/inventory-counts/:id/apply`        | admin           | Lança um `ADJUSTMENT` por diferença (documento = número da contagem). Exige tudo contado (409 `/problems/inventory-count-incomplete`) |
| `POST /v1/inventory-counts/:id/cancel`       | admin           | `{ reason }`; nada é lançado                                                                                                          |

Contagem aplicada ou cancelada não muda (409 `/problems/inventory-count-closed`). A diferença usa o saldo do momento da aplicação, então movimentações feitas durante a contagem não viram diferença.

## Direção de cada tipo

| Tipo          |         Origem         | Destino | Uso                                             |
| ------------- | :--------------------: | :-----: | ----------------------------------------------- |
| `RECEIPT`     |           —            |    ✔    | Recebimento de fornecedor                       |
| `ISSUE`       |           ✔            |    —    | Venda/expedição                                 |
| `TRANSFER`    |           ✔            |    ✔    | Mudança de local                                |
| `ADJUSTMENT`  |      um dos dois       |         | Perda (origem) ou sobra (destino) de inventário |
| `CONSUMPTION` |           ✔            |    —    | Consumo em produção                             |
| `PRODUCTION`  |           —            |    ✔    | Lote produzido (Semana 3)                       |
| `REVERSAL`    | invertidos da original |         | Estorno                                         |

## Regras

- Quantidades: string decimal positiva com até 3 casas (`"60"`, `"1250.500"`), na unidade do produto.
- **Saldo insuficiente** → `409 /problems/insufficient-stock` com `available`, `requested` e `location`.
- **Lote em quarentena ou bloqueado** não sai nem é transferido → `409 /problems/lot-not-movable` (exceção: lote em quarentena indo para um local do tipo quarentena).
- Recebimento num local de quarentena cria o lote já em `QUARANTINE`.
- Saldo total zerado → `CONSUMED`; estorno que repõe saldo → `AVAILABLE`.
- Estorno: uma vez por movimentação; estorno de estorno é proibido; precisa haver saldo no local de onde sai. Produção e consumo de uma ordem só se desfazem cancelando a ordem (409 `/problems/use-cancellation`).
- **Datas**: `receivedAt`/`occurredAt`/`performedAt`/`shippedAt` não podem estar no futuro (5 min de folga; 400 no campo) e nenhuma movimentação pode ser anterior ao recebimento ou à produção do lote (400 `/problems/invalid-movement`, extensão `lot`). Recebimento retroativo (carga de histórico) continua aceito.
- **Códigos** (`CAF-2026-…`, `OP-`, `EXP-`…): o ano é o do calendário de São Paulo, não o de UTC.
- **Idempotência**: repetir com a mesma `Idempotency-Key` devolve o resultado original e o header `Idempotent-Replayed: true`; mesma chave com outro corpo → `422 /problems/idempotency-key-reused`.
- Produto ou destino inativo → 409. Lote, local ou fornecedor de outra empresa → 404.

## Garantias no banco

- Trigger `stock_movements_no_update_delete`: `UPDATE`/`DELETE` em `stock_movements` falham para qualquer cliente.
- `CHECK`: quantidade > 0, origem ou destino presente, origem ≠ destino, faixas de peneira/umidade/pontuação.
- FKs compostas `(company_id, …)`: lote → produto, movimentação → lote e usuário, anexo → lote.

## Exemplo

```bash
curl -X POST localhost:3000/v1/receipts -H "Authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -H 'Idempotency-Key: nf-004512' \
  -d '{"productId":"…","supplierId":"…","locationId":"…","quantity":"60",
       "harvest":"2025/26","variety":"Bourbon Amarelo","cuppingScore":86.25,
       "moisturePercent":11.5,"expiresAt":"2027-06-30","documentRef":"NF 004512"}'
```
