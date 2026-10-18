# Deploy na AWS

Infraestrutura em `infra/terraform/` (módulos + `envs/prod`), pacotes Lambda gerados por `apps/api/scripts/bundle-lambda.mjs` e workflow `.github/workflows/deploy.yml`. Decisões: [ADR 0010](adr/0010-rede-e-custos-aws.md) (rede e custos) e [ADR 0011](adr/0011-lambda-esbuild-migrations.md) (Lambda, esbuild, migrations).

> **Nada aqui foi aplicado numa conta AWS ainda.** Tudo passou por `terraform validate`, `tflint` e `checkov`, e os pacotes Lambda foram testados localmente, mas o primeiro `apply` é o primeiro teste real. Siga o roteiro com atenção e leia o plano antes de confirmar.

## Arquitetura

```mermaid
flowchart LR
  user([Usuário]) -->|HTTPS| cf[CloudFront<br/>OAC + headers de segurança]
  cf --> webs3[(S3 privado<br/>build do front)]
  user -->|login PKCE| cognito[Cognito<br/>Hosted UI]
  user -->|Bearer JWT| apigw[API Gateway<br/>HTTP API]
  user -->|upload/download<br/>URL pré-assinada| files[(S3 privado<br/>anexos, etiquetas, relatórios)]
  apigw --> api[Lambda API<br/>NestJS, arm64]
  api -->|TLS verify-full| rds[(RDS PostgreSQL 17<br/>db.t4g.micro)]
  api --> files
  api -->|JWKS| cognito
  api -->|StartExecution| sfn[[Step Functions<br/>recall]]
  sfn --> recall[Lambda recall-step]
  sfn -->|falha| sns[[SNS<br/>e-mail]]
  sched[EventBridge Scheduler<br/>07:00 BRT] --> expiry[Lambda expiry-alert]
  expiry --> sns
  recall --> rds
  recall --> files
  expiry --> rds
  expiry -. falha assíncrona .-> dlq[[SQS DLQ]]
  migrate[Lambda migrate] --> rds
  ssm[(SSM Parameter Store<br/>DATABASE_URL)] -. init .-> api & recall & expiry & migrate
  cw[CloudWatch<br/>dashboard + alarmes] --> sns
  gh[GitHub Actions<br/>OIDC] -->|terraform, invoke migrate, s3 sync| api & migrate & webs3
```

As Lambdas rodam **fora da VPC** e o RDS tem endpoint público com TLS obrigatório; por quê: [ADR 0010](adr/0010-rede-e-custos-aws.md). A VPC (2 subnets públicas + 2 privadas, sem NAT, gateway endpoint do S3) já está pronta para o modo `private_networking = true`.

### Módulos Terraform

| Módulo            | O que cria                                                                                                                                                                         |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `network`         | VPC, subnets, IGW, gateway endpoint S3, SGs (Lambda → RDS 5432), endpoints de interface opcionais                                                                                  |
| `database`        | RDS PG 17 `db.t4g.micro`, gp3 20 GB, criptografado, backup 7 dias, `rds.force_ssl`, senha e `DATABASE_URL` no SSM                                                                  |
| `auth`            | User Pool (login por e-mail, MFA TOTP opcional, só convite), grupos `admin`/`operator`/`auditor`, app client PKCE, Hosted UI                                                       |
| `storage`         | Bucket privado de arquivos: CORS do front, SSE-S3, versionamento, ciclo de vida, TLS obrigatório                                                                                   |
| `lambda-function` | Base de toda Lambda: role própria, log group (14 dias), X-Ray, DLQ opcional                                                                                                        |
| `api`             | Lambda da API (Node 24, arm64, 1024 MB, 29 s, concorrência reservada 5) + HTTP API com CORS e throttling                                                                           |
| `jobs`            | Lambdas `migrate`, `expiry-alert` (Scheduler diário 07:00 America/Sao_Paulo) e `recall-step`; DLQ SQS                                                                              |
| `workflow`        | Tópico SNS (e-mails) e state machine do recall (BLOCK_LOTS → REPORT → NOTIFY, retry + catch)                                                                                       |
| `web`             | Bucket privado + CloudFront com OAC, fallback SPA, cache por tipo de arquivo, headers de segurança                                                                                 |
| `observability`   | Dashboard (API, Lambdas, RDS, DLQ, erros do navegador) e ~10 alarmes → SNS. Erros do front: `POST /v1/client-errors` → log `event=client_error` → métrica `TraceFlow/ClientErrors` |
| `github-oidc`     | Provider OIDC do GitHub e role de deploy restrita ao repositório (main, tags `v*`, environment `production`)                                                                       |
| `ecs-alternative` | **Não usado.** API em ECS Fargate + ALB + WAF, só validado (`terraform validate`)                                                                                                  |

