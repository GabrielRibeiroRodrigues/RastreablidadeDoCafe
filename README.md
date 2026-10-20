# TraceFlow ☕

Mini ERP de **rastreabilidade de lotes de café** para pequenas indústrias: recebimento, estoque, produção (torra, blend, embalagem), expedição, rastreabilidade para trás e para frente e **recall**.

Projeto de portfólio para demonstrar arquitetura de aplicação de negócio + AWS (serverless, eventos, IaC), com custo próximo de zero.

> **Status:** funcionalidades completas e testadas (v0.1 + recall, qualidade, auditoria, painel, relatórios, importação, gestão de usuários, cancelamento de operações); infraestrutura AWS descrita em Terraform e validada, **ainda não implantada**. Para publicar, siga o [guia de produção](docs/guia_producao.md). Para usuários: [manual do cliente](docs/manual_cliente.md). Progresso: [docs/progresso.md](docs/progresso.md).

## Por que este domínio?

Rastreabilidade de alimentos é um problema real e cheio de regras interessantes: movimentações imutáveis, saldo que nunca pode ficar negativo sob concorrência, genealogia de lotes (um blend vem de vários lotes verdes, que vêm de várias fazendas) e recall, que precisa descobrir em segundos **quais clientes** receberam produto derivado de um lote contaminado.

## Stack

| Camada   | Tecnologia                                                                        |
| -------- | --------------------------------------------------------------------------------- |
| Monorepo | pnpm workspaces (`apps/api`, `apps/web`, `packages/shared`, `infra`, `docs`)      |
| API      | NestJS 12 (ESM), TypeScript strict, Prisma 7, PostgreSQL 17, Swagger, nestjs-pino |
| Web      | React 19, Vite, TanStack Query, React Hook Form + Zod, shadcn/ui                  |
| Auth     | Amazon Cognito (JWT/JWKS) — emissor simulado em desenvolvimento                   |
| Testes   | Vitest, supertest, Testcontainers (API) · Vitest + Testing Library (web)          |
| AWS      | Lambda, API Gateway, S3 + CloudFront, RDS, SQS, SNS, Step Functions, EventBridge  |
| IaC / CI | Terraform · GitHub Actions com OIDC                                               |

## Começando

Pré-requisitos: Node 24, pnpm 10, Docker.

```bash
pnpm install
pnpm lint && pnpm typecheck && pnpm test
```

Guia completo: [docs/desenvolvimento.md](docs/desenvolvimento.md).

## Documentação

- [Arquitetura](docs/arquitetura.md)
- [Domínio e glossário](docs/dominio.md)
- [Guia de desenvolvimento](docs/desenvolvimento.md)
- [Decisões de arquitetura (ADRs)](docs/adr/README.md)
- [Progresso e roadmap](docs/progresso.md)
