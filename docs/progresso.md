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

## Semana 2 — Lotes, movimentações e estoque

> A pedido, a Semana 2 foca na implementação: **testes ficam para uma etapa posterior** (lista abaixo).

| #   | Etapa                                                              | Status       |
| --- | ------------------------------------------------------------------ | ------------ |
| 1   | Schema: lotes, razão, sequência de códigos, trigger, FKs compostas | ✅ concluída |
| 2   | Recebimento, lotes e status                                        | ✅ concluída |
| 3   | Movimentações, saldo com FOR UPDATE, estorno, idempotência, /stock | ✅ concluída |
| 4   | Anexos com S3 (MinIO local)                                        | ✅ concluída |
| 5   | Telas de lotes, recebimento e movimentações                        | ✅ concluída |

**Testes (Semana 2):** ✅ feitos na rodada de testes (ver Registro), exceto anexos. Lista original: saídas simultâneas no mesmo lote (só passam as que cabem no saldo), corrida de `Idempotency-Key`, trigger de imutabilidade, códigos de lote sob concorrência, regras de status/direção por tipo, isolamento entre empresas nos novos recursos, anexos.

## Semana 3 — Produção, expedição e rastreabilidade (MVP v0.1)

| #   | Etapa                                                                | Status       |
| --- | -------------------------------------------------------------------- | ------------ |
| 1   | Schema: ordens de produção, genealogia, expedição, sequências, token | ✅ concluída |
| 2   | Produção em transação (beneficiamento, torra, blend, embalagem)      | ✅ concluída |
| 3   | Rastreabilidade para trás e para frente (`WITH RECURSIVE`)           | ✅ concluída |
| 4   | Expedição com baixa no razão (agente)                                | ✅ concluída |
| 5   | Etiqueta PDF com QR code e página pública de rastreio (agente)       | ✅ concluída |
| 6   | Telas de produção, expedição e árvore de rastreabilidade (agente)    | ✅ concluída |
| 7   | Teste de ponta a ponta do fluxo completo                             | ✅ concluída |
| 8   | Publicação: PR #2 (CI verde), tag `v0.1`                             | ✅ concluída |

**Testes (Semana 3):** ✅ feitos na rodada de testes, exceto a geração da etiqueta (precisa de bucket). Lista original: produção concorrente sobre o mesmo insumo, grafo em diamante e limite de profundidade, isolamento por empresa nas consultas recursivas, expedição concorrente, página pública (nenhum dado sensível, rate limit), etiqueta.

## Semanas 4 a 6 — Pronto para produção

Feito de forma autônoma, em paralelo, a pedido ("aplicação pronta para entrar em produção amanhã, front profissional, sem foco em testes").

| #   | Frente                                                                                                                   | Status       |
| --- | ------------------------------------------------------------------------------------------------------------------------ | ------------ |
| 1   | API: recall orquestrado (simular, executar, relatório PDF, notificar), não conformidade, alertas de validade, auditoria  | ✅ concluída |
| 2   | API: painel, relatórios CSV, importação CSV, rate limit, proxy, limites, checagens de produção, códigos de erro estáveis | ✅ concluída |
| 3   | Infra: Lambda + bundle esbuild, Terraform (12 módulos, só validate), deploy por OIDC, runbook, ADRs 0010–0011            | ✅ concluída |
| 4   | Front profissional: painel, modo escuro, menu móvel, máscaras, fichas só-leitura, páginas de erro, code splitting        | ✅ concluída |
| 5   | Telas de recall, qualidade, auditoria, alertas, relatórios e importação                                                  | ✅ concluída |
| 6   | Entrada em produção: checklist em [go-live.md](go-live.md)                                                               | ✅ concluída |

**Nada foi aplicado na AWS** — o primeiro `terraform apply` é um passo humano ([go-live.md](go-live.md)).

