# TraceFlow ☕

Mini ERP de **rastreabilidade de lotes de café** para pequenas indústrias: recebimento, estoque, produção (torra, blend, embalagem), expedição, rastreabilidade para trás e para frente e **recall**.

Projeto de portfólio para demonstrar arquitetura de aplicação de negócio + AWS (serverless, eventos, IaC), com custo próximo de zero.

> **Status:** MVP **v0.1** ✅ (Semanas 1–3: cadastros, lotes e razão de estoque, produção com genealogia, expedição, rastreabilidade para trás/frente, etiqueta com QR e página pública). Próxima: Semana 4 (recall, qualidade, auditoria). Veja [docs/progresso.md](docs/progresso.md).

## Por que este domínio?

Rastreabilidade de alimentos é um problema real e cheio de regras interessantes: movimentações imutáveis, saldo que nunca pode ficar negativo sob concorrência, genealogia de lotes (um blend vem de vários lotes verdes, que vêm de várias fazendas) e recall, que precisa descobrir em segundos **quais clientes** receberam produto derivado de um lote contaminado.

## Stack

| Camada         | Tecnologia                                                                        |
| -------------- | --------------------------------------------------------------------------------- |
| Monorepo       | pnpm workspaces (`apps/api`, `apps/web`, `packages/shared`, `infra`, `docs`)      |
| API            | NestJS 12 (ESM), TypeScript strict, Prisma 7, PostgreSQL 17, Swagger, nestjs-pino |
| Web            | React 19, Vite, TanStack Query, React Hook Form + Zod, shadcn/ui                  |
| Auth           | Amazon Cognito (JWT/JWKS) — emissor simulado em desenvolvimento                   |
| Testes         | Vitest, supertest, Testcontainers (API) · Vitest + Testing Library (web)          |
| AWS (Semana 6) | Lambda, API Gateway, S3 + CloudFront, RDS, SQS, SNS, Step Functions, EventBridge  |
| IaC / CI       | Terraform · GitHub Actions com OIDC                                               |

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