### Configuração da aplicação na AWS

O Terraform monta as variáveis de `apps/api/src/config/env.ts`. Segredos **não** vão em variável de ambiente: a Lambda recebe `DATABASE_URL_SSM_PARAMETER` e o wrapper do bundle busca o valor no SSM durante o init ([ADR 0011](adr/0011-lambda-esbuild-migrations.md)).

| Variável                                                      | Valor                                                          |
| ------------------------------------------------------------- | -------------------------------------------------------------- |
| `NODE_ENV` / `AUTH_MODE`                                      | `production` / `cognito`                                       |
| `COGNITO_REGION`, `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID` | do módulo `auth`                                               |
| `CORS_ORIGINS`, `PUBLIC_WEB_URL`                              | URL do CloudFront (ou domínio próprio)                         |
| `SWAGGER_ENABLED`                                             | `false`                                                        |
| `DATABASE_URL_SSM_PARAMETER`                                  | `/traceflow/prod/db/url` (SecureString, `sslmode=verify-full`) |
| `DATABASE_POOL_MAX`                                           | `2` (5 instâncias × 2 = 10 conexões no máximo)                 |
| `S3_BUCKET`, `S3_REGION`                                      | bucket de arquivos                                             |
| `SNS_TOPIC_ARN`                                               | tópico SNS (API e jobs)                                        |
| `TRUST_PROXY` / `RATE_LIMIT_STORE`                            | `1` / `postgres` (rate limit compartilhado entre instâncias)   |
| `RECALL_STATE_MACHINE_ARN`                                    | state machine do recall (só API)                               |
| `NODE_EXTRA_CA_CERTS`                                         | `/var/runtime/ca-cert.pem` (CA do RDS no runtime da Lambda)    |

**Orçamento de conexões no RDS** (`db.t4g.micro`, `max_connections` ≈ 80, sem RDS Proxy por custo):

| Quem                               | Limite                            | Conexões |
| ---------------------------------- | --------------------------------- | -------: |
| API                                | concorrência reservada 5 × pool 2 |       10 |
| Etapas do recall (`recall-step`)   | 1 por recall em execução × pool 2 |      2–6 |
| Alerta de validade, migrations     | 1 execução por vez × pool 2       |    2 + 2 |
| Folga (console, `psql`, monitoria) |                                   |      ~10 |

O alarme `rds-connections` dispara em 60. Os jobs não têm concorrência reservada de propósito: contas novas têm limite total de 10 execuções simultâneas e a AWS exige 10 sem reserva. Se a conta tiver limite maior e o volume de recalls crescer, reserve 2 para `recall-step`.

> Os jobs da Semana 4 devem ler exatamente `NOTIFICATIONS_TOPIC_ARN`, `RECALL_STATE_MACHINE_ARN` e `S3_BUCKET`. Se usarem outros nomes, ajuste `app_environment` em `infra/terraform/envs/prod/main.tf`.

## Custos

Região `us-east-1`, preços de referência de out/2026. "Free tier" = conta no primeiro ano (plano gratuito legado) ou coberto pelos créditos do plano gratuito atual.

