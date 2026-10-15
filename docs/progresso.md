# Progresso

## Semana 1 — Fundação e cadastros

| #   | Etapa                                                      | Status       |
| --- | ---------------------------------------------------------- | ------------ |
| 1   | Base do monorepo (pnpm, TS, ESLint, Prettier, Husky, docs) | ✅ concluída |
| 2   | Esqueleto da API (config, logs, Swagger, erros, Docker)    | ✅ concluída |
| 3   | Prisma: schema, migration, seed de café                    | ✅ concluída |
| 4   | Infra de testes (Vitest + Testcontainers)                  | ✅ concluída |
| 5   | Autenticação (JWT/JWKS, emissor simulado, perfis)          | ✅ concluída |
| 6   | Multi-tenancy + módulo de empresas + testes de isolamento  | ✅ concluída |
| 7   | CRUDs: produto, fornecedor, cliente, local                 | ✅ concluída |
| 8   | CI (GitHub Actions) e geração do cliente OpenAPI           | ✅ concluída |
| 9   | Front: login e telas de cadastro                           | ✅ concluída |

**Semana 1 concluída (2026-10-15).** API com 166 testes, web com 41; fluxo completo verificado no navegador (cadastro pela UI na empresa A, invisível para a empresa B).

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

### Etapa 5 — Autenticação

- Guard global (tudo protegido por padrão, `@Public()` para exceções) + `RolesGuard` com `@Roles()`.
- Uma estratégia `passport-jwt` para Cognito (JWKS via `jwks-rsa`) e para o emissor simulado (chave em memória).
- Emissor simulado: `/v1/dev/users`, `/v1/dev/token`, JWKS — só em `AUTH_MODE=mock`, proibido em produção pelo env.
- `GET /v1/me` com usuário, perfis e empresa.
- 33 testes novos: claims, env, token forjado/expirado/ID token/outro client/usuário inativo, matriz de perfis. Total na API: 49.
- Documentação: [autenticacao.md](autenticacao.md).

### Etapa 6 — Isolamento entre empresas

- Contexto por requisição (`nestjs-cls`) com a empresa vinda do usuário autenticado.
- Extensão do Prisma que escopa toda operação (`scopeArgs`), falhando fechado sem contexto.
- `TenantPrismaService.sql()` para SQL bruto; ESLint impede SQL bruto e o cliente sem filtro nos módulos de negócio.
- Erros do Prisma mapeados: P2025 → 404, P2002 → 409 (com campos), P2003 → 409.
- `GET/PATCH /v1/companies/me` (PATCH só admin).
- 43 testes novos: 26 unitários das regras + 17 de integração (listar, buscar, atualizar, excluir, criar com `companyId` forjado, mover de empresa, `OR` para burlar, transação, concorrência, SQL bruto, HTTP). Total na API: 92.
- Bug encontrado pelos testes: consultas lazy do Prisma executando fora do contexto — documentado em [multi-tenancy.md](multi-tenancy.md).

### Etapa 7 — Cadastros

- Produtos, fornecedores, clientes e locais com o mesmo contrato: lista paginada (busca, filtros, ordenação, status), detalhe, criação, edição, ativar/desativar (sem exclusão). Ver [cadastros.md](cadastros.md).
- Validações de domínio: CPF/CNPJ com dígito verificador, UF, altitude, variedades, SKU/código normalizados, grau de torra só para torrados/blends.
- `describeCatalogResource()`: suíte e2e padrão (isolamento, perfis, ciclo de vida, paginação) aplicada aos 4 recursos.
- Conflitos de unicidade informam o campo (com o driver adapter, extraído do nome da constraint).
- 166 testes na API.

### Etapa 8 — Contrato OpenAPI

- `pnpm openapi`: gera `packages/shared/openapi.json` (Nest em modo preview, sem banco) e os tipos `packages/shared/src/api/schema.ts` (openapi-typescript).
- CI: passo `openapi:check` falha se a API mudou sem regenerar o contrato.
- Observação: openapi-typescript declara peer `typescript@^5`, mas funciona com o 6.0.

### Etapa 9 — Front: login e cadastros

- Cliente tipado `openapi-fetch` sobre o contrato gerado; erros problem+json viram `ApiError` (campos mapeados nos formulários); 401 encerra a sessão.
- Blocos genéricos: tabela paginada no servidor, busca com debounce, filtros, ordenação, estado na URL, vazio/carregando/erro, formulário com RHF + Zod, confirmação de desativação.
- Telas de Produtos, Fornecedores, Clientes e Locais; ações escondidas conforme o perfil. Cabeçalho mostra a empresa via `/v1/me`.
- Correção no contrato: `page`/`pageSize` e `description` saíam como `object` no OpenAPI (faltava o tipo explícito no DTO); os casts no front foram removidos.
- Smoke test no navegador (Playwright): fornecedor, cliente e local salvos pela UI na Serra Azul não aparecem para a Vale do Café.

### Trabalho em paralelo (agentes)

- **CI básica** (`ci/basic-pipeline`): workflow com format, build, lint, typecheck, test; Dependabot; template de PR.
- **Base do front** (`feat/web-skeleton`): Vite + React 19 + Tailwind v4 + shadcn/ui, AuthProvider (mock e Cognito/PKCE), layout e páginas placeholder, 15 testes. Ver [web.md](web.md) após o merge.
- **Telas de cadastro** (`feat/web-catalog`): feitas em paralelo aos CRUDs de fornecedor/cliente/local, contra o contrato combinado; trocadas para os tipos gerados quando a API ficou pronta.

## Próximos passos

- Publicar no GitHub (push + PRs) e ver a CI rodar de verdade.
- Semana 2: lotes, movimentações imutáveis, saldo com `SELECT ... FOR UPDATE`, idempotência, recebimento e anexos.
- Pendências conhecidas: mensagens de erro da API em inglês (o front traduz as comuns); sem tela de detalhe só-leitura para auditor; máscara de CPF/CNPJ durante a digitação.
