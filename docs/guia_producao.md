# TraceFlow — Guia de preparação e implantação em produção

Este guia responde a três perguntas:

1. **Qual é o estado atual da aplicação?**
2. **O que falta fazer antes de colocá-la em produção?**
3. **Como executar cada etapa, na ordem certa, até publicá-la com segurança?**

Ele foi escrito a partir da análise do repositório no commit `de13181` (branch `main`, 18/10/2026) e de verificações executadas localmente nesse mesmo dia. O que não pôde ser confirmado está marcado como **Não verificado**. O roteiro técnico detalhado que já existia no projeto ([deploy.md](deploy.md) e [go-live.md](go-live.md)) continua válido; este guia o organiza do zero à publicação, aponta o que falta e acrescenta o que não estava coberto.

> **Convenções.** Comandos são para **bash** (Linux, macOS ou Git Bash no Windows). No Git Bash, prefixe comandos `docker` que montam pastas com `MSYS_NO_PATHCONV=1`. Valores entre `<...>` devem ser trocados pelos do seu ambiente. Salvo indicação, rode os comandos **na raiz do repositório**.

---

## Índice

1. [Diagnóstico do estado atual](#1-diagnóstico-do-estado-atual)
2. [Checklist do que falta para produção](#2-checklist-do-que-falta-para-produção)
3. [Passo a passo para colocar em produção](#3-passo-a-passo-para-colocar-em-produção)
4. [Exemplos práticos e arquivos de configuração](#4-exemplos-práticos-e-arquivos-de-configuração)
5. [Segurança antes da publicação](#5-segurança-antes-da-publicação)
6. [Plano de testes e validação final](#6-plano-de-testes-e-validação-final)
7. [Plano de publicação e rollback](#7-plano-de-publicação-e-rollback)
8. [Estimativa e priorização](#8-estimativa-e-priorização)
9. [Apêndice: decisões pendentes e glossário](#9-apêndice-decisões-pendentes-e-glossário)

---

## 1. Diagnóstico do estado atual

### 1.1 Resumo em uma frase

A aplicação está **funcionalmente completa e bem testada localmente**, com **infraestrutura AWS descrita em código (Terraform)**, mas **nunca foi implantada numa conta AWS real**: o primeiro `terraform apply`, o login pelo Cognito real e a restauração de backup no RDS ainda não foram exercitados.

### 1.2 Linguagens, frameworks e versões

| Camada         | Tecnologia (versão fixada no repositório)                                                                                |
| -------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Runtime        | Node.js 24 (`.nvmrc`), pnpm 10.34.7 (`packageManager`)                                                                   |
| Linguagem      | TypeScript 6.0.x, modo `strict`                                                                                          |
| API (backend)  | NestJS 12 em ESM, Prisma 7.10 (`@prisma/adapter-pg`), class-validator, nestjs-pino, helmet, `@nestjs/throttler`, Swagger |
| Web (frontend) | React 19, Vite 8, React Router 7, TanStack Query 5, React Hook Form + Zod, Tailwind CSS 4 + shadcn/ui, `oidc-client-ts`  |
| Banco de dados | PostgreSQL 17                                                                                                            |
| Contrato       | OpenAPI gerado da API (`packages/shared/openapi.json`) e tipos do front gerados dele                                     |
| Testes         | Vitest + supertest + Testcontainers (API), Vitest + Testing Library (web)                                                |
| Infraestrutura | Terraform 1.16 (provider AWS), 12 módulos em `infra/terraform/modules`                                                   |
| CI/CD          | GitHub Actions (`.github/workflows/ci.yml` e `deploy.yml`) com OIDC                                                      |

### 1.3 Estrutura do projeto

```text
.
├── apps/
│   ├── api/                 # API NestJS: src/modules (negócio), src/auth, src/tenancy, src/jobs (Lambdas auxiliares)
│   │   ├── prisma/          # schema.prisma, 4 migrations, seed de desenvolvimento
│   │   ├── scripts/         # bundle-lambda.mjs, smoke-lambda.mjs, bootstrap-tenant.ts
│   │   ├── test/            # 23 arquivos de teste de integração (Postgres real)
│   │   └── Dockerfile       # imagem de contêiner (alternativa à Lambda)
│   └── web/                 # SPA React (build estático em dist/)
├── packages/shared/         # perfis, contrato OpenAPI e tipos compartilhados
├── infra/terraform/         # envs/prod + 12 módulos
├── .github/workflows/       # ci.yml (todo push) e deploy.yml (tag v* ou manual)
├── docker-compose.yml       # Postgres 17 + MinIO (S3 local) + API (perfil full)
└── docs/                    # documentação (este guia, ADRs, runbooks)
```

### 1.4 Componentes e como se comunicam

```mermaid
flowchart LR
  user([Navegador]) -->|HTTPS| cf[CloudFront + S3<br/>front estático]
  user -->|login PKCE| cognito[Amazon Cognito<br/>Hosted UI]
  user -->|Bearer JWT| apigw[API Gateway HTTP API]
  user -->|URL pré-assinada| files[(S3 privado<br/>anexos, etiquetas, PDFs)]
  apigw --> api[Lambda API<br/>NestJS]
  api -->|TLS verify-full| rds[(RDS PostgreSQL 17)]
  api --> files
  api -->|StartExecution| sfn[[Step Functions<br/>recall]]
  sfn --> recall[Lambda recall-step]
  sched[EventBridge Scheduler<br/>07:00 BRT] --> expiry[Lambda expiry-alert]
  expiry & recall & cw[CloudWatch alarmes] --> sns[[SNS → e-mail]]
  migrate[Lambda migrate] --> rds
  ssm[(SSM Parameter Store<br/>DATABASE_URL)] -.-> api & recall & expiry & migrate
```

- **Front ↔ API:** o front é uma SPA estática que chama a API por HTTPS (`VITE_API_URL`) com o token do Cognito no cabeçalho `Authorization: Bearer`. Toda a API fica sob o prefixo `/v1`. Erros seguem o formato RFC 9457 (`application/problem+json`) com um `code` estável.
- **Arquivos:** o navegador envia e baixa arquivos **direto do S3** por URLs pré-assinadas (upload limitado a 10 MB e a PDF/JPEG/PNG/WebP); a API só autoriza e confirma.
- **Tarefas assíncronas:** recall (Step Functions → Lambda `recall-step`), alerta diário de validade (EventBridge Scheduler → Lambda `expiry-alert`) e migrations (Lambda `migrate`). Não há filas de trabalho nem cache; existe uma fila SQS **só** como DLQ (mensagens de falha dos jobs).

### 1.5 Banco de dados

- PostgreSQL 17. Local: contêiner do `docker-compose.yml`. Produção (planejado): RDS `db.t4g.micro`, 20 GB gp3, criptografado, backup automático de 7 dias, `rds.force_ssl=1`, proteção contra exclusão, **endpoint público com TLS obrigatório** (decisão de custo, [ADR 0010](adr/0010-rede-e-custos-aws.md)).
- Esquema e mudanças por **migrations do Prisma** (`apps/api/prisma/migrations`, 4 migrations). Em produção são aplicadas pela Lambda `migrate`, chamada pelo workflow de deploy.
- Regras de integridade no próprio banco: chaves estrangeiras compostas com `company_id`, `CHECK`s de quantidade e **gatilhos que impedem UPDATE/DELETE** em `stock_movements`, `lot_origins`, `shipment_items` e `audit_logs`.
- Isolamento entre empresas: feito na aplicação (extensão do Prisma que injeta `company_id` + helper tenant-aware para SQL bruto). Não há Row Level Security no Postgres ([ADR 0004](adr/0004-multi-tenancy.md)).

### 1.6 Usuários, autenticação, permissões e sessões

- **Autenticação:** Amazon Cognito (User Pool) com Hosted UI e Authorization Code + PKCE no front (`oidc-client-ts`). A API valida o _access token_ pela chave pública (JWKS), o `client_id`, o tipo do token e exige que o `sub` exista e esteja **ativo** na tabela `users`.
- **Modo simulado** (`AUTH_MODE=mock`) só para desenvolvimento: a API **recusa subir** com `mock` quando `NODE_ENV=production`.
- **Perfis:** `admin`, `operator`, `auditor`, vindos dos grupos do Cognito (`cognito:groups`). Guard global: toda rota exige token, exceto as marcadas como públicas (health e página pública de rastreio).
- **Sessões:** access token de 60 minutos e refresh token de 30 dias (Cognito); no navegador, guardados em `sessionStorage`. Um 401 encerra a sessão local e devolve o usuário ao login.
- **Política de senha:** mínimo de 12 caracteres; MFA por aplicativo (TOTP) **opcional**; só administradores criam usuários; recuperação de conta por e-mail verificado.
- **Gestão de usuários:** **não existe tela nem API**. Cada usuário é criado no Cognito (AWS CLI ou console) e vinculado à empresa pelo script `tenant:bootstrap`.

### 1.7 Arquivos e dados

| Dado                                                 | Onde fica                                                                                      |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Dados de negócio e trilha de auditoria               | PostgreSQL (RDS)                                                                               |
| Anexos de lotes, etiquetas PDF, relatórios de recall | Bucket S3 privado (SSE-S3, versionamento, versões antigas expiram em 30 dias, TLS obrigatório) |
| Front-end                                            | Bucket S3 privado servido pelo CloudFront (OAC)                                                |
| `DATABASE_URL` e senha mestre do RDS                 | SSM Parameter Store (`SecureString`) e state do Terraform                                      |
| State do Terraform                                   | Bucket S3 a criar (`traceflow-tfstate-<ACCOUNT_ID>`)                                           |
| Logs                                                 | CloudWatch Logs, retenção de 14 dias                                                           |

### 1.8 Configuração e variáveis de ambiente

- **API:** validadas com Zod no boot (`apps/api/src/config/env.ts`); valor inválido impede a subida. Modelo: `apps/api/.env.example`. Na AWS, o Terraform monta as variáveis em `infra/terraform/envs/prod/main.tf` (`app_environment`), e o segredo do banco vem do SSM em tempo de inicialização (`DATABASE_URL_SSM_PARAMETER`).
- **Web:** variáveis `VITE_*` validadas na inicialização (`apps/web/src/config/env.ts`). São públicas por natureza (vão para o navegador). Modelos: `apps/web/.env.example` e `apps/web/.env.production.example`. No deploy, o workflow as preenche com os outputs do Terraform.
- **Terraform:** `infra/terraform/envs/prod/terraform.tfvars.example` (o `terraform.tfvars` real fica fora do git; o `.gitignore` já ignora `*.tfvars` e `*.tfstate`).

### 1.9 Docker, CI/CD, testes, logs e monitoramento

| Item          | Situação encontrada                                                                                                                                                                                                                                                               |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Docker        | `apps/api/Dockerfile` multi-stage, usuário não-root, `HEALTHCHECK`; `docker-compose.yml` para desenvolvimento. **Não é usado no caminho de produção** (Lambda), apenas no módulo alternativo `ecs-alternative` (não usado)                                                        |
| CI            | `ci.yml` em todo push: formatação, lint, typecheck, testes (com Postgres real), build, checagem do contrato OpenAPI e `terraform validate`. Última execução em `main` (merge do PR #6): **sucesso**                                                                               |
| CD            | `deploy.yml`: em tag `v*` ou manual → bundle das Lambdas → `terraform plan` → **aprovação manual** no environment `production` → apply, migrations, build e publicação do front, invalidação do CloudFront. **Nunca executado** (exige backend S3 e secret que ainda não existem) |
| Testes        | API: 264 testes (unitários + integração com Postgres real). Web: 41 testes. **Sem cobertura automatizada** para anexos/etiqueta com bucket, handler da Lambda, job de migrations e testes de navegador na CI                                                                      |
| Logs          | JSON estruturado (pino), `x-request-id` em toda requisição e resposta, cabeçalhos `authorization` e `cookie` mascarados                                                                                                                                                           |
| Monitoramento | Dashboard CloudWatch e 8 tipos de alarme → SNS e-mail: 5xx da API, latência p95 > 3 s, throttling, CPU do RDS > 80%, conexões do RDS, mensagens na DLQ, erros de cada Lambda, recall com falha. **Sem alarme de espaço livre em disco do RDS**                                    |
| Health check  | `GET /v1/health` (vivo) e `GET /v1/health/ready` (banco OK; 503 se cair)                                                                                                                                                                                                          |

> **Trabalho paralelo não incluído.** No GitHub há a branch `feat/improvements` com mudanças ainda fora da `main` (por exemplo, um runbook de restauração do banco e testes de navegador na CI, que na última execução **falhou**). Este guia descreve a `main`. Revise e integre essa branch antes do go-live, ou congele-a.

### 1.10 O que está pronto e o que está pendente

**Pronto (verificado no código e por testes):** regras de negócio, isolamento entre empresas (testado), saldo nunca negativo sob concorrência (testado), imutabilidade do histórico (testada), validação de entrada, tratamento de erros sem vazamento de detalhes, cabeçalhos de segurança, CORS restrito, rate limit, limites de corpo e tempo, checagens de configuração de produção, contrato OpenAPI, empacotamento das Lambdas, Terraform validado, pipeline de deploy com aprovação manual.

**Pendente:** tudo o que depende de uma conta AWS real (state, primeiro apply, Cognito real, e-mails do SNS, migrations no RDS, usuários), domínio e HTTPS próprios, teste de restauração no RDS, Content-Security-Policy do front, correções de formatação no PDF do recall, definição de suporte e de documentação de privacidade (LGPD).

---

## 2. Checklist do que falta para produção

Classificações: **Concluído** (existe e está adequado ao cenário), **Parcial** (existe, precisa de ajuste), **Pendente** (precisa ser feito), **Não verificado** (não foi possível confirmar).

| Item                                | Situação atual                                                                                                                                                                                                                                               | O que precisa ser feito                                                                                                          | Prioridade                 |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| Conta AWS, billing, MFA e orçamento | **Pendente** — não há evidência de conta preparada                                                                                                                                                                                                           | Criar/escolher a conta, MFA no root, usuário administrador via IAM Identity Center, AWS Budget com alerta                        | Obrigatória                |
| State remoto do Terraform           | **Pendente** — bloco `backend "s3"` comentado em `envs/prod/backend.tf`; o deploy recusa rodar sem ele                                                                                                                                                       | Criar bucket de state, descomentar o backend, commitar                                                                           | Obrigatória                |
| Variáveis do Terraform              | **Parcial** — `terraform.tfvars.example` completo                                                                                                                                                                                                            | Criar `terraform.tfvars` com e-mails reais, região, concorrência; guardar como variável `TF_VARS` no GitHub                      | Obrigatória                |
| Infraestrutura (primeiro apply)     | **Pendente** — `validate`, tflint e checkov passam; apply nunca executado                                                                                                                                                                                    | Rodar o primeiro `terraform apply` local, ler o plano, corrigir ajustes finos                                                    | Obrigatória                |
| Configuração de produção da API     | **Concluído** — `NODE_ENV=production`, `AUTH_MODE=cognito`, `TRUST_PROXY=1`, Swagger desligado, CORS só no domínio do front; o boot falha com configuração insegura                                                                                          | Conferir após o apply (logs sem avisos de produção)                                                                              | Obrigatória (verificação)  |
| Segredos                            | **Concluído** no desenho — senha gerada pelo Terraform, `DATABASE_URL` no SSM, CI sem chaves (OIDC). Nenhum segredo real encontrado no repositório                                                                                                           | Restringir acesso ao bucket de state (contém a senha do RDS); não colocar segredos em `TF_VARS`                                  | Obrigatória                |
| Banco de produção e migrations      | **Parcial** — RDS e Lambda `migrate` definidos; migrations testadas em Postgres real na CI                                                                                                                                                                   | Aplicar as migrations pela Lambda após o apply; **não** rodar o seed                                                             | Obrigatória                |
| Autenticação real (Cognito)         | **Não verificado** — o fluxo Cognito do front nunca foi testado contra um User Pool real ([web.md](web.md))                                                                                                                                                  | Testar login, troca de senha temporária, logout e expiração no ambiente publicado                                                | Obrigatória                |
| Autorização e perfis                | **Concluído** — guard global, perfis por rota, matriz de perfis e isolamento entre empresas cobertos por testes                                                                                                                                              | Manter grupos do Cognito e campo `role` iguais ao criar usuários                                                                 | Obrigatória (procedimento) |
| Gestão de usuários e empresas       | **Parcial** — só por AWS CLI + script `tenant:bootstrap`                                                                                                                                                                                                     | Definir quem cria usuários e documentar o procedimento interno (seção 3, etapa 10)                                               | Obrigatória (procedimento) |
| Validação de dados e erros          | **Concluído** — DTOs validados, CPF/CNPJ, limites de corpo, erros RFC 9457 sem detalhes internos                                                                                                                                                             | —                                                                                                                                | —                          |
| Formatação do PDF do recall         | **Pendente** — quantidades saem como `15.000 BAG_60KG`/`70.000 KG` (em pt-BR, "15.000" lê-se quinze mil); a situação aparece como "Em execução" no PDF de um recall concluído (o PDF é gerado durante a execução)                                            | Formatar quantidades em pt-BR com a unidade traduzida (ex.: "15 sc", "70 kg") em `apps/api/src/modules/recalls/recall-report.ts` | Alta                       |
| Pequenos defeitos de texto          | **Parcial** — "disponível 12,000" no diálogo de movimentação; "4 expedição(ões)" na simulação/confirmação do recall                                                                                                                                          | Usar a formatação de quantidade e o plural já existentes no front                                                                | Baixa                      |
| CORS / CSRF                         | **Concluído** — CORS por lista de origens (sem `*` em produção); sem cookies de sessão, token em cabeçalho, portanto CSRF clássico não se aplica                                                                                                             | —                                                                                                                                | —                          |
| Content-Security-Policy do front    | **Pendente** — `web_content_security_policy` vazio por padrão                                                                                                                                                                                                | Definir a CSP depois de validar o login (etapa 12)                                                                               | Alta                       |
| HTTPS e certificados                | **Parcial** — CloudFront e API Gateway já servem HTTPS com certificados da AWS; RDS com TLS `verify-full`                                                                                                                                                    | Para domínio próprio: certificado ACM em `us-east-1`                                                                             | Obrigatória (com domínio)  |
| Domínio e DNS                       | **Pendente** — decisão externa                                                                                                                                                                                                                               | Decidir o domínio **antes de imprimir etiquetas** (o QR code grava `PUBLIC_WEB_URL`)                                             | Alta                       |
| Hospedagem                          | **Concluído** no desenho — AWS serverless (Lambda, API Gateway, S3/CloudFront, RDS)                                                                                                                                                                          | Executar (etapas 4–8)                                                                                                            | Obrigatória                |
| Rede do banco                       | **Parcial** — RDS público com TLS obrigatório e senha forte (custo zero); modo privado pronto mas não testado de ponta a ponta                                                                                                                               | Aceitar o risco documentado ou ativar `private_networking = true` (~US$ 22/mês)                                                  | Média                      |
| Docker e proxy reverso              | **Não se aplica** ao caminho escolhido — API Gateway faz o papel de proxy; `TRUST_PROXY=1` já configurado                                                                                                                                                    | Só se optar por ECS (módulo `ecs-alternative`, não usado)                                                                        | —                          |
| Arquivos estáticos e uploads        | **Concluído** no desenho — front no S3+CloudFront com cache por tipo; uploads direto ao S3 por URL pré-assinada                                                                                                                                              | Testar upload/download no ambiente publicado                                                                                     | Obrigatória (verificação)  |
| Filas, jobs e serviços auxiliares   | **Parcial** — Step Functions, Scheduler, SNS e DLQ definidos; código dos jobs existe                                                                                                                                                                         | Confirmar o e-mail do SNS; testar recall e alerta de validade publicados                                                         | Obrigatória                |
| Testes funcionais e de integração   | **Parcial** — 264 + 41 testes passando; faltam anexos/etiqueta com bucket, handler da Lambda, migrations e navegador na CI                                                                                                                                   | Rodar a validação funcional da seção 6 no ambiente publicado                                                                     | Obrigatória                |
| Logs                                | **Concluído** — JSON com `requestId`, segredos mascarados, retenção de 14 dias                                                                                                                                                                               | Avaliar retenção maior se exigido por auditoria                                                                                  | Baixa                      |
| Monitoramento e alertas             | **Parcial** — dashboard e alarmes definidos; sem alarme de disco do RDS                                                                                                                                                                                      | Confirmar e-mails; criar alarme `FreeStorageSpace`                                                                               | Média                      |
| Backup e restauração                | **Parcial** — backup automático 7 dias + PITR (planejado); restauração testada **só localmente** (`pg_dump`/`pg_restore`, seção 6)                                                                                                                           | Testar restauração PITR no RDS real antes de liberar                                                                             | Obrigatória                |
| Desempenho e capacidade             | **Não verificado** — dimensionado para uso pequeno (Lambda 1024 MB, concorrência 5, pool 2, RDS micro, API Gateway 20 req/s)                                                                                                                                 | Teste de carga leve (seção 6); ajustar se houver muitos usuários simultâneos                                                     | Média                      |
| CI/CD                               | **Parcial** — workflows prontos; deploy nunca executado                                                                                                                                                                                                      | Configurar environment `production`, secret e variáveis; primeiro deploy por tag                                                 | Obrigatória                |
| Plano de rollback                   | **Parcial** — documentado em [deploy.md](deploy.md#rollback); nunca exercitado                                                                                                                                                                               | Ensaiar um rollback de código após o primeiro deploy                                                                             | Média                      |
| LGPD e proteção de dados            | **Parcial** — página pública sem dados pessoais; dados pessoais internos (CPF de produtor, contatos de clientes, e-mail de usuários, IP na auditoria); **sem política de privacidade, sem processo de exclusão/anonimização** (cadastros só são desativados) | Definir base legal, aviso de privacidade, retenção e procedimento para pedidos de titulares                                      | Alta                       |
| Dependências vulneráveis            | **Parcial** — `pnpm audit --prod`: 7 achados (4 altos, 3 moderados) em dependências transitivas de ferramentas (CLI do Prisma: `lodash`, `mysql2`, `deepmerge-ts`; CLI do shadcn: `braces`)                                                                  | Atualizar e reavaliar; mover CLIs para `devDependencies` quando possível                                                         | Média                      |
| Suporte ao usuário                  | **Pendente** — não há canal definido no projeto                                                                                                                                                                                                              | Definir canal e incluir no manual                                                                                                | Média                      |
| Contas e serviços externos          | **Pendente** — conta AWS, repositório GitHub com environment `production`, caixa de e-mail para alertas                                                                                                                                                      | Providenciar                                                                                                                     | Obrigatória                |
| E-mails do Cognito                  | **Parcial** — `COGNITO_DEFAULT` (cota diária baixa de e-mails, remetente genérico da AWS)                                                                                                                                                                    | Suficiente para poucos usuários; para escala ou remetente próprio, configurar Amazon SES                                         | Baixa                      |
| Avisos por e-mail multiempresa      | **Parcial** — um único tópico SNS para todas as empresas                                                                                                                                                                                                     | Aceitável com uma empresa; com várias, definir quem recebe os avisos                                                             | Baixa                      |
| Documentação desatualizada          | **Parcial** — [deploy.md](deploy.md) cita `NOTIFICATIONS_TOPIC_ARN`, mas o código e o Terraform usam `SNS_TOPIC_ARN`                                                                                                                                         | Corrigir o texto do deploy.md                                                                                                    | Baixa                      |

---

## 3. Passo a passo para colocar em produção

Ordem recomendada:

| #   | Etapa                                                | Depende de |
| --- | ---------------------------------------------------- | ---------- |
| 1   | Corrigir os problemas da aplicação                   | —          |
| 2   | Tomar as decisões pendentes                          | —          |
| 3   | Preparar a conta AWS e as ferramentas                | 2          |
| 4   | Criar o state remoto do Terraform                    | 3          |
| 5   | Preparar as variáveis e os segredos                  | 4          |
| 6   | Gerar os pacotes das Lambdas                         | 1          |
| 7   | Criar a infraestrutura (primeiro apply)              | 5, 6       |
| 8   | Preparar o banco (migrations)                        | 7          |
| 9   | Publicar o front-end                                 | 7          |
| 10  | Criar a empresa e os usuários                        | 8          |
| 11  | Configurar domínio, DNS e HTTPS (opcional)           | 7          |
| 12  | Endurecer a segurança (CSP e revisão)                | 9, 11      |
| 13  | Configurar o GitHub Actions para os próximos deploys | 7          |
| 14  | Monitoramento e alertas                              | 7          |
| 15  | Backup e teste de restauração                        | 8          |
| 16  | Validação final                                      | todas      |
| 17  | Publicação para os usuários e acompanhamento         | 16         |

Etapas que **não se aplicam** a este projeto: configurar servidor de aplicação/proxy reverso (o API Gateway cumpre esse papel), instalar servidor web para estáticos (S3 + CloudFront), cache e filas de trabalho (não existem na aplicação). Docker só seria necessário se a hospedagem mudar para contêineres (ECS).

---

### Etapa 1 — Corrigir os problemas identificados na aplicação

- **Objetivo:** não publicar defeitos que afetam documentos oficiais (relatório de recall) nem a segurança.
- **Situação atual:** a aplicação passa em lint, typecheck, build e 305 testes. Na navegação real foram encontrados: (a) quantidades do PDF do recall em formato bruto (`15.000 BAG_60KG`), (b) "disponível 12,000" no diálogo de movimentação, (c) plural "expedição(ões)" no recall, (d) texto desatualizado no `deploy.md`.
- **Pré-requisitos:** ambiente de desenvolvimento ([desenvolvimento.md](desenvolvimento.md)).
- **Passo a passo:**
  1. Crie um branch: `git switch -c fix/recall-report-quantities`.
  2. Em `apps/api/src/modules/recalls/recall-report.ts`, formate quantidades em pt-BR sem zeros à direita e traduza a unidade (`KG` → `kg`, `BAG_60KG` → `sc`, `UNIT` → `un`).
  3. No front, use `formatQuantity` (`apps/web/src/lib/quantity.ts`) na mensagem de saldo insuficiente e `countOf`/`plural` (`apps/web/src/lib/plural.ts`) no texto de expedições do recall.
  4. Em `docs/deploy.md`, troque `NOTIFICATIONS_TOPIC_ARN` por `SNS_TOPIC_ARN`.
  5. Decida sobre a branch `feat/improvements`: integre (corrigindo a CI que falhou) ou adie para depois do go-live.
- **Comandos:**
  ```bash
  pnpm install --frozen-lockfile
  pnpm --filter @traceflow/shared build
  pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build
  ```
- **Arquivos envolvidos:** `apps/api/src/modules/recalls/recall-report.ts`, `apps/web/src/features/inventory/MoveLotDialog.tsx`, `apps/web/src/features/recalls/*`, `docs/deploy.md`.
- **Resultado esperado:** PDF do recall com "15 sc", "102 kg"; CI verde no PR.
- **Validação:** executar um recall de teste localmente e abrir o PDF.
- **Cuidados:** não altere regras de negócio nesta etapa; mantenha o commit pequeno.

### Etapa 2 — Tomar as decisões pendentes

- **Objetivo:** evitar retrabalho (principalmente com domínio e etiquetas).
- **Situação atual:** o projeto deixa em aberto conta AWS, região, domínio, e-mails de alerta, rede do banco, canal de suporte e documentação de privacidade.
- **Passo a passo:** preencha a tabela do [Apêndice](#9-apêndice-decisões-pendentes-e-glossário). As decisões que **travam** o go-live são: conta AWS, região, e-mails de alerta, domínio (ou aceitar o domínio do CloudFront) e a empresa/usuários iniciais.
- **Cuidados:** **o endereço do QR code é gravado na etiqueta impressa** (`{PUBLIC_WEB_URL}/rastreio/{token}`). Se as primeiras etiquetas forem impressas com o domínio `*.cloudfront.net` e depois o domínio mudar, essas etiquetas continuarão apontando para o endereço antigo. Defina o domínio definitivo antes de imprimir.

### Etapa 3 — Preparar a conta AWS e as ferramentas

- **Objetivo:** ter uma conta segura e as ferramentas para o primeiro apply.
- **Situação atual:** nenhuma evidência de conta configurada.
- **Pré-requisitos:** cartão de crédito para a conta AWS; acesso de administrador.
- **Passo a passo:**
  1. Ative MFA no usuário root e não use o root no dia a dia.
  2. Crie um usuário administrador (recomendado: IAM Identity Center) para uso **local** no primeiro apply.
  3. Crie um **AWS Budget** (ex.: US$ 5/mês) com alerta por e-mail.
  4. Instale AWS CLI v2, Terraform 1.16, Node 24 e pnpm 10.
  5. Se a conta for nova, verifique a cota de execuções concorrentes de Lambda (Service Quotas → Lambda → _Concurrent executions_). Com cota 10, use `api_reserved_concurrency = -1` (etapa 5) e peça aumento.
- **Comandos:**
  ```bash
  aws configure sso            # ou aws sso login --profile <perfil>
  aws sts get-caller-identity  # mostra a conta e o usuário em uso
  terraform -version           # 1.16.x
  node -v && pnpm -v           # v24.x e 10.x
  ```
- **Resultado esperado:** `get-caller-identity` mostra a conta correta.
- **Cuidados:** confirme a **região** (padrão do projeto: `us-east-1`; o certificado do CloudFront precisa estar nela).

### Etapa 4 — Criar o state remoto do Terraform

- **Objetivo:** guardar o estado da infraestrutura num lugar seguro e compartilhado (o deploy pelo GitHub exige isso).
- **Situação atual:** backend comentado em `infra/terraform/envs/prod/backend.tf`.
- **Comandos** (uma única vez, com as credenciais de administrador):
  ```bash
  ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
  BUCKET=traceflow-tfstate-$ACCOUNT_ID
  aws s3api create-bucket --bucket "$BUCKET" --region us-east-1
  aws s3api put-bucket-versioning --bucket "$BUCKET" --versioning-configuration Status=Enabled
  aws s3api put-bucket-encryption --bucket "$BUCKET" --server-side-encryption-configuration \
    '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'
  aws s3api put-public-access-block --bucket "$BUCKET" --public-access-block-configuration \
    BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
  ```
- **Arquivos envolvidos:** `infra/terraform/envs/prod/backend.tf` — descomente o bloco `terraform { backend "s3" { ... } }`, troque `<ACCOUNT_ID>` e commite.
- **Resultado esperado:** `aws s3api get-bucket-versioning --bucket "$BUCKET"` retorna `"Status": "Enabled"`.
- **Cuidados:** o state contém a senha do RDS. Restrinja o acesso ao bucket aos administradores.

### Etapa 5 — Preparar as variáveis e os segredos

- **Objetivo:** definir a configuração do ambiente sem expor segredos.
- **Situação atual:** modelo completo em `terraform.tfvars.example`; a configuração da API em produção já é montada pelo Terraform.
- **Comandos:**
  ```bash
  cd infra/terraform/envs/prod
  cp terraform.tfvars.example terraform.tfvars   # fica fora do git (.gitignore)
  ```
- **Configurações necessárias** (em `terraform.tfvars`):

  | Variável                                | Valor                                         | Observação                                             |
  | --------------------------------------- | --------------------------------------------- | ------------------------------------------------------ |
  | `aws_region`                            | `"us-east-1"`                                 |                                                        |
  | `notification_emails`                   | `["ops@<sua-empresa>.com.br"]`                | Recebe alarmes, falhas de recall e alertas de validade |
  | `api_reserved_concurrency`              | `5` ou `-1`                                   | `-1` em conta nova com cota 10                         |
  | `enable_expiry_alert` / `enable_recall` | `true`                                        | Os jobs existem no código                              |
  | `private_networking`                    | `false` (custo ~zero) ou `true` (~US$ 22/mês) | Decisão da etapa 2                                     |
  | `db_deletion_protection`                | `true`                                        | Só `false` antes de destruir o ambiente                |
  | `web_aliases`, `web_certificate_arn`    | —                                             | Só com domínio próprio (etapa 11)                      |

- **Segredos:** nenhum segredo é digitado. A senha do RDS é gerada pelo Terraform e gravada no SSM (`/traceflow/prod/db/master-password` e `/traceflow/prod/db/url`). O GitHub usa OIDC (sem chaves AWS).
- **Resultado esperado:** `terraform.tfvars` preenchido e **não** listado em `git status`.
- **Cuidados:** o conteúdo do `terraform.tfvars` será copiado para a variável `TF_VARS` do GitHub (etapa 13): não coloque segredos nele.

### Etapa 6 — Gerar os pacotes das Lambdas

- **Objetivo:** produzir os zips que o Terraform publica (`api`, `migrate`, `expiry-alert`, `recall-step`).
- **Comandos** (raiz do repositório):
  ```bash
  pnpm install --frozen-lockfile
  pnpm --filter @traceflow/shared build
  pnpm --filter @traceflow/api bundle:lambda
  ls apps/api/dist-lambda/*.zip
  ```
- **Validação opcional (sem AWS):** com um Postgres local (`pnpm db:up`):
  ```bash
  DATABASE_URL=postgresql://traceflow:traceflow@localhost:5432/traceflow pnpm --filter @traceflow/api smoke:lambda
  ```
- **Resultado esperado:** quatro arquivos `.zip` em `apps/api/dist-lambda/`.
- **Cuidados:** gere os pacotes a partir do commit que será implantado (de preferência a tag da versão).

### Etapa 7 — Criar a infraestrutura (primeiro apply)

- **Objetivo:** criar na AWS a rede, o banco, o Cognito, os buckets, as Lambdas, o API Gateway, o CloudFront, os jobs, o monitoramento e a role de deploy do GitHub.
- **Situação atual:** nunca aplicado; validado com `terraform validate`, tflint e checkov.
- **Pré-requisitos:** etapas 3 a 6.
- **Comandos:**
  ```bash
  cd infra/terraform/envs/prod
  terraform init                 # usa o backend S3 da etapa 4
  terraform plan -out tfplan     # LEIA o plano: tudo deve ser "create"
  terraform apply tfplan         # ~15–20 min (RDS e CloudFront são os lentos)
  terraform output               # anote web_url, api_url, cognito_*, migrate_function_name, dashboard_url
  ```
- **Resultado esperado:** apply sem erros e outputs preenchidos.
- **Validação:**
  ```bash
  curl -s "$(terraform output -raw api_url)/v1/health"
  # {"status":"ok","uptime":...}
  ```
  (o `/ready` só fica OK depois das migrations — etapa 8.)
- **Cuidados e erros frequentes:**
  - `UnreservedConcurrentExecution below its minimum value` → use `api_reserved_concurrency = -1`.
  - Nomes globais (bucket, domínio do Cognito) já incluem o ID da conta; se mesmo assim houver colisão, ajuste o prefixo no módulo.
  - **Confirme os e-mails do SNS:** cada endereço de `notification_emails` recebe "AWS Notification - Subscription Confirmation". Sem confirmar, nenhum alarme chega.
  - Se algo falhar no meio, corrija e rode `plan`/`apply` de novo: o Terraform continua de onde parou.

### Etapa 8 — Preparar o banco (migrations)

- **Objetivo:** criar as tabelas no RDS.
- **Situação atual:** 4 migrations versionadas; a Lambda `migrate` as aplica em transação.
- **Comandos** (em `infra/terraform/envs/prod`):
  ```bash
  FN=$(terraform output -raw migrate_function_name)
  # 1) o que seria aplicado, sem aplicar
  aws lambda invoke --function-name "$FN" --cli-binary-format raw-in-base64-out \
    --payload '{"dryRun":true}' --cli-read-timeout 320 dry.json && cat dry.json
  # 2) aplicar
  aws lambda invoke --function-name "$FN" --cli-binary-format raw-in-base64-out \
    --payload '{}' --cli-read-timeout 320 out.json && cat out.json
  # esperado: {"applied":[...4 migrations...],"alreadyApplied":[],"pending":[]}
  curl -s "$(terraform output -raw api_url)/v1/health/ready"
  # esperado: {"status":"ok","database":"up"}
  ```
- **Cuidados:** **nunca** rode `db:seed` nem `db:reset` em produção (o seed cria usuários de teste com identificadores falsos; o reset apaga o banco).

### Etapa 9 — Publicar o front-end

- **Objetivo:** colocar a SPA no CloudFront apontando para a API e o Cognito reais.
- **Situação atual:** o workflow de deploy faz isso automaticamente; para o primeiro acesso, pode ser feito à mão.
- **Comandos** (em `infra/terraform/envs/prod`):
  ```bash
  export VITE_API_URL=$(terraform output -raw api_url) VITE_AUTH_MODE=cognito \
    VITE_COGNITO_AUTHORITY=$(terraform output -raw cognito_authority) \
    VITE_COGNITO_CLIENT_ID=$(terraform output -raw cognito_client_id) \
    VITE_COGNITO_DOMAIN=$(terraform output -raw cognito_domain) \
    VITE_COGNITO_REDIRECT_URI=$(terraform output -raw web_url)/auth/callback \
    VITE_COGNITO_LOGOUT_URI=$(terraform output -raw web_url)/login
  (cd ../../../.. && pnpm --filter @traceflow/shared build && pnpm --filter @traceflow/web build)
  aws s3 sync ../../../../apps/web/dist "s3://$(terraform output -raw web_bucket)" --delete
  aws cloudfront create-invalidation --distribution-id "$(terraform output -raw web_distribution_id)" --paths "/*"
  ```
- **Resultado esperado:** abrir `terraform output -raw web_url` mostra a tela de entrada **sem** o selo "Ambiente de desenvolvimento" e com o botão de login do Cognito.
- **Cuidados:** o build falha de propósito se faltar alguma variável `VITE_COGNITO_*`. Nada nessas variáveis é segredo.

### Etapa 10 — Criar a empresa e os usuários

- **Objetivo:** dar o primeiro acesso.
- **Situação atual:** não há tela de usuários; o User Pool só aceita usuários criados por administrador, e a API exige o vínculo do `sub` do Cognito com a tabela `users`.
- **Comandos** (em `infra/terraform/envs/prod`, para cada usuário):
  ```bash
  POOL=$(terraform output -raw cognito_user_pool_id)
  EMAIL=<usuario@empresa.com.br>
  ROLE_GROUP=admin            # admin | operator | auditor

  aws cognito-idp admin-create-user --user-pool-id "$POOL" --username "$EMAIL" \
    --user-attributes Name=email,Value="$EMAIL" Name=email_verified,Value=true \
    --desired-delivery-mediums EMAIL
  aws cognito-idp admin-add-user-to-group --user-pool-id "$POOL" --username "$EMAIL" --group-name "$ROLE_GROUP"
  SUB=$(aws cognito-idp admin-get-user --user-pool-id "$POOL" --username "$EMAIL" \
    --query "UserAttributes[?Name=='sub'].Value" --output text)

  # conexão ao banco (TLS com a CA do RDS)
  curl -so /tmp/rds-ca.pem https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem
  export NODE_EXTRA_CA_CERTS=/tmp/rds-ca.pem
  export DATABASE_URL=$(aws ssm get-parameter --with-decryption \
    --name "$(terraform output -raw database_url_parameter)" --query Parameter.Value --output text)

  # cria a empresa (se não existir) e o usuário — idempotente; rode a partir da raiz do repo
  (cd ../../../.. && pnpm --filter @traceflow/api tenant:bootstrap \
    --tax-id <CNPJ_14_digitos> --company "<Razão social>" --lot-prefix <CAF> \
    --email "$EMAIL" --name "<Nome do usuário>" --sub "$SUB" --role ADMIN)
  unset DATABASE_URL
  ```
- **Configurações:** `--role` (`ADMIN`, `OPERATOR`, `AUDITOR`) deve corresponder ao grupo do Cognito. `--lot-prefix` tem 2 a 5 letras e vira o prefixo dos códigos de lote (`CAF-2026-000001`).
- **Resultado esperado:** o usuário recebe a senha temporária por e-mail, entra, troca a senha e vê a empresa no cabeçalho.
- **Cuidados:** com `private_networking = true`, o banco não é acessível de fora da VPC — rode o script de dentro da VPC (ex.: CloudShell na VPC). Para desativar alguém, desabilite no Cognito **e** marque o usuário como inativo no banco (a API corta o acesso de usuário inativo mesmo com token válido).

### Etapa 11 — Configurar domínio, DNS e HTTPS (opcional, mas recomendado)

- **Objetivo:** usar um endereço próprio (ex.: `app.suaempresa.com.br`), principalmente por causa das etiquetas.
- **Situação atual:** sem domínio, o sistema funciona em `https://dxxxx.cloudfront.net` com HTTPS da AWS. O Terraform aceita `web_aliases` e `web_certificate_arn`.
- **Passo a passo:**
  1. No ACM, **região `us-east-1`**, solicite um certificado para `app.<seudominio>` com validação por DNS e crie o registro CNAME de validação no seu provedor de DNS.
  2. Quando o certificado estiver _Issued_, preencha no `terraform.tfvars`:
     ```hcl
     web_aliases         = ["app.<seudominio>"]
     web_certificate_arn = "arn:aws:acm:us-east-1:<ACCOUNT_ID>:certificate/<id>"
     ```
  3. `terraform plan -out tfplan && terraform apply tfplan` — CORS, `PUBLIC_WEB_URL` e as URLs de retorno do Cognito passam a usar o domínio.
  4. No DNS, crie `app` como CNAME (ou ALIAS, se for Route 53) para o domínio do CloudFront.
  5. Republique o front (etapa 9) para que as variáveis `VITE_COGNITO_*` usem o novo endereço.
- **Validação:**
  ```bash
  dig +short app.<seudominio>                 # aponta para *.cloudfront.net
  curl -sI https://app.<seudominio> | head -1 # HTTP/2 200
  ```
- **Cuidados:** a API continua no endereço do API Gateway (o projeto não define domínio próprio para a API); isso não afeta o usuário.

### Etapa 12 — Endurecer a segurança (CSP e revisão)

- **Objetivo:** ativar a Content-Security-Policy do front e passar pelo [checklist de segurança](#5-segurança-antes-da-publicação).
- **Situação atual:** CSP desligada para não quebrar o login antes de ser testado.
- **Passo a passo:** depois de validar o login (etapa 10), defina `web_content_security_policy` no `terraform.tfvars` permitindo, em `connect-src`, a API, o domínio do Cognito e o bucket de arquivos. Exemplo de partida (ajuste os endereços):
  ```hcl
  web_content_security_policy = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' https://<api_id>.execute-api.us-east-1.amazonaws.com https://<prefixo>.auth.us-east-1.amazoncognito.com https://cognito-idp.us-east-1.amazonaws.com https://<files_bucket>.s3.us-east-1.amazonaws.com https://<files_bucket>.s3.amazonaws.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://<prefixo>.auth.us-east-1.amazoncognito.com"
  ```
  `'unsafe-inline'` em `script-src` é necessário porque o `index.html` tem um script inline que aplica o tema antes da primeira pintura.
- **Validação:** login, upload/download de anexo, etiqueta e relatório do recall funcionando, sem erros "Content Security Policy" no console do navegador.
- **Cuidados:** uma CSP errada **quebra o login**. Aplique, teste imediatamente e reverta se necessário.

### Etapa 13 — Configurar o GitHub Actions para os próximos deploys

- **Objetivo:** que as atualizações sejam publicadas pelo pipeline, com aprovação manual.
- **Passo a passo:**
  1. _Settings → Environments → New environment_ `production`: _Required reviewers_ e, em _Deployment branches and tags_, só `main` e tags `v*`.
  2. _Settings → Secrets and variables → Actions_:
     - secret `AWS_DEPLOY_ROLE_ARN` = `terraform output -raw github_deploy_role_arn`;
     - variable `TF_VARS` = conteúdo do `terraform.tfvars`;
     - variable `AWS_REGION` (opcional; padrão `us-east-1`).
  3. Publique uma versão: `git tag v1.0.0 && git push origin v1.0.0` (ou _Actions → Deploy → Run workflow_).
- **Resultado esperado:** jobs `build` → `plan` → (aprovação) → `deploy` verdes; a URL do environment aparece no resumo.
- **Cuidados:** o plano não é salvo como artefato (contém a senha do RDS); o job `deploy` recalcula e aplica. Revise o log do `plan` antes de aprovar.

### Etapa 14 — Monitoramento e alertas

- **Objetivo:** saber de problemas antes dos usuários.
- **Situação atual:** dashboard e alarmes criados pelo módulo `observability`.
- **Passo a passo:**
  1. Confirme os e-mails do SNS (etapa 7).
  2. Abra o dashboard: `terraform output -raw dashboard_url`.
  3. Recomendado: crie um alarme de espaço livre no RDS (não existe hoje). Exemplo:
     ```bash
     aws cloudwatch put-metric-alarm --alarm-name traceflow-prod-rds-free-storage \
       --namespace AWS/RDS --metric-name FreeStorageSpace \
       --dimensions Name=DBInstanceIdentifier,Value=traceflow-prod \
       --statistic Minimum --period 300 --evaluation-periods 1 \
       --threshold 2147483648 --comparison-operator LessThanThreshold \
       --alarm-actions <ARN_do_topico_SNS>
     ```
     (2 GB; melhor ainda: adicionar ao módulo `observability` no Terraform para não ficar fora do código.)
  4. Teste o caminho do alarme: `aws cloudwatch set-alarm-state --alarm-name <um_alarme> --state-value ALARM --state-reason teste` e confirme o e-mail.
- **Logs:** CloudWatch Logs Insights, grupo `/aws/lambda/traceflow-prod-api`. Para seguir uma requisição, filtre pelo `requestId` mostrado ao usuário nas telas de erro:
  ```
  fields @timestamp, level, msg, req.method, req.url, res.statusCode
  | filter requestId = "<id>"
  | sort @timestamp asc
  ```

### Etapa 15 — Backup e teste de restauração

- **Objetivo:** garantir que é possível recuperar os dados.
- **Situação atual:** backup automático diário com retenção de 7 dias e _point-in-time restore_ (definidos no Terraform); versionamento no bucket de arquivos (versões antigas expiram em 30 dias). Restauração testada **localmente** (seção 6); **não** testada no RDS.
- **Passo a passo (ensaio no RDS, sem afetar produção):**
  1. Restaure para **outra** instância:
     ```bash
     aws rds restore-db-instance-to-point-in-time \
       --source-db-instance-identifier traceflow-prod \
       --target-db-instance-identifier traceflow-restore-test \
       --use-latest-restorable-time --db-instance-class db.t4g.micro
     aws rds wait db-instance-available --db-instance-identifier traceflow-restore-test
     ```
  2. Conecte-se (mesma senha mestre, endpoint da nova instância) e compare contagens com produção:
     ```sql
     select (select count(*) from lots), (select count(*) from stock_movements),
            (select count(*) from audit_logs), (select count(*) from _prisma_migrations);
     ```
  3. **Apague a instância de teste** para não gerar custo:
     ```bash
     aws rds delete-db-instance --db-instance-identifier traceflow-restore-test --skip-final-snapshot
     ```
- **Backup lógico adicional (recomendado antes de cada deploy com migration):**
  ```bash
  aws rds create-db-snapshot --db-instance-identifier traceflow-prod \
    --db-snapshot-identifier traceflow-pre-v<versao>-$(date +%Y%m%d%H%M)
  ```
- **Cuidados:** o teste de restauração faz parte dos critérios de liberação (seção 6). Anote o tempo que levou (é o seu tempo real de recuperação).

### Etapa 16 — Validação final

Execute o [plano de testes da seção 6](#6-plano-de-testes-e-validação-final) no ambiente publicado e só prossiga se **todos os critérios de liberação** forem atendidos.

### Etapa 17 — Publicar para os usuários e acompanhar

- **Passo a passo:**
  1. Comunique o endereço e entregue o [manual do cliente](manual_cliente.md).
  2. Crie os demais usuários (etapa 10).
  3. Nas primeiras 48 horas, acompanhe o dashboard 2 vezes ao dia e os e-mails de alarme.
  4. Cadastre os dados reais (ou importe por CSV) e faça o primeiro recebimento acompanhado.
- **Critério de sucesso:** sem alarmes, sem 5xx no dashboard e usuários conseguindo concluir recebimento → produção → expedição.

---

## 4. Exemplos práticos e arquivos de configuração

### 4.1 `terraform.tfvars` mínimo (sem domínio próprio)

Arquivo `infra/terraform/envs/prod/terraform.tfvars`:

```hcl
aws_region               = "us-east-1"
notification_emails      = ["ops@<sua-empresa>.com.br"]
api_reserved_concurrency = -1   # conta nova; troque por 5 após o aumento de cota
enable_expiry_alert      = true
enable_recall            = true
private_networking       = false
db_deletion_protection   = true
```

### 4.2 Variáveis do front para um build manual

Arquivo `apps/web/.env.production.local` (fora do git), baseado em `apps/web/.env.production.example`:

```dotenv
VITE_API_URL=https://<api_id>.execute-api.us-east-1.amazonaws.com
VITE_AUTH_MODE=cognito
VITE_COGNITO_AUTHORITY=https://cognito-idp.us-east-1.amazonaws.com/<user_pool_id>
VITE_COGNITO_CLIENT_ID=<cognito_client_id>
VITE_COGNITO_REDIRECT_URI=https://<web_url>/auth/callback
VITE_COGNITO_LOGOUT_URI=https://<web_url>/login
VITE_COGNITO_DOMAIN=https://<prefixo>.auth.us-east-1.amazoncognito.com
```

### 4.3 Configuração efetiva da API em produção

Montada pelo Terraform (não precisa ser digitada) — útil para conferir no console da Lambda:

| Variável                                                      | Valor em produção        |
| ------------------------------------------------------------- | ------------------------ |
| `NODE_ENV` / `AUTH_MODE`                                      | `production` / `cognito` |
| `TRUST_PROXY`                                                 | `1`                      |
| `SWAGGER_ENABLED`                                             | `false`                  |
| `CORS_ORIGINS`, `PUBLIC_WEB_URL`                              | URL do front             |
| `COGNITO_REGION`, `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID` | do módulo `auth`         |
| `DATABASE_URL_SSM_PARAMETER`                                  | `/traceflow/prod/db/url` |
| `DATABASE_POOL_MAX`                                           | `2`                      |
| `S3_BUCKET`, `S3_REGION`                                      | bucket de arquivos       |
| `SNS_TOPIC_ARN`                                               | tópico de avisos         |
| `RECALL_STATE_MACHINE_ARN`                                    | state machine do recall  |

Opcionais com padrão: `RATE_LIMIT_PER_MINUTE` (300), `REQUEST_TIMEOUT_MS` (25000), `ATTACHMENT_MAX_BYTES` (10 MB), `ALERT_EXPIRY_DAYS` (30), `LOG_LEVEL` (`info`).

### 4.4 Alternativa: hospedar em contêiner (só se a AWS serverless for descartada)

O projeto já tem `apps/api/Dockerfile` (imagem de produção). Se a decisão for um servidor/VM ou ECS, o mínimo é:

```bash
docker build -f apps/api/Dockerfile -t traceflow-api:<versao> .
docker run -d --name traceflow-api -p 127.0.0.1:3000:3000 \
  -e NODE_ENV=production -e AUTH_MODE=cognito -e TRUST_PROXY=1 \
  -e COGNITO_REGION=<regiao> -e COGNITO_USER_POOL_ID=<pool> -e COGNITO_CLIENT_ID=<client> \
  -e CORS_ORIGINS=https://app.<seudominio> -e PUBLIC_WEB_URL=https://app.<seudominio> \
  -e DATABASE_URL='postgresql://...?...sslmode=verify-full' \
  -e S3_BUCKET=<bucket> -e S3_REGION=<regiao> \
  traceflow-api:<versao>
```

…com um proxy reverso HTTPS na frente (o `keepAliveTimeout` de 65 s já está ajustado para balanceadores com 60 s) e as migrations aplicadas com `pnpm --filter @traceflow/api db:deploy`. Esse caminho **não** está automatizado no repositório (exceto o módulo `ecs-alternative`, apenas validado) e exigiria adaptar o CI/CD. Não recomendado sem necessidade.

---

## 5. Segurança antes da publicação

Marque cada item no ambiente publicado.

**Segredos e credenciais**

- [ ] Nenhum segredo real no repositório (verificado em 18/10/2026: só valores de desenvolvimento do MinIO/Postgres local em `.env.example` e `docker-compose.yml`). Repetir: `git grep -nIE "AKIA[0-9A-Z]{16}|BEGIN (RSA|EC|OPENSSH) PRIVATE"`.
- [ ] `terraform.tfvars`, `*.tfstate` e `.env*` fora do git (`git status` limpo).
- [ ] Bucket de state privado, versionado, com acesso só de administradores.
- [ ] `TF_VARS` do GitHub sem segredos.
- [ ] Credenciais de administrador AWS usadas só no primeiro apply; depois, OIDC.

**Permissões de acesso**

- [ ] MFA no root e nos administradores AWS; MFA (TOTP) recomendado aos administradores do TraceFlow.
- [ ] Usuários criados com o menor perfil necessário; grupos do Cognito iguais ao `role` no banco.
- [ ] Environment `production` do GitHub com revisores obrigatórios e restrito a `main`/`v*`.
- [ ] Role de deploy restrita ao repositório (já no Terraform); ela tem `PowerUserAccess` — aceito e documentado em [deploy.md](deploy.md#segurança-achados-aceitos).

**Proteção de endpoints**

- [ ] `GET <api_url>/docs` responde 404 (Swagger desligado).
- [ ] `GET <api_url>/v1/dev/users` responde 404 (login simulado inexistente em produção).
- [ ] `GET <api_url>/v1/products` sem token responde 401.
- [ ] Usuário de uma empresa recebe 404 ao abrir o ID de um registro de outra.
- [ ] Throttling do API Gateway ativo (20 req/s, rajada 50) e rate limit da API (300/min por IP; 30/min na página pública). Lembrete: o rate limit da API é por instância.

**Validação e sanitização de entradas**

- [ ] Coberto por testes (DTOs, CPF/CNPJ, limites de 1 MB no corpo e 2 MB/5.000 linhas no CSV, neutralização de fórmulas nos CSV exportados). Nenhuma ação extra além da validação funcional.

**Dependências vulneráveis**

- [ ] `pnpm audit --prod` revisado. Resultado em 18/10/2026: 7 achados (4 altos, 3 moderados) — `lodash`, `mysql2` e `deepmerge-ts` via CLI do Prisma; `braces` via CLI do shadcn. São ferramentas de linha de comando, não código servido ao usuário (a Lambda é empacotada com esbuild só com o que é importado), mas devem ser atualizadas.
- [ ] Dependabot ativo (`.github/dependabot.yml`).

**Exposição de portas e serviços**

- [ ] RDS: porta 5432 aberta só para as faixas de `database_public_cidrs` (modo público) e TLS obrigatório; ou `private_networking = true`. Confirmar o security group no console.
- [ ] Buckets S3 com _Block Public Access_; front só via CloudFront (OAC).
- [ ] Nenhum contêiner/porta de desenvolvimento (MinIO, Postgres local) exposto em servidores.

**HTTPS e cabeçalhos**

- [ ] Front e API só em HTTPS; certificado válido no domínio próprio (se houver).
- [ ] Cabeçalhos do CloudFront presentes (`strict-transport-security`, `x-content-type-options`, `x-frame-options`/`frame-ancestors`): `curl -sI <web_url>`.
- [ ] CSP ativa e testada (etapa 12).

**Proteção de dados pessoais (LGPD)**

- [ ] Inventário dos dados pessoais: CPF e nome de produtores pessoa física, contatos de clientes, e-mail/nome de usuários, IP na trilha de auditoria.
- [ ] Aviso/política de privacidade e base legal definidos (não existem no projeto).
- [ ] Procedimento para pedidos de titulares (acesso, correção, anonimização). Hoje não há exclusão: o histórico é imutável por exigência de rastreabilidade — documente essa justificativa.
- [ ] Página pública verificada: sem nome pessoal do produtor, documentos, quantidades ou clientes (coberto por teste e conferido na captura do manual).

**Backups e recuperação**

- [ ] Backup automático ativo (7 dias) e teste de restauração no RDS feito (etapa 15).
- [ ] Proteção contra exclusão ativa no RDS, Cognito e bucket de arquivos (`db_deletion_protection = true`).

**Logs**

- [ ] Logs sem senha/token: cabeçalhos `authorization` e `cookie` são mascarados. Conferir uma amostra no CloudWatch após o primeiro login.
- [ ] Nenhum `LOG_LEVEL=debug`/`trace` em produção.

---

## 6. Plano de testes e validação final

### 6.1 Verificações executadas nesta análise (18/10/2026, máquina local, commit `de13181`)

| Verificação               | Comando                                                                    | Resultado real                                                                                                                                                              |
| ------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Formatação                | `pnpm format:check`                                                        | Código da aplicação sem problemas (o único aviso foi o próprio manual recém-criado, corrigido em seguida)                                                                   |
| Lint                      | `pnpm lint`                                                                | ✅ Sem erros                                                                                                                                                                |
| Tipos                     | `pnpm typecheck`                                                           | ✅ Sem erros                                                                                                                                                                |
| Build                     | `pnpm build`                                                               | ✅ API e web compilados                                                                                                                                                     |
| Testes                    | `pnpm test`                                                                | ✅ API: 23 arquivos, **264 testes** passando (Postgres 17 real via Testcontainers). Web: 8 arquivos, **41 testes** passando                                                 |
| Dependências              | `pnpm audit --prod`                                                        | ⚠️ 7 vulnerabilidades (4 altas, 3 moderadas) em ferramentas transitivas (detalhe na seção 5)                                                                                |
| Health/readiness          | `curl /v1/health/ready` (API local)                                        | ✅ `{"status":"ok","database":"up"}`                                                                                                                                        |
| Navegação real            | Playwright em todas as telas, com 3 perfis, desktop, celular e tema escuro | ✅ Fluxos completos funcionando; nenhum erro de JavaScript; único erro de rede foi um 403 esperado (operador abrindo Auditoria). Defeitos de formatação listados na etapa 1 |
| Backup/restauração lógica | `pg_dump -Fc` + `pg_restore` num banco novo                                | ✅ Mesmas contagens (8 lotes, 19 movimentações, 30 registros de auditoria, 4 migrations) e os 4 gatilhos de imutabilidade restaurados                                       |
| CI no GitHub              | `gh run list`                                                              | ✅ Último run da `main` com sucesso; ⚠️ a branch `feat/improvements` tem um run com falha (testes de navegador)                                                             |

**Não executado nesta análise** (depende de conta AWS): `terraform plan/apply`, login Cognito, Lambdas na AWS, Step Functions, SNS, restauração no RDS, teste de carga.

Ambiente usado: Postgres e MinIO em contêineres **isolados e descartáveis** (portas 55432 e 59000), API e front locais, dados fictícios — o ambiente de desenvolvimento compartilhado não foi alterado.

### 6.2 Roteiro de validação no ambiente publicado

Execute na ordem e registre data, responsável e resultado.

**A. Inicialização**

1. `curl -s <api_url>/v1/health/ready` → `{"status":"ok","database":"up"}`.
2. Logs da Lambda da API sem a mensagem de avisos de produção (`CORS_ORIGINS contains local origins`, `SWAGGER_ENABLED=true`, `TRUST_PROXY=0`).
3. Front abre sem o selo "Ambiente de desenvolvimento".

**B. Login, permissões e sessões**

1. Login de um admin pelo Cognito; troca de senha temporária; cabeçalho mostra a empresa.
2. Logout volta para a tela de entrada; botão voltar do navegador não reabre dados.
3. Usuário operador: não vê Auditoria nem Importação; não consegue estornar.
4. Usuário auditor: só leitura; Recebimento mostra aviso.
5. Endpoints da [seção 5](#5-segurança-antes-da-publicação) (Swagger, `/v1/dev`, sem token) com as respostas esperadas.
6. (Se houver duas empresas) um ID de registro da empresa A aberto pela empresa B → "Registro não encontrado".

**C. Fluxos principais** (com dados de teste identificados como tal)

1. Cadastros: 1 produto verde, 1 torrado, 1 fornecedor, 1 cliente, 2 locais (ou importação CSV com dry run).
2. Recebimento → lote criado com código e saldo.
3. Transferência; tentativa de saída acima do saldo (deve ser recusada); estorno.
4. Produção (torra) com rendimento calculado; expedição para o cliente.
5. Rastreabilidade para trás e para frente.
6. Anexo: upload de um PDF e download.
7. Etiqueta: PDF abre; QR code lido no celular abre a página pública **no domínio definitivo**.
8. NC: abrir (lote vai para quarentena) e liberar.
9. Recall: simular; executar **apenas em dados de teste**; etapas concluídas; PDF do relatório; e-mail de aviso recebido; encerrar; liberar os lotes.
10. Relatórios: baixar os 4 CSV e abrir no Excel.
11. Auditoria mostra as ações acima com antes/depois.

**D. Persistência e integridade**

1. Recarregar páginas e conferir saldos.
2. Repetir um envio após simular queda de rede (a idempotência evita duplicidade).

**E. Integrações e jobs**

1. Recall com Step Functions: execução visível no console, estado `SUCCEEDED`.
2. Alerta de validade: invocar a Lambda `expiry-alert` manualmente e conferir o e-mail.
3. Alarme de teste (etapa 14) chega por e-mail.

**F. Tratamento de falhas**

1. Erro 4xx mostra mensagem em português; erro 5xx mostra "ID da requisição" que pode ser localizado no CloudWatch.

**G. Logs**

1. Uma requisição localizada pelo `requestId`; nenhuma linha com token ou senha.

**H. Backup e restauração**

1. Etapa 15 concluída, com tempo de restauração anotado.

**I. Desempenho (proporcional ao porte)**

1. Painel, lista de lotes e rastreabilidade abrem em menos de 3 s após o _cold start_.
2. Teste de carga leve, por exemplo com [k6](https://k6.io) ou `hey`, em `GET /v1/health/ready` e numa listagem autenticada: 10 usuários simultâneos por 2 minutos, sem 5xx e p95 < 1 s. Lembre-se do limite do API Gateway (20 req/s) e da concorrência reservada (5).

### 6.3 Critérios objetivos para liberar ou bloquear

**Liberar** somente se:

- todos os itens de A, B, C (exceto execução real de recall, se não houver dados de teste), E.1, F e G passarem;
- a restauração no RDS (H) tiver sido testada com sucesso;
- não houver alarme em estado `ALARM` e nenhum 5xx no dashboard durante a validação;
- os itens **Obrigatória** e **Alta** da [seção 2](#2-checklist-do-que-falta-para-produção) estiverem concluídos ou formalmente aceitos como risco por quem responde pelo sistema.

**Bloquear** se qualquer um ocorrer: falha de login; dados de uma empresa visíveis para outra; saldo negativo ou movimentação editável; migrations com erro; restauração não testada; e-mails de alarme não chegando; PDF do recall com quantidades ambíguas (até a correção da etapa 1).

---

## 7. Plano de publicação e rollback

### 7.1 Primeira versão

1. Etapas 1 a 15 concluídas; tag `v1.0.0` criada a partir da `main` aprovada.
2. Snapshot manual do RDS (etapa 15) — na primeira versão o banco estará vazio, mas o hábito começa aqui.
3. Deploy pelo workflow (etapa 13) com aprovação manual.
4. Validação final (seção 6) **antes** de comunicar os usuários.
5. Comunicação aos usuários com o endereço, o manual e o canal de suporte.

### 7.2 Como saber se a publicação funcionou

- Workflow _Deploy_ verde, incluindo o passo de migrations (`FunctionError` = `None`).
- `/v1/health/ready` OK; dashboard sem 5xx; alarmes em `OK`.
- Login e um fluxo curto (consultar lotes) funcionando no navegador.

### 7.3 Acompanhamento de erros

- Dashboard CloudWatch (`dashboard_url`) e e-mails de alarme.
- CloudWatch Logs Insights pelo `requestId` informado pelo usuário.
- Fila DLQ dos jobs (`dlq-messages` alarma quando há mensagens).

### 7.4 Interromper a liberação

- **Durante o deploy:** não aprove o job `deploy` (ou cancele o workflow). O `plan` não altera nada.
- **Depois do deploy:** se o problema for no front, republique a versão anterior (7.5); se for grave na API e não houver correção rápida, reduza a exposição — por exemplo, `aws lambda put-function-concurrency --function-name traceflow-prod-api --reserved-concurrent-executions 0` deixa a API fora do ar de forma controlada (as telas passam a mostrar erro com "Tentar novamente"; avise os usuários antes) enquanto se faz o rollback. Reverta depois com `delete-function-concurrency` ou um novo deploy.

### 7.5 Voltar à versão anterior

- **Código (API, jobs e front):** _Actions → Deploy → Run workflow → Use workflow from:_ a tag anterior (ex.: `v1.0.0`). Lambdas e front voltam ao código daquela tag.
- **Banco:** migrations só avançam. Uma migration com erro é revertida (roda em transação) e o deploy para antes de publicar o front. Para desfazer uma mudança de esquema já aplicada, crie **uma nova migration** que a reverta.
- **Dados corrompidos:** _point-in-time restore_ para uma **nova** instância (etapa 15); depois, atualize o parâmetro SSM `/traceflow/prod/db/url` com o novo endpoint e force um novo deploy (as Lambdas leem o SSM no início).
- **Infraestrutura:** `git revert` do commit Terraform + novo deploy.

### 7.6 Evitar perda de dados na reversão

- Snapshot manual antes de **todo** deploy que tenha migration.
- Migrations **aditivas** (adicionar colunas/tabelas; remover só numa versão posterior, quando nenhuma versão em uso depender delas). Assim, voltar o código para a tag anterior não quebra o banco.
- Restauração sempre em **nova** instância: compare antes de trocar o endpoint.
- Nunca use `terraform destroy` ou `db_deletion_protection = false` em produção sem um snapshot.

### 7.7 Atualizações futuras

1. Branch por tarefa → PR → CI verde → merge na `main`.
2. Atualizar `docs/progresso.md` e, se houver decisão, um ADR.
3. `git tag v1.x.y && git push origin v1.x.y`.
4. Revisar o log do `plan` → aprovar → acompanhar migrations e publicação.
5. Validação curta (seção 6, itens A, B.1 e um fluxo de C).
6. Se algo der errado: 7.4 e 7.5.

---

## 8. Estimativa e priorização

### 8.1 Obrigatório antes da publicação

1. Correção do PDF do recall (etapa 1).
2. Decisões: conta AWS, região, e-mails de alerta, domínio (etapa 2).
3. Conta AWS segura, state remoto, variáveis (etapas 3–5).
4. Primeiro apply, migrations, front, usuários (etapas 6–10).
5. Login Cognito validado e CSP ativada (etapas 10 e 12).
6. GitHub Actions configurado (etapa 13).
7. Alarmes chegando por e-mail (etapa 14).
8. Restauração testada no RDS (etapa 15).
9. Validação final aprovada (seção 6).
10. Aviso de privacidade e canal de suporte definidos.

### 8.2 Recomendado, mas pode vir depois

- Domínio próprio (obrigatório **antes** de imprimir etiquetas em volume).
- `private_networking = true` (RDS privado).
- Alarme de espaço livre do RDS no Terraform.
- Atualizar dependências apontadas pelo `pnpm audit` e mover CLIs para `devDependencies`.
- Testes automatizados de anexos/etiqueta, handler da Lambda e navegador na CI.
- Tela de gestão de usuários; e-mail aos clientes no recall; avisos por empresa.
- Amazon SES para os e-mails do Cognito (se houver muitos usuários).
- Retenção de logs maior, WAF, Multi-AZ (custos adicionais).
- Pequenos defeitos de texto (etapa 1, itens b e c).

### 8.3 Dependências entre tarefas

```
Decisões (2) ─┬─▶ Conta AWS (3) ─▶ State (4) ─▶ Variáveis (5) ─┐
              │                                                 ├─▶ Apply (7) ─┬─▶ Migrations (8) ─▶ Usuários (10) ─▶ Login OK ─▶ CSP (12)
Correções (1) ┴─▶ Pacotes Lambda (6) ───────────────────────────┘              ├─▶ Front (9)
                                                                               ├─▶ GitHub Actions (13)
                                                                               ├─▶ Monitoramento (14)
                                                                               └─▶ Domínio/HTTPS (11) ─▶ etiquetas
Migrations (8) ─▶ Backup/restauração (15) ─▶ Validação final (16) ─▶ Publicação (17)
```

### 8.4 Estimativa de esforço (**estimativa**, para uma pessoa com experiência intermediária em AWS)

| Etapa                                                                                      | Esforço estimado                          |
| ------------------------------------------------------------------------------------------ | ----------------------------------------- |
| 1. Correções na aplicação                                                                  | 2–4 h                                     |
| 2. Decisões pendentes                                                                      | 1–2 h (fora o tempo de aprovação interna) |
| 3. Conta AWS e ferramentas                                                                 | 1–2 h                                     |
| 4–5. State e variáveis                                                                     | 1 h                                       |
| 6–7. Pacotes e primeiro apply (incluindo ajustes finos de um primeiro apply nunca testado) | 3–6 h                                     |
| 8–10. Migrations, front, usuários                                                          | 1–2 h                                     |
| 11. Domínio e HTTPS                                                                        | 1–2 h (+ propagação de DNS)               |
| 12. CSP e revisão de segurança                                                             | 2–3 h                                     |
| 13. GitHub Actions                                                                         | 1 h                                       |
| 14. Monitoramento                                                                          | 1 h                                       |
| 15. Teste de restauração                                                                   | 1–2 h (inclui espera do RDS)              |
| 16. Validação final                                                                        | 3–4 h                                     |
| Privacidade/LGPD (texto e procedimento, com apoio jurídico)                                | variável                                  |
| **Total técnico**                                                                          | **cerca de 3 a 5 dias úteis**             |

Custo de infraestrutura esperado (do [deploy.md](deploy.md#custos)): ~US$ 0–1/mês no free tier; ~US$ 18–20/mês depois (quase tudo RDS); +~US$ 22/mês com rede privada.

### 8.5 Critérios finais de "pronto para produção"

- [ ] Correção do PDF do recall publicada.
- [ ] Infraestrutura criada pelo Terraform, com state remoto e proteção contra exclusão.
- [ ] Migrations aplicadas; `/v1/health/ready` OK.
- [ ] Login Cognito, troca de senha e logout funcionando; perfis conferidos.
- [ ] Isolamento entre empresas conferido no ambiente publicado (se houver mais de uma).
- [ ] Fluxo completo (cadastro → recebimento → produção → expedição → rastreio → etiqueta → NC → recall simulado) validado.
- [ ] Anexos, etiqueta e relatório do recall abrindo do S3.
- [ ] CSP ativa sem quebrar o login.
- [ ] E-mails do SNS confirmados e alarme de teste recebido.
- [ ] Restauração no RDS testada e tempo anotado.
- [ ] Deploy pelo GitHub Actions com aprovação manual funcionando; rollback ensaiado ao menos uma vez.
- [ ] Domínio definitivo decidido antes da impressão de etiquetas.
- [ ] Aviso de privacidade, procedimento LGPD e canal de suporte definidos.
- [ ] Manual do cliente entregue aos usuários.

---

## 9. Apêndice: decisões pendentes e glossário

### 9.1 Decisões pendentes

| Decisão           | Opções viáveis                                                                                                            | Recomendação                                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Conta AWS         | Conta nova (free tier) ou conta existente da empresa                                                                      | Conta dedicada, para isolar custos e permissões                                                               |
| Região            | `us-east-1` (padrão do projeto) ou `sa-east-1` (São Paulo, menor latência, mais cara, sem alguns benefícios do free tier) | `us-east-1`, como projetado; mudar exige revisar custos e o certificado do CloudFront (sempre em `us-east-1`) |
| Domínio           | Domínio próprio (`app.<empresa>.com.br`) ou domínio do CloudFront                                                         | Domínio próprio antes de imprimir etiquetas                                                                   |
| Rede do banco     | Público com TLS (custo ~zero) ou privado (~US$ 22/mês)                                                                    | Público com TLS para começar, se aceito pelo responsável; privado quando houver orçamento ou exigência        |
| E-mails de alerta | Uma caixa compartilhada da equipe técnica                                                                                 | Caixa monitorada (não pessoal)                                                                                |
| Hospedagem        | AWS serverless (pronto) ou contêiner (Dockerfile pronto, sem CI/CD)                                                       | AWS serverless                                                                                                |
| Suporte           | E-mail, telefone, sistema de chamados                                                                                     | Definir e publicar no manual                                                                                  |
| Privacidade       | Texto próprio ou jurídico externo                                                                                         | Revisão jurídica                                                                                              |

### 9.2 Glossário rápido

| Termo                   | Significado                                                                |
| ----------------------- | -------------------------------------------------------------------------- |
| **Terraform / IaC**     | Ferramenta que cria a infraestrutura a partir de arquivos de código        |
| **State**               | Arquivo onde o Terraform guarda o que já criou                             |
| **Lambda**              | Função executada sob demanda pela AWS (sem servidor para administrar)      |
| **API Gateway**         | Porta de entrada HTTPS da API na AWS                                       |
| **RDS**                 | Banco PostgreSQL gerenciado pela AWS                                       |
| **Cognito**             | Serviço de login e usuários da AWS                                         |
| **S3 / CloudFront**     | Armazenamento de arquivos / rede de distribuição que serve o front         |
| **SSM Parameter Store** | Cofre de configurações e segredos da AWS                                   |
| **SNS**                 | Serviço de envio de avisos (aqui, por e-mail)                              |
| **Step Functions**      | Orquestrador de etapas (usado no recall)                                   |
| **DLQ**                 | Fila onde ficam as tarefas que falharam, para análise                      |
| **OIDC**                | Forma de o GitHub Actions acessar a AWS sem guardar chaves                 |
| **PITR**                | _Point-in-time restore_: restaurar o banco num instante dos últimos 7 dias |
| **CSP**                 | Política que diz ao navegador de onde a página pode carregar recursos      |
| **Migration**           | Script versionado que altera a estrutura do banco                          |
