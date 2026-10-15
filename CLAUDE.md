# Instruções para agentes (TraceFlow)

Leia antes de qualquer tarefa. Vale para qualquer agente trabalhando neste repo (inclusive em paralelo).

## Idioma

- Código, identificadores, nomes de tabelas e mensagens de commit: **inglês**.
- Interface (UI), README e `docs/`: **português**.

## Fluxo de trabalho

1. Ler o repo e propor um plano curto antes de codar; esperar aprovação.
2. Etapas pequenas; rodar `pnpm lint`, `pnpm typecheck` e `pnpm test` a cada etapa.
3. Um branch por tarefa (`feat/...`, `chore/...`, `fix/...`), Conventional Commits.
4. **Sem** linhas `Co-Authored-By` nos commits.
5. Ao terminar uma etapa: resumir o que mudou e atualizar `docs/progresso.md` (e um ADR se houve decisão).

## Proibido sem pedido explícito

- `terraform apply`, criar recursos na AWS, usar credenciais reais.
- Segredos no código: use variáveis de ambiente e `.env.example`.

## Regras de domínio que não se negociam

- Toda tabela de negócio tem `company_id`; isolamento entre empresas é obrigatório **e testado**.
- Acesso a outra empresa responde **404** (nunca 403).
- SQL bruto só via helper tenant-aware (nunca `$queryRaw` solto).
- Movimentações são imutáveis; correção por estorno. Saldo nunca negativo (transação + `SELECT ... FOR UPDATE`).
- Free tier: nada de NAT Gateway, RDS Proxy ou recurso cobrado por hora sem necessidade.

## Versões fixadas

- Node 24, pnpm 10, TypeScript **6.0.x** (o TS 7 nativo ainda não é suportado pelo typescript-eslint/Nest).