**Testes (Semanas 4–6):** ✅ feitos na rodada de testes, exceto Lambda handler e job de migrations. Lista original: recall (impacto, bloqueio, retomada idempotente das etapas, recall concorrente no mesmo lote), descarte de NC (baixa de todo o saldo), auditoria (append-only, interceptor sem duplicar), importação (tudo ou nada, duplicados), relatórios CSV (escape contra fórmula), rate limit, Lambda handler e job de migrations.

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

### Semana 2 — Etapas 1 a 3 (API de estoque)

- Lotes com dados de qualidade (safra, variedade, altitude, peneira, umidade, torra, pontuação SCA) e status.
- Razão `stock_movements` só de inclusão (trigger + extensão de tenant), estorno por nova linha, `CHECK`s de quantidade e locais.
- `SELECT ... FOR UPDATE` no lote dentro de `TenantPrismaService.transaction()`, que dá ao `tx` um `sql()` com a empresa do contexto.
- Código de lote atômico por empresa/ano; idempotência por header com hash do corpo; problemas de domínio com `type` próprio (RFC 9457).
- Rotas: `/receipts`, `/lots`, `/movements`, `/stock` — ver [estoque.md](estoque.md) e [ADR 0007](adr/0007-razao-de-estoque.md).
- Verificação manual no banco de desenvolvimento: recebimento, repetição idempotente (e 422 com outro corpo), transferência, saldo insuficiente (409 com disponível), estorno (e 409 ao repetir), quarentena bloqueando saída, trigger recusando UPDATE direto no psql.

### Semana 2 — Etapa 4 (anexos, agente em paralelo)

- Upload por **presigned POST** (limite exato de tamanho e tipo) direto no S3; `confirm` verifica com `HEAD`; download por URL pré-assinada. Ver [anexos.md](anexos.md).
- Local: MinIO no docker-compose (`pnpm storage:up`), imagens da comunidade `pgsty/minio` (a MinIO parou de publicar imagens oficiais).
- Sem `S3_BUCKET` a API sobe normalmente e as rotas de anexo respondem 503.
- `pnpm openapi` agora funciona sem `.env` (`openapi-env.ts` importado primeiro).

### Semana 2 — Etapa 5 (telas, agente em paralelo)

- Recebimento, Lotes (validade vencida/vencendo destacada), detalhe do lote (saldo por local, histórico com estorno, anexos, ações por perfil), Estoque e Movimentações. Ver [web.md](web.md).
- Idempotency-Key gerada por tentativa de envio; quantidades exibidas em pt-BR e enviadas como decimal com ponto.
- Verificado no navegador contra a API real: recebimento, transferência, saldo insuficiente (checagem no cliente e 409 da API), saída, estorno, bloqueio, edição, upload de PDF, perfis de operador e auditor.
- Ajustes na API durante a integração: `lotStatus` no problema `lot-not-movable` (antes `status`, sobrescrito pelo código HTTP) e `unit` em `MovementResponse`.

**Semana 2 concluída (2026-10-15), sem testes automatizados novos (a pedido).**

### Semana 3 — Produção, genealogia e rastreabilidade

- `POST /production-orders` executa a etapa numa transação: consome os insumos travando-os em ordem fixa, cria o lote (código automático), registra `PRODUCTION` e grava `lot_origins`. Rendimento e perda em kg (1 saca = 60 kg); saída maior que a entrada é recusada; safra/variedade herdadas quando todos os insumos coincidem. Ver [producao-rastreabilidade.md](producao-rastreabilidade.md) e [ADR 0008](adr/0008-genealogia-e-rastreio-recursivo.md).
- Rastreio `GET /lots/:id/trace/backward|forward` com `WITH RECURSIVE` (proteção contra ciclos, limite de profundidade, `truncated`); para frente inclui expedições e clientes — base do recall.
- Expedição (agente): cada item é uma saída do razão, tudo numa transação, travas em ordem fixa, idempotência. Ver [expedicao.md](expedicao.md).
- Etiqueta e página pública (agente): PDF 100×150 mm com QR para `/rastreio/{token}`; token aleatório gerado na primeira etiqueta; a página pública não expõe nome pessoal do produtor, documentos, quantidades nem clientes; rate limit de 30 req/min. Ver [etiqueta-pagina-publica.md](etiqueta-pagina-publica.md).
- Telas (agente): produção com prévia de rendimento, expedição, árvore visual de rastreabilidade (para trás até as fazendas, para frente até os clientes).
- Lacunas da API fechadas: busca de lotes por produto/fornecedor, ordenação e filtro por usuário nas movimentações, ordenação e `id` de linha no estoque.
- Bug encontrado na verificação manual: lotes produzidos perdiam safra/variedade herdadas (campos `undefined` do DTO sobrescreviam a herança) — corrigido.
- Teste de ponta a ponta (`apps/api/test/full-flow.e2e-spec.ts`): fazenda → torra → blend → expedição → rastreio nos dois sentidos → invisível a outra empresa → razão e genealogia imutáveis.
- Publicação: PR #1 (Semana 1) e PR #2 (Semanas 2 e 3) com CI verde; tag `v0.1`.

