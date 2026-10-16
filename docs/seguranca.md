# Segurança e produção

Código: `apps/api/src/bootstrap.ts`, `apps/api/src/security/`, `apps/api/src/config/env.ts` e `apps/api/src/common/http/problem-details.filter.ts`.

## Camada HTTP

| Proteção           | Como                                                                                                                                                                             |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rate limit global  | `@nestjs/throttler` como guard global: `RATE_LIMIT_PER_MINUTE` (padrão 300) requisições por minuto **por IP**. `/v1/health*` fica de fora. Excedeu → `429` (`TOO_MANY_REQUESTS`) |
| Rate limit público | A página pública de rastreio (`/v1/public/trace/:token`) mantém o limite próprio, mais estrito: 30/min por IP                                                                    |
| Proxy confiável    | `TRUST_PROXY` = número de proxies na frente (Express `trust proxy`). `0` local; **`1` atrás de API Gateway/ALB** — sem isso, IP de logs e rate limit seria o do proxy            |
| Tamanho do corpo   | JSON/form até **1 MB** (`413` acima disso). Importação CSV tem limite próprio de 2 MB, lido direto do stream                                                                     |
| Tempo máximo       | `REQUEST_TIMEOUT_MS` (padrão 25 s, abaixo dos 30 s do API Gateway) → `503` `REQUEST_TIMEOUT`. A transação em andamento não é cortada (continua atômica)                          |
| Helmet             | Headers de segurança (HSTS, `nosniff`, `frame-ancestors`, CORP…). Com Swagger desligado, CSP de API pura: `default-src 'none'; frame-ancestors 'none'`                           |
| CORS               | Só as origens de `CORS_ORIGINS` (lista separada por vírgula). Expõe `x-request-id`, `Content-Disposition`, `Idempotent-Replayed`, `Retry-After`, `X-Report-*`                    |
| `X-Powered-By`     | Desligado                                                                                                                                                                        |
| Swagger            | `SWAGGER_ENABLED`: padrão **ligado fora de produção e desligado em produção**                                                                                                    |
| Keep-alive         | No servidor Node (contêiner/ALB): `keepAliveTimeout` 65 s > idle timeout de 60 s do ALB, evitando 502 esporádicos                                                                |
| Desligamento       | `enableShutdownHooks()`: fecha o pool do Prisma no SIGTERM                                                                                                                       |

Limitações conhecidas:

- O rate limit é **em memória, por instância**. Na Lambda cada ambiente de execução tem seu contador: protege contra abuso simples, não contra ataque distribuído. Para isso, use o throttling do API Gateway (por rota/stage) e, se necessário, AWS WAF.
- Compressão de resposta não está ligada: na AWS o API Gateway/CloudFront pode comprimir, e a Lambda não ganha com isso.

## Validação do ambiente no boot

`validateEnv` (zod) derruba a API na subida se algo estiver errado:

| Regra (NODE_ENV=production)                                     | Efeito                      |
| --------------------------------------------------------------- | --------------------------- |
| `AUTH_MODE=mock`                                                | Erro                        |
| `AUTH_MODE=cognito` sem `COGNITO_REGION`/`COGNITO_USER_POOL_ID` | Erro (em qualquer ambiente) |
| `CORS_ORIGINS` com `*`                                          | Erro                        |
| `CORS_ORIGINS` com `localhost`/`127.0.0.1`                      | Aviso                       |
| `SWAGGER_ENABLED=true`                                          | Aviso                       |
| `TRUST_PROXY=0`                                                 | Aviso                       |

### Variáveis novas

| Variável                | Padrão  | Uso                                          |
| ----------------------- | ------- | -------------------------------------------- |
| `TRUST_PROXY`           | `0`     | Proxies confiáveis (1 atrás de API GW/ALB)   |
| `RATE_LIMIT_PER_MINUTE` | `300`   | Limite global por IP                         |
| `REQUEST_TIMEOUT_MS`    | `25000` | Tempo máximo por requisição                  |
| `SWAGGER_ENABLED`       | depende | `true` fora de produção, `false` em produção |

## Isolamento entre empresas (resumo)

Detalhes em [multi-tenancy.md](multi-tenancy.md).

