# Entrada em produção — checklist

Roteiro detalhado (comandos): [deploy.md](deploy.md). Este documento é o checklist do dia, com o que precisa de decisão humana e os riscos conhecidos.

## Antes do primeiro deploy (precisa de você)

| #   | Item                                                                                                                 | Onde                                                                       |
| --- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 1   | Conta AWS com acesso ao billing, MFA no root, usuário admin, **AWS Budgets com alerta de US$ 1**                     | Console AWS                                                                |
| 2   | Escolher a região (padrão `us-east-1`) e, se quiser, o domínio próprio                                               | `terraform.tfvars`                                                         |
| 3   | Bucket + tabela de lock do state do Terraform; descomentar `envs/prod/backend.tf` e commitar                         | [deploy.md §1](deploy.md#1-bootstrap-do-state)                             |
| 4   | Preencher `terraform.tfvars` (e-mail das notificações, URLs). Conta nova: `api_reserved_concurrency = -1`            | [deploy.md §2](deploy.md#2-variáveis)                                      |
| 5   | `pnpm --filter @traceflow/api bundle:lambda` e o **primeiro `terraform apply` local** (cria também a role do GitHub) | [deploy.md §3–4](deploy.md#3-pacotes-lambda)                               |
| 6   | Confirmar a inscrição do e-mail no SNS                                                                               | [deploy.md §5](deploy.md#5-confirmar-o-e-mail-do-sns)                      |
| 7   | Rodar as migrations (Lambda `migrate`)                                                                               | [deploy.md §6](deploy.md#6-migrations)                                     |
| 8   | GitHub: environment `production` com aprovação, secret `AWS_DEPLOY_ROLE_ARN`, variável `TF_VARS`                     | [deploy.md §7](deploy.md#7-github-actions)                                 |
| 9   | Criar o primeiro admin no Cognito e rodar `tenant:bootstrap`; os demais são convidados na tela Usuários              | [deploy.md §8](deploy.md#8-primeiro-acesso-usuários-no-cognito-e-no-banco) |
| 10  | Conferência pós-deploy                                                                                               | [deploy.md §9](deploy.md#9-conferência)                                    |

## Conferência funcional (15 minutos, no ambiente publicado)

1. Login pelo Cognito (Hosted UI) com o admin; o cabeçalho mostra a empresa.
2. Cadastrar 1 produto verde, 1 torrado, 1 fornecedor, 1 cliente e 2 locais (ou importar por CSV em **Importação**).
3. **Recebimento** de um lote verde → **Produção** (torra) → **Expedição** para o cliente.
4. **Rastreabilidade** do lote verde: para frente chega ao cliente; do torrado: para trás chega à fazenda.
5. **Etiqueta** do torrado: abrir o PDF e o link público do QR (sem login, sem dados sensíveis).
6. **Recall** simulado sobre o lote verde; executar só em dados de teste.
7. **Relatórios**: baixar um CSV; **Auditoria**: ver as ações registradas.
8. CloudWatch: dashboard sem erros 5xx; alarmes em `OK`.

## Riscos conhecidos e mitigação

| Risco                                                                                  | Mitigação atual                                                                         | Próximo passo                                                                                |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| RDS com endpoint público (escolha de custo, [ADR 0010](adr/0010-rede-e-custos-aws.md)) | TLS obrigatório, certificado validado, senha aleatória de 40 caracteres no SSM, sem NAT | `private_networking = true` (~US$ 22/mês) quando houver orçamento                            |
| Testes automatizados das Semanas 2–5 adiados (a pedido)                                | Teste de ponta a ponta do fluxo principal; verificações manuais em cada etapa           | Rodada de testes: concorrência de saídas, idempotência, recall, isolamento nos módulos novos |
| Rate limit em memória por instância                                                    | Limite por IP em cada Lambda + throttling do API Gateway                                | WAF/limite no API Gateway por rota                                                           |
| Primeiro `terraform apply` nunca executado                                             | `validate`, tflint e checkov sem falhas                                                 | Aplicar primeiro numa conta/ambiente de teste, se possível                                   |
| CSP do front desligada por padrão                                                      | Headers de segurança do CloudFront ativos                                               | Ativar a CSP após validar o login do Cognito                                                 |

## Custos esperados

Free tier: ~US$ 0–1/mês. Depois do free tier: ~US$ 18–20/mês (quase tudo RDS). Detalhe em [deploy.md — Custos](deploy.md#custos).

## Rollback

Ver [deploy.md — Rollback](deploy.md#rollback): reimplantar a tag anterior pelo workflow; migrations são só aditivas até aqui; snapshot do RDS antes de cada deploy com migration.
