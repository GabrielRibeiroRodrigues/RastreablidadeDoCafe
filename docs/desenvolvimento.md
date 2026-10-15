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

| Script              | O que faz                                  |
| ------------------- | ------------------------------------------ |
| `pnpm lint`         | ESLint em todo o monorepo (com type-check) |
| `pnpm format`       | Prettier em todos os arquivos              |
| `pnpm format:check` | Verifica formatação (usado na CI)          |
| `pnpm typecheck`    | `tsc --noEmit` em cada pacote              |
| `pnpm test`         | Testes de cada pacote                      |
| `pnpm build`        | Build de cada pacote                       |

Para rodar só um pacote: `pnpm --filter @traceflow/shared build`.

## Convenções

- **Commits**: [Conventional Commits](https://www.conventionalcommits.org/pt-br/) validados pelo commitlint. Escopos sugeridos: `api`, `web`, `shared`, `infra`, `docs`, `ci`, `deps`, `repo`. Ex.: `feat(api): add supplier CRUD`.
- **Pre-commit**: lint-staged roda ESLint + Prettier nos arquivos alterados.
- **Branches**: um por tarefa (`chore/monorepo-setup`, `feat/api-auth`...), PR para `main`.
- **Fim de linha**: LF em tudo (`.gitattributes` + `.editorconfig`), mesmo no Windows.
- **TypeScript**: `strict` + `noUncheckedIndexedAccess`. Configuração base em `tsconfig.base.json`.

## CI

Workflow em `.github/workflows/ci.yml` (GitHub Actions, `ubuntu-latest`). Roda em push para
qualquer branch e em pull request para `main`; execuções antigas do mesmo ref são canceladas.

Etapas, em ordem:

1. `pnpm install --frozen-lockfile` (Node da `.nvmrc`, pnpm do `packageManager`, cache do pnpm)
2. `pnpm format:check`
3. `pnpm --filter @traceflow/shared build` — lint e typecheck dos consumidores leem os tipos do
   `dist/` do shared, então ele é compilado antes
4. `pnpm lint`
5. `pnpm typecheck`
6. `pnpm test` — os testes de integração com Testcontainers usam o Docker do runner
7. `pnpm build`

Os scripts da raiz usam `pnpm -r --if-present`, então novos pacotes (`apps/api`, `apps/web`)
entram na CI sem editar o workflow. Para reproduzir localmente:

```bash
pnpm install --frozen-lockfile
pnpm format:check
pnpm --filter @traceflow/shared build
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Outros arquivos em `.github/`:

- `dependabot.yml`: atualizações semanais de GitHub Actions e npm (minor/patch agrupados). Majors
  do `typescript` são ignorados (ver [ADR 0002](adr/0002-node-24-typescript-6.md)).
- `pull_request_template.md`: modelo de descrição de PR.

As actions estão fixadas por tag de major (`@v7`). Fixar por SHA de commit é um passo de
hardening futuro.

## Solução de problemas

- **`unmet peer typescript`**: o `latest` do npm é o TypeScript 7 (nativo), ainda não suportado pelo typescript-eslint. O repo fixa `typescript@~6.0`.
- **`Ignored build scripts`**: o pnpm 10 bloqueia scripts de instalação; dependências liberadas ficam em `onlyBuiltDependencies` no `pnpm-workspace.yaml`.