| Recurso                                                            | No free tier       | Depois (uso de portfólio) |
| ------------------------------------------------------------------ | ------------------ | ------------------------- |
| RDS `db.t4g.micro` single-AZ                                       | 750 h/mês grátis   | ~US$ 11,70/mês            |
| RDS gp3 20 GB + backups (até o tamanho do banco)                   | 20 GB grátis       | ~US$ 2,30/mês             |
| IPv4 público do RDS                                                | 750 h/mês grátis   | ~US$ 3,65/mês             |
| Lambda (1 M req, 400 mil GB-s)                                     | sempre grátis      | ~US$ 0                    |
| API Gateway HTTP API                                               | 1 M req/mês grátis | US$ 1,00 por milhão       |
| CloudFront (1 TB, 10 M req)                                        | sempre grátis      | ~US$ 0                    |
| S3 (front + arquivos, poucos GB)                                   | 5 GB grátis        | centavos                  |
| Cognito Essentials (até 10 mil MAU)                                | grátis             | grátis                    |
| Step Functions (4 mil transições), SNS, SQS, Scheduler, SSM padrão | grátis             | ~US$ 0                    |
| CloudWatch (10 alarmes, 3 dashboards, 5 GB de logs)                | grátis             | ~US$ 0                    |
| **Total (modo padrão)**                                            | **~US$ 0–1/mês**   | **~US$ 18–20/mês**        |
| `private_networking = true` (3 interface endpoints, 1 AZ)          | —                  | **+ ~US$ 22/mês**         |
| Evitado: NAT Gateway                                               | —                  | (+ ~US$ 33/mês)           |
| Evitado: RDS Proxy, Multi-AZ, WAF                                  | —                  | (+ US$ 15–30/mês)         |

Dicas: crie um **AWS Budget** (ex.: US$ 5/mês com alerta por e-mail) antes do primeiro deploy; pare o RDS quando não estiver usando (`aws rds stop-db-instance`, volta sozinho em 7 dias).

## Primeiro deploy (roteiro)

### 0. Pré-requisitos

- Conta AWS com um usuário administrador para uso **local** (de preferência IAM Identity Center + `aws sso login`). Só o primeiro `apply` usa essas credenciais; depois o GitHub Actions usa OIDC.
- AWS CLI v2, Node 24 + pnpm 10, Terraform 1.16 (ou Docker: `docker run --rm -it -v "$PWD:/work" -w /work/infra/terraform/envs/prod -v ~/.aws:/root/.aws hashicorp/terraform:1.16.4 ...`).
- Região: `us-east-1` (o certificado do CloudFront, se houver, também precisa estar lá).

### 1. Bootstrap do state

Uma única vez, com as credenciais de administrador:

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

Descomente o bloco `backend "s3"` em `infra/terraform/envs/prod/backend.tf`, troque `<ACCOUNT_ID>` e **commite** (o workflow de deploy se recusa a rodar sem backend remoto). A trava usa `use_lockfile` (nativo do S3, Terraform ≥ 1.10); para DynamoDB, veja o comentário no arquivo.

> O state contém a senha do RDS (gerada pelo Terraform). Mantenha o bucket privado e com acesso restrito.

### 2. Variáveis

```bash
cd infra/terraform/envs/prod
cp terraform.tfvars.example terraform.tfvars   # fora do git
```

Revise principalmente:

- `notification_emails`: quem recebe alarmes e falhas de recall.
- `api_reserved_concurrency`: **contas novas costumam ter limite de 10 execuções concorrentes**, e a AWS exige 10 sem reserva — nesse caso o apply falha com `UnreservedConcurrentExecution below its minimum value`. Use `-1` e peça aumento da cota (Service Quotas → Lambda → Concurrent executions).
- `enable_expiry_alert` / `enable_recall`: `false` se os zips desses jobs ainda não existirem (passo 3).

### 3. Pacotes Lambda

Na raiz do repo:

```bash
pnpm install
pnpm --filter @traceflow/shared build
pnpm --filter @traceflow/api bundle:lambda   # gera apps/api/dist-lambda/*.zip
```

Entradas cujo código ainda não existe (ex.: `expiry-alert`, `recall-step`) são puladas com aviso.

### 4. Primeiro apply (local)

```bash
cd infra/terraform/envs/prod
terraform init
terraform plan -out tfplan      # leia o plano
terraform apply tfplan          # ~15–20 min (RDS e CloudFront são os lentos)
terraform output
```

Esse apply também cria a role de deploy do GitHub (`github_deploy_role_arn`).

### 5. Confirmar o e-mail do SNS

Cada endereço em `notification_emails` recebe um e-mail "AWS Notification - Subscription Confirmation". Sem confirmar, alarmes não chegam.

### 6. Migrations

