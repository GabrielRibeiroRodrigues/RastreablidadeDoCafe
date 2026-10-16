# 0010 — Rede na AWS: Lambdas fora da VPC e RDS público com TLS (custo ~zero)

- **Status:** Aceito (2026-10-15)

## Contexto

A arquitetura planejada colocava as Lambdas numa VPC com subnets privadas, ao lado do RDS, **sem NAT Gateway** (US$ 32,85/mês + tráfego, o item mais caro de uma VPC "padrão"). Só que uma Lambda numa subnet privada sem NAT não alcança nada fora da VPC. A API e os jobs precisam de:

| Destino                              | Quem precisa              | Saída sem NAT                         |
| ------------------------------------ | ------------------------- | ------------------------------------- |
| RDS PostgreSQL                       | API, jobs                 | dentro da VPC                         |
| S3 (anexos, etiquetas, relatórios)   | API, recall               | gateway endpoint **gratuito**         |
| SSM Parameter Store (`DATABASE_URL`) | todas as Lambdas, no init | interface endpoint (pago)             |
| JWKS do Cognito (validar o token)    | API                       | não há caminho garantido sem internet |
| SNS (notificações)                   | API, expiry-alert, recall | interface endpoint (pago)             |
| Step Functions (`StartExecution`)    | API (abrir recall)        | interface endpoint (pago)             |

Cada interface endpoint custa ~US$ 0,01/h **por AZ** (~US$ 7,30/mês numa AZ só). Três endpoints numa AZ: **~US$ 22/mês**, mais que todo o resto da conta somado depois do free tier. Alternativas avaliadas:

1. **Lambda na VPC + NAT Gateway**: o "jeito clássico". ~US$ 33/mês fixo. Descartado pelo custo.
2. **Lambda na VPC + NAT instance** (t4g.nano com fck-nat): ~US$ 3/mês + IPv4 público, mas é uma EC2 para manter (patches, disponibilidade). Descartado: operação demais para o ganho.
3. **Lambda na VPC + interface endpoints** (`ssm`, `sns`, `states`): ~US$ 22/mês; o JWKS do Cognito ainda exigiria embutir as chaves no deploy. Seguro, mas caro.
4. **Lambda na VPC + truques** (JWKS embutido em variável, Step Functions disparado por evento do S3 via gateway endpoint, notificações feitas pela própria state machine): custo zero, mas acopla o código da API à rede e quebra a cada nova integração com a AWS. Descartado: frágil.
5. **Lambdas fora da VPC + RDS com endpoint público**, protegido por TLS obrigatório e senha forte. Custo zero de rede; o banco fica exposto à internet na porta 5432.

## Decisão

**Opção 5 como padrão** (`private_networking = false`), com a opção 3 pronta no Terraform atrás de uma variável (`private_networking = true`).

No modo padrão:

- As Lambdas rodam **fora da VPC** e falam com SSM, SNS, Step Functions, S3 e Cognito pelos endpoints públicos da AWS (sempre por HTTPS, autenticadas pela role IAM).
- O RDS fica nas subnets públicas com `publicly_accessible = true`. O security group libera a 5432 (`database_public_cidrs`, padrão `0.0.0.0/0`, porque os IPs de saída da Lambda não são fixos).
- Mitigações:
  - `rds.force_ssl = 1` e `ssl_min_protocol_version = TLSv1.2`: conexão sem TLS é recusada pelo próprio Postgres.
  - A aplicação conecta com `sslmode=verify-full` (valida o certificado do RDS com a CA da AWS: `NODE_EXTRA_CA_CERTS=/var/runtime/ca-cert.pem` na Lambda).
  - Senha de 40 caracteres aleatórios (`random_password`), usuário mestre que não é `postgres`, guardada como SecureString no SSM e lida no init da Lambda — nunca em variável de ambiente em texto claro.
  - `log_connections` ligado e logs do Postgres no CloudWatch (tentativas de login ficam registradas).
  - Backups automáticos de 7 dias, `deletion_protection` e criptografia em repouso.
  - Concorrência reservada da API (5) × pool de 2 conexões: o banco nunca recebe mais de ~10 conexões da API.

No modo `private_networking = true`: Lambdas em subnets privadas, RDS sem IP público e sem regra aberta, interface endpoints `ssm`, `sns` e `states` numa AZ. Ponto pendente desse modo: a busca do JWKS do Cognito precisa de saída para a internet (ou das chaves embutidas no deploy); por isso ele **não é o padrão e não foi testado de ponta a ponta**.

O subnet group do RDS usa sempre as subnets "públicas" (que só dão IP público a quem pede): alternar entre os modos muda `publicly_accessible` e o security group, sem recriar a instância.

## Consequências

- Custo de rede **zero** (sem NAT, sem endpoints). O único custo de rede é o IPv4 público do RDS (US$ 3,65/mês fora do free tier).
- A superfície de ataque cresce: a porta 5432 responde para a internet. Com TLS obrigatório e senha forte, o risco prático é força bruta/DoS no handshake; aceitável para um projeto de portfólio sem dados reais, **não** para dados sensíveis de clientes. Em produção "de verdade", o caminho é `private_networking = true` (ou RDS Proxy/IAM auth), assumindo ~US$ 22/mês.
- O checkov aponta Lambda fora da VPC e RDS público como achados; ficam documentados em [deploy.md](../deploy.md#segurança-achados-aceitos).
- Cold start menor (sem ENI na VPC) e nenhuma dependência de endpoints para novas integrações AWS.
- Ferramentas locais (seed, `bootstrap-tenant`, `psql`) alcançam o banco direto, com TLS — útil no primeiro acesso, e um motivo a mais para restringir `database_public_cidrs` quando os IPs de origem forem conhecidos.
