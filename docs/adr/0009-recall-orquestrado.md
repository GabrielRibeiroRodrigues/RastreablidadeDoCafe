# 0009 — Recall orquestrado em etapas idempotentes (local ou Step Functions)

- **Status:** Aceito (2026-10-16)

## Contexto

Um recall precisa, numa sequência confiável: bloquear todos os lotes afetados, gerar um relatório para a vigilância/clientes e avisar a equipe. Cada passo fala com um sistema diferente (Postgres, S3, SNS) e qualquer um pode falhar no meio. Na AWS a API roda em Lambda (tempo limitado por requisição); localmente, não há Step Functions.

## Decisão

1. **Etapas persistidas** em `recall_steps` (`BLOCK_LOTS`, `REPORT`, `NOTIFY`) com status, tentativas, início/fim, erro e saída. O recall tem uma máquina de estados simples: `OPEN → EXECUTING → COMPLETED | FAILED → CLOSED` (FAILED volta a EXECUTING pelo retry).
2. **Cada etapa é idempotente**: etapa concluída (ou pulada) não roda de novo; `BLOCK_LOTS` só processa lotes com `blocked_at` nulo; `REPORT` sobrescreve o mesmo objeto. Retomar = rodar de novo a sequência.
3. **Orquestração atrás de uma interface** (`RecallRunner`):
   - `LocalRecallRunner` (padrão): roda as etapas em sequência dentro da requisição;
   - `StepFunctionsRecallRunner` (com `RECALL_STATE_MACHINE_ARN`): `StartExecution`; cada estado invoca a Lambda `src/jobs/recall-step.job.ts` com `{ recallId, companyId, step }`, que devolve `{ recallId, step, status }`.
4. **Falha não lança**: a etapa grava o erro, o recall fica `FAILED`, a falha é auditada e notificada; a Lambda devolve `status: "FAILED"` e a state machine encerra. Erros de entrada/infra lançam (o Step Functions pode repetir).
5. **Fotografia do impacto** gravada na criação (`recall_lots`, `recall_customers`): o relatório e a auditoria mostram o que se sabia no momento da decisão, mesmo que o estoque mude depois.
6. **Notificação atrás de `Notifier`**: `SnsNotifier` com `SNS_TOPIC_ARN`, `LogNotifier` sem.

## Alternativas consideradas

- **Tudo numa transação/requisição**: simples, mas um erro no S3/SNS desfaria o bloqueio dos lotes — exatamente o que não pode falhar. E não existe "retomar".
- **Fila (SQS) com consumidor**: funciona, mas sem visualização do fluxo e com mais código de controle; o Step Functions dá histórico, retries e console de graça no free tier (4.000 transições/mês).
- **Só Step Functions, sem runner local**: obrigaria LocalStack para desenvolver e testar.

## Consequências

- O mesmo código de etapa roda local e na AWS; o ambiente decide só quem chama.
- Encerrar o recall **não** libera lotes: a liberação é explícita, lote a lote, e é recusada enquanto o recall estiver aberto (`/problems/lot-under-recall`).
- Um índice único parcial garante no máximo um recall não encerrado por lote de origem.
- Testes pendentes (adiados a pedido): falha e retomada de etapa, corrida de dois retries, isolamento por empresa nas novas rotas.
