# Restauração do banco (runbook)

Quando usar: dados apagados ou corrompidos por engano, migration que deu errado, ou para conferir que os backups funcionam. O RDS faz **backup automático diário + log de transações** (`backup_retention_days`, padrão 7 dias), então dá para voltar a **qualquer segundo** dessa janela (PITR). Antes de uma migration arriscada, tire também um snapshot manual, que não expira: `aws rds create-db-snapshot --db-instance-identifier traceflow-prod --db-snapshot-identifier pre-<versão>`.

> Restaurar **nunca sobrescreve** a instância de produção: o RDS cria uma instância nova. A partir dela, você copia o que precisa para a produção. Assim o Terraform continua apontando para a mesma instância e o mesmo parâmetro `DATABASE_URL`.

## 1. Restaurar para uma instância temporária

```bash
export AWS_REGION=us-east-1
SRC=traceflow-prod                    # identificador da instância de produção
TMP=traceflow-prod-restore            # instância temporária
WHEN=2026-10-20T14:30:00Z             # instante ANTES do problema (UTC)

aws rds restore-db-instance-to-point-in-time \
  --source-db-instance-identifier "$SRC" \
  --target-db-instance-identifier "$TMP" \
  --restore-time "$WHEN" \
  --db-instance-class db.t4g.micro \
  --no-multi-az --publicly-accessible \
  --vpc-security-group-ids "$(aws rds describe-db-instances --db-instance-identifier "$SRC" \
      --query 'DBInstances[0].VpcSecurityGroups[0].VpcSecurityGroupId' --output text)" \
  --db-subnet-group-name "$(aws rds describe-db-instances --db-instance-identifier "$SRC" \
      --query 'DBInstances[0].DBSubnetGroup.DBSubnetGroupName' --output text)"

aws rds wait db-instance-available --db-instance-identifier "$TMP"   # ~10–20 min
```

Para um snapshot em vez de um instante, use `restore-db-instance-from-db-snapshot --db-snapshot-identifier <snapshot>` com os mesmos parâmetros.

A instância temporária usa a mesma senha da produção (parâmetro `/traceflow/prod/db/master-password` no SSM) e exige TLS. Ela custa como uma segunda `db.t4g.micro` enquanto existir, então **apague-a no fim** (passo 4).

## 2. Conferir os dados restaurados

```bash
HOST=$(aws rds describe-db-instances --db-instance-identifier "$TMP" \
  --query 'DBInstances[0].Endpoint.Address' --output text)
PGPASSWORD=$(aws ssm get-parameter --with-decryption --name /traceflow/prod/db/master-password \
  --query Parameter.Value --output text) \
psql "host=$HOST dbname=traceflow user=traceflow sslmode=require" -c '
  SELECT (SELECT count(*) FROM lots) AS lots,
         (SELECT count(*) FROM stock_movements) AS movements,
         (SELECT max(created_at) FROM audit_logs) AS last_audit;'
```

Confirme que `last_audit` está logo antes do problema e que o dado perdido está lá.

## 3. Trazer os dados para a produção

**3a. Recuperar só o que se perdeu** (caso mais comum, ex.: um cadastro apagado). Exporte as linhas da instância temporária (`\copy (SELECT ...) TO 'x.csv' CSV HEADER`) e importe na produção com `\copy ... FROM`. O razão de estoque e a auditoria são só inclusão: corrija movimentações por estorno, não por SQL.

**3b. Voltar o banco inteiro** (ex.: migration destrutiva). Isso perde tudo o que aconteceu depois de `WHEN`:

```bash
FN=traceflow-prod-api
# 1. Congela a API: nada de escrita durante a troca (o front mostra erro de conexão).
aws lambda put-function-concurrency --function-name "$FN" --reserved-concurrent-executions 0

# 2. Copia o banco restaurado por cima do de produção, numa única transação.
PROD=$(aws rds describe-db-instances --db-instance-identifier "$SRC" \
  --query 'DBInstances[0].Endpoint.Address' --output text)
pg_dump "host=$HOST dbname=traceflow user=traceflow sslmode=require" -Fc -f restore.dump
pg_restore --clean --if-exists --no-owner --single-transaction \
  -d "host=$PROD dbname=traceflow user=traceflow sslmode=require" restore.dump

# 3. Descongela a API (volta à concorrência do Terraform, padrão 5).
aws lambda put-function-concurrency --function-name "$FN" --reserved-concurrent-executions 5
```

`--clean` derruba e recria as tabelas, e os triggers de imutabilidade vêm junto no dump. Se a versão do código for anterior a alguma migration do banco restaurado, reimplante a tag compatível ([deploy.md — Rollback](deploy.md#rollback)).

## 4. Limpar

```bash
aws rds delete-db-instance --db-instance-identifier "$TMP" --skip-final-snapshot
rm -f restore.dump
```

Registre no histórico do incidente: instante restaurado, o que foi recuperado e o tempo total.

## Ensaio (faça antes do go-live e depois a cada trimestre)

Um backup que nunca foi restaurado não é backup. O ensaio completo na AWS são os passos 1, 2 e 4, sem o 3, e custa algumas horas de uma `db.t4g.micro`.

**Ensaio local (2026-10-18)**, com o Postgres do `docker compose`, para validar o caminho `pg_dump` → `pg_restore` do passo 3b:

```bash
docker exec traceflow-postgres-1 sh -c '
  pg_dump -U traceflow -d traceflow -Fc -f /tmp/traceflow.dump &&
  createdb -U traceflow traceflow_restore &&
  pg_restore -U traceflow -d traceflow_restore --no-owner /tmp/traceflow.dump'
```

Resultado: contagens idênticas nas duas bases (`companies` 2, `lots` 24, `stock_movements` 74, `audit_logs` 134, `recalls` 3, `shipments` 3, `_prisma_migrations` iguais). No banco restaurado, `UPDATE stock_movements` continuou recusado pelo trigger (`append-only`), ou seja, os triggers vieram no dump.
