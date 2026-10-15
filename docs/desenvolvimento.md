# Guia de desenvolvimento

## Pré-requisitos

| Ferramenta | Versão  | Observação                                         |
| ---------- | ------- | -------------------------------------------------- |
| Node.js    | 24 LTS  | ver `.nvmrc`                                       |
| pnpm       | 10.x    | versão exata em `packageManager` no `package.json` |
| Docker     | recente | Postgres local e Testcontainers                    |
| Git        | —       | os hooks do Husky são instalados no `pnpm install` |

### Instalando o pnpm no Windows

`corepack enable` falha com `EPERM` quando o Node está em `C:\Program Files` (precisa de admin). Alternativa sem admin:

```bash
npm install -g pnpm@10
```

## Scripts da raiz

| Script              | O que faz                                        |
| ------------------- | ------------------------------------------------ |
| `pnpm lint`         | ESLint em todo o monorepo (com type-check)       |
| `pnpm format`       | Prettier em todos os arquivos                    |
| `pnpm format:check` | Verifica formatação (usado na CI)                |
| `pnpm typecheck`    | `tsc --noEmit` em cada pacote                    |
| `pnpm test`         | Testes de cada pacote                            |
| `pnpm build`        | Build de cada pacote                             |
| `pnpm db:up`        | Sobe só o Postgres (docker compose)              |
| `pnpm db:down`      | Derruba os contêineres                           |
| `pnpm dev:api`      | API com hot reload no host                       |
| `pnpm stack:up`     | Postgres + API em contêiner (imagem de produção) |

Para rodar só um pacote: `pnpm --filter @traceflow/shared build`.

## Rodando a API

```bash
pnpm install
pnpm --filter @traceflow/shared build
cp apps/api/.env.example apps/api/.env   # ajuste se quiser
pnpm db:up
pnpm dev:api
```

| URL                             | O quê                    |
| ------------------------------- | ------------------------ |
| http://localhost:3000/v1/health | Health check             |
| http://localhost:3000/docs      | Swagger UI               |
| http://localhost:3000/docs-json | Documento OpenAPI (JSON) |

As variáveis são validadas com Zod no boot (`apps/api/src/config/env.ts`). Valor inválido = a API não sobe e mostra quais variáveis estão erradas.

### API em contêiner

`pnpm stack:up` constrói `apps/api/Dockerfile` (multi-stage: `pnpm fetch` → build → `pnpm deploy --prod`) e sobe API + Postgres. Roda como usuário `node`, com `HEALTHCHECK` em `/v1/health` e logs em JSON (em desenvolvimento, `pino-pretty`).

### Erros e correlação

- Todo erro sai como `application/problem+json` (RFC 9457): `type`, `title`, `status`, `detail`, `instance`, `requestId` e, em validação, `errors: [{ field, messages }]`.
- Envie `x-request-id` (8–128 caracteres `[A-Za-z0-9_-]`) para correlacionar logs; se ausente ou inválido, a API gera um UUID. O ID volta no header de resposta e em cada linha de log (`requestId`).

### Testes da API

`pnpm --filter @traceflow/api test` roda Vitest: unitários em `src/**/*.spec.ts` e e2e em `test/*.e2e-spec.ts` (supertest sobre a app completa).

## Convenções

- **Commits**: [Conventional Commits](https://www.conventionalcommits.org/pt-br/) validados pelo commitlint. Escopos sugeridos: `api`, `web`, `shared`, `infra`, `docs`, `ci`, `deps`, `repo`. Ex.: `feat(api): add supplier CRUD`.
- **Pre-commit**: lint-staged roda ESLint + Prettier nos arquivos alterados.
- **Branches**: um por tarefa (`chore/monorepo-setup`, `feat/api-auth`...), PR para `main`.
- **Fim de linha**: LF em tudo (`.gitattributes` + `.editorconfig`), mesmo no Windows.
- **TypeScript**: `strict` + `noUncheckedIndexedAccess`. Configuração base em `tsconfig.base.json`.

## Solução de problemas

- **`unmet peer typescript`**: o `latest` do npm é o TypeScript 7 (nativo), ainda não suportado pelo typescript-eslint. O repo fixa `typescript@~6.0`.
- **`Ignored build scripts`**: o pnpm 10 bloqueia scripts de instalação; dependências liberadas ficam em `onlyBuiltDependencies` no `pnpm-workspace.yaml`.
- **`ERR_SWC_NATIVE_CACHE` / "DACL grants replacement rights"**: o addon nativo do SWC recusa cache em pastas onde outro usuário do Windows tem controle total. Por isso o projeto não usa SWC nos testes (ver [ADR 0006](adr/0006-nestjs-12-esm-vitest.md)).
- **`failed to connect to the docker API ... dockerDesktopLinuxEngine`**: o Docker Desktop não está aberto. Abra-o e espere o engine iniciar (`docker info`).
