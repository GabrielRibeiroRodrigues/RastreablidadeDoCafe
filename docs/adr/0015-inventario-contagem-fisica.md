# 0015 — Inventário: contagem física aplicada como ajustes no razão

- **Status:** Aceito (2026-10-20).

## Contexto

O ajuste de estoque já existia, mas lote a lote e sem vínculo com uma conferência. Numa contagem física real a equipe confere um local inteiro, leva horas e o estoque continua mexendo (expedições, transferências) enquanto isso. Precisávamos de um registro da contagem e de um jeito seguro de transformar as diferenças em movimentações.

## Decisão

- **Contagem por local** (`inventory_counts`, documento `INV-AAAA-NNNNNN`) com itens por lote (`inventory_count_items`). Ao abrir, a lista é preenchida com os lotes que têm saldo no local; lote achado a mais pode ser incluído.
- **Sem congelar o estoque.** A diferença é `contado − saldo no momento da aplicação`, não o saldo da abertura (que fica guardado só como referência). Assim, uma saída feita durante a contagem não vira falta falsa — desde que a equipe conte depois de a mercadoria sair, que é o caso normal.
- **Aplicar** (só admin) exige todos os itens contados e, numa transação, trava a contagem e cada lote (`FOR UPDATE`, em ordem de id) e lança um `ADJUSTMENT` por diferença, com documento = número da contagem. Itens sem diferença não geram movimentação. Depois de aplicada, a contagem não muda; correção é por estorno do ajuste.
- **Uma contagem aberta por local**: índice único parcial `(company_id, location_id) WHERE status = 'OPEN'` mais trava na linha do local ao abrir.
- A perda contada em lote **em quarentena ou bloqueado** é aceita (mesma exceção do descarte de NC): o café sumiu de fato, e o status do lote não muda.
- Cancelar (só admin, com motivo) não lança nada.

## Consequências

- O razão continua sendo a única fonte de saldo; a contagem só gera movimentações comuns, auditáveis e estornáveis.
- Contagem zero de todo o saldo deixa o lote `CONSUMED`, como qualquer baixa total.
- Se alguém movimentar um lote **depois** de contá-lo e antes de aplicar, a diferença calculada inclui esse movimento. A tela mostra o saldo atual ao lado do contado, para conferir antes de aplicar.