- A empresa vem do usuário autenticado (banco), nunca do corpo ou de headers.
- Toda consulta passa pela extensão Prisma de tenant; SQL bruto só via `TenantPrismaService.sql(companyId => …)` — inclusive no dashboard e nos relatórios.
- Registro de outra empresa responde **404**, nunca 403.
- Importação CSV grava com `createMany` pelo mesmo cliente escopado: `companyId` é forçado pela extensão.

## Segredos

- Nada de segredo no código ou no repositório: `.env` é ignorado pelo git e `.env.example` só tem valores de desenvolvimento.
- Na AWS, `DATABASE_URL` e demais segredos vêm do **SSM Parameter Store** (`SecureString`) e são injetados como variáveis de ambiente da Lambda; credenciais do S3 vêm da role de execução (nunca chaves fixas).
- Tokens do Cognito são validados pela chave pública (JWKS) — a API não guarda senha de usuário.

## Códigos de erro estáveis

Toda resposta de erro é `application/problem+json` (RFC 9457) com `type` e um `code` curto e estável, para o front traduzir sem depender do texto em inglês de `detail`. O `code` é derivado do `type` (`/problems/insufficient-stock` → `INSUFFICIENT_STOCK`) ou, quando `type` é `about:blank`, do status HTTP.

| `code`                   | Status | Quando                                                       |
| ------------------------ | ------ | ------------------------------------------------------------ |
| `VALIDATION_ERROR`       | 400    | Campos inválidos (lista em `errors`)                         |
| `BAD_REQUEST`            | 400    | Requisição malformada (ex.: JSON inválido)                   |
| `UNAUTHORIZED`           | 401    | Token ausente ou inválido                                    |
| `FORBIDDEN`              | 403    | Perfil sem permissão                                         |
| `NOT_FOUND`              | 404    | Não existe (ou é de outra empresa)                           |
| `CONFLICT`               | 409    | Valor único repetido / conflito com registros relacionados   |
| `INSUFFICIENT_STOCK`     | 409    | Saldo insuficiente (`available`, `requested`, `location`)    |
| `LOT_NOT_MOVABLE`        | 409    | Lote em quarentena/bloqueado (`lot`, `lotStatus`)            |
| `LOT_CONSUMED`           | 409    | Operação inválida em lote consumido                          |
| `ALREADY_REVERSED`       | 409    | Movimentação já estornada (`reversalId`)                     |
| `INVALID_REVERSAL`       | 409    | Tentativa de estornar um estorno                             |
| `INVALID_MOVEMENT`       | 400    | Combinação de origem/destino/motivo inválida                 |
| `INACTIVE_PRODUCT`       | 409    | Produto inativo no recebimento                               |
| `INACTIVE_LOCATION`      | 409    | Local inativo na movimentação                                |
| `INACTIVE_CUSTOMER`      | 409    | Cliente inativo na expedição                                 |
| `INVALID_PRODUCTION`     | 400    | Etapa incompatível, saída maior que entrada etc.             |
| `INVALID_SHIPMENT`       | 400    | Expedição inválida                                           |
| `IDEMPOTENCY_KEY_REUSED` | 422    | Mesmo `Idempotency-Key` com outro corpo                      |
| `INVALID_IMPORT`         | 400    | CSV vazio ou malformado (`line`)                             |
| `IMPORT_TOO_LARGE`       | 413    | Mais de 5.000 linhas (`maxRows`)                             |
| `PAYLOAD_TOO_LARGE`      | 413    | Corpo acima do limite (1 MB JSON, 2 MB CSV)                  |
| `UNSUPPORTED_MEDIA_TYPE` | 415    | Importação sem `text/csv` nem multipart                      |
| `TOO_MANY_REQUESTS`      | 429    | Rate limit excedido                                          |
| `INTERNAL_SERVER_ERROR`  | 500    | Erro inesperado (sem detalhes internos)                      |
| `SERVICE_UNAVAILABLE`    | 503    | Dependência indisponível (ex.: banco no `/health/ready`, S3) |
| `REQUEST_TIMEOUT`        | 503    | Requisição passou de `REQUEST_TIMEOUT_MS`                    |

Códigos novos seguem a mesma regra de derivação.