```bash
aws lambda invoke --function-name "$(terraform output -raw migrate_function_name)" \
  --cli-binary-format raw-in-base64-out --payload '{}' --cli-read-timeout 320 out.json
cat out.json   # { "applied": [...], "alreadyApplied": [...], "pending": [] }
```

Para ver o que seria aplicado sem aplicar: `--payload '{"dryRun":true}'`.

### 7. GitHub Actions

1. **Settings → Environments → New environment** `production`: marque _Required reviewers_ (você) e, em _Deployment branches and tags_, permita só `main` e tags `v*`.
2. **Settings → Secrets and variables → Actions**:
   - secret `AWS_DEPLOY_ROLE_ARN` = `terraform output -raw github_deploy_role_arn`;
   - variable `TF_VARS` = conteúdo do seu `terraform.tfvars` (sem segredos; `enable_*` é preenchido pelo workflow);
   - variable `AWS_REGION` (opcional, padrão `us-east-1`).
3. **Actions → Deploy → Run workflow** (ou `git tag v0.2.0 && git push --tags`).

O workflow: `build` (bundle das Lambdas) → `plan` (mostra o plano no log) → **aprovação manual** → `deploy`: `terraform apply`, invoca a Lambda `migrate`, compila o front com `VITE_AUTH_MODE=cognito` e as variáveis dos outputs, envia ao S3 (`assets/` com cache de 1 ano, `index.html` com `no-cache`) e invalida o CloudFront.

> O plano **não** é salvo como artefato (ele conteria a senha do RDS e artefatos são legíveis por quem lê o repo); o job `deploy` gera um plano novo e aplica. O `concurrency` do workflow impede dois deploys simultâneos.

Primeiro front sem esperar o GitHub (opcional, manual):

```bash
cd infra/terraform/envs/prod
export VITE_API_URL=$(terraform output -raw api_url) VITE_AUTH_MODE=cognito \
  VITE_COGNITO_AUTHORITY=$(terraform output -raw cognito_authority) \
  VITE_COGNITO_CLIENT_ID=$(terraform output -raw cognito_client_id) \
  VITE_COGNITO_DOMAIN=$(terraform output -raw cognito_domain) \
  VITE_COGNITO_REDIRECT_URI=$(terraform output -raw web_url)/auth/callback \
  VITE_COGNITO_LOGOUT_URI=$(terraform output -raw web_url)/login
(cd ../../../.. && pnpm --filter @traceflow/web build)
aws s3 sync ../../../../apps/web/dist "s3://$(terraform output -raw web_bucket)" --delete
aws cloudfront create-invalidation --distribution-id "$(terraform output -raw web_distribution_id)" --paths "/*"
```

Modelo das variáveis do front: `apps/web/.env.production.example`.

### 8. Primeiro acesso: usuários no Cognito e no banco

O User Pool só aceita usuários criados por um administrador, e a API exige que o `sub` do Cognito exista na tabela `users` (vinculado a uma empresa). Para cada usuário:

```bash
POOL=$(terraform output -raw cognito_user_pool_id)
EMAIL=ana@exemplo.com.br

# 1. Cria no Cognito (envia senha temporária por e-mail) e coloca no grupo do perfil
aws cognito-idp admin-create-user --user-pool-id "$POOL" --username "$EMAIL" \
  --user-attributes Name=email,Value="$EMAIL" Name=email_verified,Value=true \
  --desired-delivery-mediums EMAIL
aws cognito-idp admin-add-user-to-group --user-pool-id "$POOL" --username "$EMAIL" --group-name admin

# 2. Descobre o sub
SUB=$(aws cognito-idp admin-get-user --user-pool-id "$POOL" --username "$EMAIL" \
  --query "UserAttributes[?Name=='sub'].Value" --output text)

# 3. Cria a empresa (se não existir) e o usuário no banco — script idempotente
curl -so /tmp/rds-ca.pem https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem
export NODE_EXTRA_CA_CERTS=/tmp/rds-ca.pem
export DATABASE_URL=$(aws ssm get-parameter --with-decryption \
  --name "$(terraform output -raw database_url_parameter)" --query Parameter.Value --output text)
pnpm --filter @traceflow/api tenant:bootstrap --tax-id 12345678000195 \
  --company "Torrefação Serra Azul" --lot-prefix CAF \
  --email "$EMAIL" --name "Ana Ribeiro" --sub "$SUB" --role ADMIN
```

