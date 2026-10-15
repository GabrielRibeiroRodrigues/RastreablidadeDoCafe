# Progresso

## Semana 1 — Fundação e cadastros

| #   | Etapa                                                      | Status          |
| --- | ---------------------------------------------------------- | --------------- |
| 1   | Base do monorepo (pnpm, TS, ESLint, Prettier, Husky, docs) | ✅ concluída    |
| 2   | Esqueleto da API (config, logs, Swagger, erros, Docker)    | ✅ concluída    |
| 3   | Prisma: schema, migration, seed de café                    | ✅ concluída    |
| 4   | Infra de testes (Vitest + Testcontainers)                  | ✅ concluída    |
| 5   | Autenticação (JWT/JWKS, emissor simulado, perfis)          | ⏳ próxima      |
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

### Etapa 3 — Prisma

- Prisma **7.10** com `@prisma/adapter-pg` e cliente gerado em `src/generated/prisma` (ESM, fora do git, gerado no `postinstall`).
- Observação: no npm a tag `latest` do pacote `prisma` aponta para um RC da v8; o CLI foi fixado em `~7.10.0`.
- Schema: `companies`, `users`, `products`, `suppliers`, `customers`, `locations` — ver [modelo-de-dados.md](modelo-de-dados.md).
- Migration `init` versionada; seed idempotente com 2 empresas de café.
- `PrismaService` com pool configurável (`DATABASE_POOL_MAX`) e `GET /v1/health/ready` (503 se o banco cair).

### Etapa 4 — Infra de testes

- Vitest com projetos `unit` e `integration`.
- Testcontainers: um Postgres 17 por execução, migrations reais aplicadas no setup global.
- Helpers: `createTestApp`, `resetDatabase` (TRUNCATE), fábricas de dados.
- Primeiros testes com banco: readiness, migrations aplicadas, banco limpo entre testes, SKU único **por empresa**, empresa com dados não pode ser apagada.
- 16 testes na API; ~15 s localmente.

### Trabalho em paralelo (agentes)

- **CI básica** (`ci/basic-pipeline`): workflow com format, build, lint, typecheck, test; Dependabot; template de PR.
- **Base do front** (`feat/web-skeleton`): Vite + React 19 + Tailwind v4 + shadcn/ui, AuthProvider (mock e Cognito/PKCE), layout e páginas placeholder, 15 testes. Ver [web.md](web.md) após o merge.