**Semana 3 concluída (2026-10-15) — MVP v0.1.**

### Semanas 4–6 — Pronto para produção

- **Recall** ([recall-qualidade-auditoria.md](recall-qualidade-auditoria.md), [ADR 0009](adr/0009-recall-orquestrado.md)): simulação sem escrita; execução em etapas idempotentes (bloquear lotes → relatório PDF → notificar), local no processo ou por Step Functions na AWS; retomada após falha; lote em recall aberto não volta a disponível.
- **Qualidade**: não conformidade abre quarentena; liberar (admin) ou descartar (baixa de todo o saldo por ajuste).
- **Auditoria**: `audit_logs` só de inclusão, com antes/depois nas operações críticas e interceptor para o resto.
- **Alertas de validade**: rota e job diário (EventBridge Scheduler).
- **Painel, relatórios CSV (Excel pt-BR, à prova de fórmula) e importação CSV** (pré-visualização, tudo ou nada) — [relatorios-importacao.md](relatorios-importacao.md).
- **Segurança de produção** ([seguranca.md](seguranca.md)): rate limit global, `trust proxy`, limites de corpo, timeout, helmet, CORS estrito, checagens do env em produção (sem mock, sem Swagger), códigos de erro estáveis.
- **Infra** ([deploy.md](deploy.md), ADRs [0010](adr/0010-rede-e-custos-aws.md) e [0011](adr/0011-lambda-esbuild-migrations.md)): Lambda + API Gateway, RDS `t4g.micro`, Cognito, S3 + CloudFront (OAC), Step Functions, SNS, Scheduler, CloudWatch, OIDC; módulo ECS + ALB + WAF só validado. Custo ~US$ 0–1/mês no free tier.
- **Front profissional** ([web.md](web.md)): painel, modo escuro sem flash, menu móvel, `PageHeader` em todas as páginas, fichas só-leitura, máscaras, páginas de erro e 404, sessão expirada com retorno à página, code splitting (pacote inicial de 216 kB → 72 kB).
- **Integração**: nomes de variáveis alinhados entre app e Terraform (`SNS_TOPIC_ARN`, `TRUST_PROXY=1`); a máquina de estados do recall para quando uma etapa devolve `FAILED`.

### QA no navegador (Playwright, Chrome real)

- Varredura de 44 visitas (27 rotas em desktop claro, 7 no escuro, 9 no celular + página pública): **sem erros de console, exceções, HTTP 4xx/5xx inesperados nem rolagem horizontal**.
- Fluxos executados pela interface: cadastros com máscara de CPF e isolamento entre empresas; recebimento, transferência, saldo insuficiente (cliente e API), saída, estorno, bloqueio, edição, anexo; produção (torra) com prévia de rendimento; expedição; rastreio para trás e para frente; etiqueta, relatório do recall e anexo abrindo PDF de verdade; recall simulado → executado → encerrado; não conformidade aberta → liberada; auditoria com diff; CSV; importação com erro; perfis operador e auditor; menu móvel, tema persistente, logout e retorno à página.
- Corrigido nesta rodada: aviso de lote bloqueado/em quarentena e "Movimentar" desativado em lote bloqueado, fonte monoespaçada (Geist Mono), layout do detalhe do recall, plurais ("lote(s)" → concordância real), rótulos da auditoria.
- Limitação: o MCP do Playwright só carrega numa sessão nova do Claude Code; a QA usou o Playwright (playwright-core) diretamente contra a aplicação.

