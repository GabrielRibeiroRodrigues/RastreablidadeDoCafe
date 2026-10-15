# Progresso

## Semana 1 — Fundação e cadastros

| #   | Etapa                                                      | Status       |
| --- | ---------------------------------------------------------- | ------------ |
| 1   | Base do monorepo (pnpm, TS, ESLint, Prettier, Husky, docs) | ✅ concluída |
| 2   | Esqueleto da API (config, logs, Swagger, erros, Docker)    | ⏳ próxima   |
| 3   | Prisma: schema, migration, seed de café                    | ⬜           |
| 4   | Infra de testes (Jest + Testcontainers)                    | ⬜           |
| 5   | Autenticação (JWT/JWKS, emissor simulado, perfis)          | ⬜           |
| 6   | Multi-tenancy + módulo de empresas + testes de isolamento  | ⬜           |
| 7   | CRUDs: produto, fornecedor, cliente, local                 | ⬜           |
| 8   | CI (GitHub Actions) e geração do cliente OpenAPI           | ⬜           |
| 9   | Front: login e telas de cadastro                           | ⬜           |

## Registro

### Etapa 1 — Base do monorepo

- pnpm workspaces (`apps/*`, `packages/*`), `packageManager` fixado, Node 24 (`.nvmrc`).
- `tsconfig.base.json` strict; ESLint 10 (flat config, typescript-eslint com type-check) + Prettier.
- Husky: `pre-commit` (lint-staged) e `commit-msg` (commitlint convencional).
- `packages/shared` com os perfis (`admin`, `operator`, `auditor`), build ESM + CJS via tsup.
- `.gitattributes` forçando LF; `.gitignore` ampliado (Terraform, editores).
- Documentação inicial: README, arquitetura, domínio, desenvolvimento, ADRs 0001–0005, `CLAUDE.md` para agentes.
