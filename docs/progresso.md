# Progresso

## Semana 1 — Fundação e cadastros

| #   | Etapa                                                      | Status          |
| --- | ---------------------------------------------------------- | --------------- |
| 1   | Base do monorepo (pnpm, TS, ESLint, Prettier, Husky, docs) | ✅ concluída    |
| 2   | Esqueleto da API (config, logs, Swagger, erros, Docker)    | ✅ concluída    |
| 3   | Prisma: schema, migration, seed de café                    | ⏳ próxima      |
| 4   | Infra de testes (Jest + Testcontainers)                    | ⬜              |
| 5   | Autenticação (JWT/JWKS, emissor simulado, perfis)          | ⬜              |
| 6   | Multi-tenancy + módulo de empresas + testes de isolamento  | ⬜              |
| 7   | CRUDs: produto, fornecedor, cliente, local                 | ⬜              |
| 8   | CI (GitHub Actions) e geração do cliente OpenAPI           | 🟡 CI básica    |
| 9   | Front: login e telas de cadastro                           | 🟡 em andamento |

## Registro

### Etapa 1 — Base do monorepo

- pnpm workspaces (`apps/*`, `packages/*`), `packageManager` fixado, Node 24 (`.nvmrc`).
- `tsconfig.base.json` strict; ESLint 10 (flat config, typescript-eslint com type-check) + Prettier.
- Husky: `pre-commit` (lint-staged) e `commit-msg` (commitlint convencional).
- `packages/shared` com os perfis (`admin`, `operator`, `auditor`), build ESM + CJS via tsup.
- `.gitattributes` forçando LF; `.gitignore` ampliado (Terraform, editores).
- Documentação inicial: README, arquitetura, domínio, desenvolvimento, ADRs 0001–0005, `CLAUDE.md` para agentes.

### Etapa 2 — Esqueleto da API

- NestJS **12 em ESM** (decisão nova: [ADR 0006](adr/0006-nestjs-12-esm-vitest.md)); prefixo `/v1`.
- Configuração validada com Zod no boot (`apps/api/src/config/env.ts`).
- Logs estruturados (nestjs-pino) com `x-request-id`: reaproveitado se seguro, gerado caso contrário, devolvido no header; `authorization` e `cookie` mascarados.
- Erros no formato RFC 9457 com lista de campos inválidos; erros inesperados não vazam detalhes.
- Swagger em `/docs` (JSON em `/docs-json`), helmet, CORS configurável.
- Dockerfile multi-stage (usuário não-root, healthcheck) e docker-compose com Postgres 17 + perfil `full`.
- Vitest: 11 testes (env + e2e de health, correlação, problem details, validação, OpenAPI).

### Trabalho em paralelo (agentes)

- **CI básica** (`ci/basic-pipeline`): workflow com format, build, lint, typecheck, test; Dependabot; template de PR.
- **Base do front** (`feat/web-skeleton`): em andamento.