### Rodada de testes das regras críticas

API: de 175 para **264 testes** (Postgres real via Testcontainers), em `apps/api/test/`:

| Arquivo                          | O que garante                                                                                                                                                                                                                        |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `stock-concurrency.e2e-spec.ts`  | 10 saídas simultâneas → só as que cabem; lote consumido uma vez; `Idempotency-Key` simultânea e reaproveitada; estorno em corrida; códigos de lote; razão e auditoria append-only                                                    |
| `stock-rules.e2e-spec.ts`        | direção por tipo, ajuste só admin e com motivo, status (bloqueado, quarentena, consumido), perfis, estornos                                                                                                                          |
| `tenancy-resources.e2e-spec.ts`  | outra empresa: 404 em leituras e escritas de lote, rastreio, movimentação, produção, expedição, NC, recall; listas, painel, auditoria e CSV sem vazamento                                                                            |
| `production-trace.e2e-spec.ts`   | torras e expedições concorrentes, travas em ordem cruzada sem deadlock, expedição tudo ou nada, diamante, limite de 20 níveis, página pública (sem dados sensíveis, 404, rate limit)                                                 |
| `recall-quality.e2e-spec.ts`     | recall bloqueia origem e derivados, um recall aberto por lote (concorrente), retomada sem refazer etapas, encerramento e liberação; NC (quarentena, descarte em todos os locais, resolução única em corrida); auditoria sem duplicar |
| `imports-reports.e2e-spec.ts`    | importação tudo ou nada, duplicados no arquivo e no banco, importações simultâneas, só admin; CSV com fórmula neutralizada                                                                                                           |
| `tenant-transaction.e2e-spec.ts` | `tx.sql()` roda na própria transação com 12 transações simultâneas de duas empresas                                                                                                                                                  |

**Bugs encontrados e corrigidos:**

- **Crítico — `tx.sql()` na transação errada sob concorrência.** O `Object.assign(tx, { sql })` alterava um objeto compartilhado entre as transações do Prisma estendido: com requisições simultâneas, o `SELECT ... FOR UPDATE` e o cálculo de saldo de uma requisição rodavam na transação de outra (até de outra empresa). Efeitos observados: 404 "Lot not found" em recebimentos simultâneos, timeouts e 500 em estornos concorrentes — e a garantia de saldo nunca negativo deixava de valer sob carga. Corrigido com um `Proxy` (sem alterar o `tx`) e teste de regressão.
- `ConditionalModule` do login simulado com prazo de 5 s contado desde o import: com imports lentos (cold start, CI) o timer derrubava o processo com exceção não tratada. Prazo de 60 s.
- Falha de rede numa etapa do recall gravava `lastError` vazio ("REPORT: "): `AggregateError` não tem mensagem. Agora usa as mensagens internas ou o código do erro.
- Os testes liam o `.env` local (ex.: MinIO): agora, com `NODE_ENV=test`, só o ambiente explícito vale — igual à CI.

**Ainda sem teste automatizado:** anexos e etiqueta (precisam de bucket S3/MinIO no teste), Lambda handler e job de migrations, testes de navegador na CI.

## Próximos passos

- Seguir o checklist de [go-live.md](go-live.md) (passos na conta AWS são humanos).
- Testes que faltam: anexos/etiqueta com MinIO no Testcontainers, Lambda handler, Playwright na CI.
- Gravar o vídeo do MVP.
- Pendências conhecidas: mensagens de erro da API em inglês (o front traduz pelos códigos); CSP do front desligada até validar o login do Cognito; RDS público por custo (ADR 0010).