- O perfil gravado por `--role` na tabela `users` é o que vale para a API ([ADR 0012](adr/0012-perfil-do-banco-e-gestao-de-usuarios.md)); coloque o usuário no grupo de mesmo nome para o console ficar coerente.
- **Só o primeiro admin** passa por este roteiro. Os demais usuários são convidados por ele na tela **Gestão → Usuários**: a API cria a conta no Cognito, envia o convite e mantém os grupos.
- Outros usuários da mesma empresa: repita com o mesmo `--tax-id` (a empresa é reaproveitada).
- O script recusa mover um `sub` que já pertence a outra empresa.
- Todas as opções também podem vir de variáveis (`TENANT_TAX_ID`, `TENANT_COMPANY`, `TENANT_LOT_PREFIX`, `TENANT_ADMIN_EMAIL`, `TENANT_ADMIN_NAME`, `TENANT_ADMIN_SUB`, `TENANT_ADMIN_ROLE`).
- No modo `private_networking = true` o banco não é acessível de fora: rode o script de dentro da VPC (ex.: CloudShell na VPC).

O seed de desenvolvimento (`db:seed`) **não** deve rodar em produção: os usuários dele têm `sub` falsos.

### 9. Conferência

```bash
curl -s "$(terraform output -raw api_url)/v1/health/ready"   # {"status":"ok","database":"up"}
```

Abra `terraform output -raw web_url`, faça login (o Cognito pede para trocar a senha temporária) e confira o dashboard: `terraform output -raw dashboard_url`. Para ver os erros do navegador: CloudWatch Logs Insights no log group da API com `filter event = "client_error" | fields @timestamp, kind, message, url, release`.

### Domínio próprio (opcional)

1. Certificado no ACM **em us-east-1** para `app.seudominio.com.br` (validação por DNS).
2. `web_aliases = ["app.seudominio.com.br"]` e `web_certificate_arn = "..."` no tfvars; apply.
3. CNAME `app` → `terraform output` do domínio do CloudFront (`web_url` passa a usar o alias, e as URLs de callback do Cognito, CORS e `PUBLIC_WEB_URL` acompanham).

## Rollback

- **Código (API, jobs, front)**: rode o workflow _Deploy_ escolhendo a tag anterior (`Run workflow` → _Use workflow from_ → tag `v...`). As Lambdas e o front voltam à versão da tag.
- **Banco**: migrations só andam para frente. Se uma migration quebrar, ela é revertida (roda em transação) e o deploy para antes de publicar o front; corrija com uma nova migration. Para dados: _point-in-time restore_ (até 7 dias) cria **outra** instância:
  ```bash
  aws rds restore-db-instance-to-point-in-time --source-db-instance-identifier traceflow-prod \
    --target-db-instance-identifier traceflow-prod-restore --restore-time 2026-10-16T12:00:00Z
  ```
  Depois, atualize o parâmetro `/traceflow/prod/db/url` com o novo endpoint (ou importe a instância no Terraform) e reinicie as Lambdas (qualquer novo deploy ou mudança de configuração força um novo init).
- **Infraestrutura**: `git revert` do commit Terraform + novo deploy. O state é versionado no S3 (dá para recuperar uma versão anterior em último caso).

## Segredos

| Segredo               | Onde fica                                                                    | Quem lê                                              |
| --------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------- |
| Senha mestre do RDS   | SSM `/traceflow/prod/db/master-password` (SecureString) + state do Terraform | administradores                                      |
| `DATABASE_URL`        | SSM `/traceflow/prod/db/url` (SecureString)                                  | roles das Lambdas (`ssm:GetParameters` só nesse ARN) |
| Credenciais AWS do CI | não existem: OIDC + `AWS_DEPLOY_ROLE_ARN`                                    | GitHub Actions do repositório                        |
| Variáveis `VITE_*`    | públicas por natureza (vão para o navegador)                                 | —                                                    |

Trocar a senha do RDS: `terraform apply -replace=module.database.random_password.master` (atualiza RDS e SSM; as Lambdas pegam o valor novo no próximo cold start — force com um novo deploy).

