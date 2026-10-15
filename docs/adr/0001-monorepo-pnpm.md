# 0001 — Monorepo com pnpm workspaces

- **Status:** Aceito (2026-10-15)

## Contexto

API, front, tipos compartilhados, Terraform e docs evoluem juntos; um contrato (OpenAPI) liga API e front.

## Decisão

Um repositório com pnpm workspaces (`apps/*`, `packages/*`). Scripts orquestrados com `pnpm -r`/`--filter`, **sem** Turborepo/Nx por enquanto.

## Consequências

- Uma única PR pode mudar API, cliente gerado e tela, mantendo tudo consistente.
- pnpm é rápido e estrito (sem dependências fantasmas).
- Se o tempo de CI crescer, adicionar cache de tarefas (Turborepo) é incremental.
