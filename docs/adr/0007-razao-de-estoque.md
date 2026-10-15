# 0007 — Razão de estoque imutável com saldo calculado e trava por lote

- **Status:** Aceito (2026-10-15)

## Contexto

Rastreabilidade exige histórico confiável: cada quilo que entrou, saiu ou mudou de lugar precisa estar registrado, e o saldo nunca pode ficar negativo — inclusive com requisições simultâneas (dois operadores dando saída no mesmo lote).

## Decisão

1. **Razão (ledger) só de inclusão** em `stock_movements`: cada linha tem origem e/ou destino e uma quantidade positiva. Saldo de um lote num local = Σ(entradas no local) − Σ(saídas do local).
2. **Imutabilidade em duas camadas**: trigger `BEFORE UPDATE OR DELETE` no Postgres (vale para qualquer cliente do banco) e a extensão de tenant recusa `update`/`delete` no modelo. Correção = **estorno**: nova linha com origem/destino trocados, `reversal_of_id` único (estorna-se uma vez; estorno não se estorna).
3. **Concorrência**: toda escrita roda numa transação que começa com `SELECT ... FROM lots WHERE id = $1 FOR UPDATE`. Movimentações do mesmo lote ficam em fila; lotes diferentes seguem em paralelo. Com o lote travado, o saldo é calculado do razão e validado antes do `INSERT`.
4. **Status automático**: `CONSUMED` quando o saldo total zera; volta a `AVAILABLE` se um estorno repuser saldo. `QUARANTINE`/`BLOCKED` impedem saída e transferência (exceto quarentena → área de quarentena; estornos sempre permitidos).
5. **Idempotência**: header `Idempotency-Key` em recebimento e movimentações, gravado na própria movimentação com o hash SHA-256 do corpo. Repetição → resposta original + `Idempotent-Replayed: true`; mesma chave com outro corpo → 422. Corrida entre duas requisições com a mesma chave é resolvida pelo índice único `(company_id, idempotency_key)`.
6. **Código do lote**: `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` em `lot_sequences` — atômico, por empresa e ano, sem buracos em rollback.
7. **Quantidades**: `numeric(14,3)` no banco, `Decimal` no código, string com 3 casas na API.

## Alternativas consideradas

- **Tabela de saldos (projeção) atualizada na mesma transação**: leitura O(1) e checagem trivial, mas duplica a verdade (razão + saldo) e exige reconciliação. Fica como otimização se o volume crescer — o razão continua sendo a fonte.
- **`SERIALIZABLE` sem trava explícita**: correto, mas transforma conflito em erro de serialização que precisa de retry no cliente; a trava por lote é mais previsível e fácil de explicar.
- **Trava por (lote, local)**: mais paralelismo, mas o status do lote (CONSUMED) depende do saldo total — travar o lote inteiro mantém a regra simples.

## Consequências

- Histórico completo e auditável por construção; nenhum caminho da aplicação consegue "editar" estoque.
- Consultas de saldo agregam o razão: índices `(company_id, lot_id)` e `(company_id, occurred_at)`. Para muitos milhões de linhas, introduzir a projeção.
- Testes pendentes (adiados a pedido): concorrência de saídas simultâneas, corrida de idempotência, trigger, sequência de códigos sob concorrência.
