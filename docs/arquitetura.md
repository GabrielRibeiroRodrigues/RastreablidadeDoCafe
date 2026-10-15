# Arquitetura

> Documento vivo: as seções marcadas como _planejado_ ainda não foram implementadas.

## Visão geral

```mermaid
flowchart LR
  user([Usuário]) --> web[Web<br/>React + Vite]
  web -->|JWT Cognito| api[API<br/>NestJS]
  api --> db[(PostgreSQL)]
  api -. planejado .-> s3[(S3<br/>anexos/relatórios)]
  api -. planejado .-> sqs[[SQS + DLQ]]
  api -. planejado .-> sfn[[Step Functions<br/>recall]]
  sfn -.-> sns[[SNS e-mail]]
  cognito[Amazon Cognito] -->|JWKS| api
  web -->|login| cognito
```

## Monorepo

| Pasta             | Papel                                                                     |
| ----------------- | ------------------------------------------------------------------------- |
| `apps/api`        | API NestJS (_Semana 1, etapa 2_)                                          |
| `apps/web`        | Front React (_Semana 1, etapa 9_)                                         |
| `packages/shared` | Constantes de domínio (perfis, enums) e, depois, o cliente tipado OpenAPI |
| `infra`           | Terraform (_Semana 6_)                                                    |
| `docs`            | Esta documentação e os ADRs                                               |

O pacote `shared` é compilado com **tsup** em ESM + CJS: a API Nest (CommonJS) e o front Vite (ESM) consomem o mesmo artefato sem configuração especial.

## Fluxo de uma requisição (planejado para a Semana 1)

1. `nestjs-pino` lê `x-request-id` (ou gera um UUID) e devolve no header de resposta — **ID de correlação**.
2. `JwtAuthGuard` valida o token pela JWKS (Cognito em produção, emissor simulado em dev).
3. O usuário é carregado pelo `sub`; `companyId` e perfis vão para o contexto da requisição (`nestjs-cls`).
4. `RolesGuard` checa `@Roles(...)`.
5. O serviço usa o Prisma **estendido**, que injeta `company_id` em todo `where`/`data` — veja [ADR 0004](adr/0004-multi-tenancy.md).
6. Erros saem no formato RFC 9457 (`application/problem+json`).

## Deploy na AWS (planejado — Semana 6)

- API: Lambda (NestJS via serverless-express, bundle com esbuild) atrás de API Gateway HTTP API.
- Web: S3 privado + CloudFront com OAC.
- Banco: RDS PostgreSQL `db.t4g.micro`, uma AZ, subnet privada; Lambda na VPC com concorrência limitada e **sem NAT Gateway** (endpoint de gateway para S3).
- Assíncrono: SQS + DLQ (importação CSV), Step Functions (recall), EventBridge Scheduler (alerta de validade), SNS (notificações).
- Módulo alternativo ECS Fargate + ALB + WAF apenas com `terraform validate/plan`.
