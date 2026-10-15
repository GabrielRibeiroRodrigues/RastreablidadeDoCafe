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

## Solução de problemas

- **`unmet peer typescript`**: o `latest` do npm é o TypeScript 7 (nativo), ainda não suportado pelo typescript-eslint. O repo fixa `typescript@~6.0`.
- **`Ignored build scripts`**: o pnpm 10 bloqueia scripts de instalação; dependências liberadas ficam em `onlyBuiltDependencies` no `pnpm-workspace.yaml`.