## Validação local (sem AWS)

```bash
# fmt + init -backend=false + validate de todos os módulos (Docker)
docker run --rm -v "$PWD/infra/terraform:/work" -w /work --entrypoint sh hashicorp/terraform:1.16.4 validate.sh
# tflint (regras recomendadas + AWS)
docker run --rm -v "$PWD/infra/terraform:/data" -w /data ghcr.io/terraform-linters/tflint --init
docker run --rm -v "$PWD/infra/terraform:/data" -w /data ghcr.io/terraform-linters/tflint --recursive --config /data/.tflint.hcl
# checkov (achados aceitos em .checkov.yaml)
docker run --rm -v "$PWD/infra/terraform:/tf" bridgecrew/checkov -d /tf --config-file /tf/.checkov.yaml
# Lambdas: bundle + boot local com evento falso do API Gateway (precisa de um Postgres, ex. pnpm db:up)
pnpm --filter @traceflow/api bundle:lambda
DATABASE_URL=postgresql://traceflow:traceflow@localhost:5432/traceflow pnpm --filter @traceflow/api smoke:lambda
```

No Git Bash do Windows, prefixe os comandos `docker` com `MSYS_NO_PATHCONV=1`. A CI roda `validate.sh` em todo push.

## Segurança: achados aceitos

`checkov` passa sem falhas com as exceções de `infra/terraform/.checkov.yaml`, todas por custo ou por decisão documentada:

- **Rede** ([ADR 0010](adr/0010-rede-e-custos-aws.md)): Lambdas fora da VPC, RDS público com TLS obrigatório; sem VPC flow logs.
- **KMS gerenciado pela AWS** em vez de CMK (logs, SSM, S3, env das Lambdas, Scheduler). Tópico SNS sem criptografia porque os alarmes do CloudWatch não publicam em tópico cifrado com a chave `aws/sns`; as mensagens só têm IDs e contagens.
- **Sem WAF no CloudFront/API** (≥ US$ 5/mês); o API Gateway tem throttling por stage (20 req/s, rajada de 50) e a página pública de rastreio tem rate limit próprio na API. O módulo `ecs-alternative` mostra o WAF com regras gerenciadas.
- **Sem Multi-AZ, Performance Insights, Enhanced Monitoring, réplica entre regiões, logs de acesso do S3/CloudFront** (custo).
- **Retenção de logs de 14 dias** (não 1 ano).
- **Rotas do API Gateway sem autorizador**: a autenticação é feita na API (guard JWT global, [autenticacao.md](autenticacao.md)), que também tem rotas públicas (health, página de rastreio).
- **Role de deploy do GitHub com `PowerUserAccess`** + IAM restrito a roles `traceflow-prod-*` e sem poder alterar a si mesma. Mais restrito do que isso exigiria listar ação por ação de cada serviço.

## Destruir o ambiente

1. `db_deletion_protection = false` no tfvars e `terraform apply` (desliga a proteção do RDS e do Cognito e libera apagar o bucket de arquivos com conteúdo). **Com a proteção desligada não há snapshot final do RDS**: se quiser guardar os dados, `aws rds create-db-snapshot` antes.
2. `terraform destroy`.
3. Apague o bucket de state (`traceflow-tfstate-<ACCOUNT_ID>`) se não for mais usar, e os log groups que a AWS recria sozinha (ex.: `/aws/lambda/...` após invocações tardias).

## Limitações conhecidas

- O primeiro `apply` real ainda não aconteceu; espere ajustes finos (nomes globais de bucket/domínio do Cognito já incluem o ID da conta para evitar colisão).
- `private_networking = true` não foi testado de ponta a ponta (a API precisa alcançar o JWKS do Cognito; veja o ADR 0010).
- Jobs `expiry-alert` e `recall-step` dependem do código da Semana 4; sem os zips, o workflow desliga os recursos correspondentes (e a variável `RECALL_STATE_MACHINE_ARN` fica vazia).
- Content-Security-Policy do front está desligada por padrão (`web_content_security_policy`): uma CSP errada quebra o login; configure depois de testar (precisa permitir a API, o domínio do Cognito e o bucket de arquivos em `connect-src`).
