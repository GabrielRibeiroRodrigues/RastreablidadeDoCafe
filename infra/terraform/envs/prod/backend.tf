# State remoto. Comentado para que `terraform init -backend=false` e a validação local funcionem.
#
# 1. Crie o bucket de state uma única vez (docs/deploy.md, "Bootstrap do state"):
#      aws s3api create-bucket --bucket traceflow-tfstate-<ACCOUNT_ID> --region us-east-1
#      aws s3api put-bucket-versioning --bucket traceflow-tfstate-<ACCOUNT_ID> \
#        --versioning-configuration Status=Enabled
#      aws s3api put-public-access-block --bucket traceflow-tfstate-<ACCOUNT_ID> \
#        --public-access-block-configuration \
#        BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
# 2. Descomente o bloco abaixo, troque <ACCOUNT_ID> e rode `terraform init -migrate-state`.
#
# Trava: o Terraform >= 1.10 trava o state no próprio S3 (use_lockfile), sem DynamoDB.
# Prefere a tabela DynamoDB clássica? Crie-a (chave de partição `LockID`, string, on-demand) e
# troque `use_lockfile` por `dynamodb_table = "traceflow-tfstate-lock"`.

# terraform {
#   backend "s3" {
#     bucket       = "traceflow-tfstate-<ACCOUNT_ID>"
#     key          = "prod/terraform.tfstate"
#     region       = "us-east-1"
#     encrypt      = true
#     use_lockfile = true
#     # dynamodb_table = "traceflow-tfstate-lock"
#   }
# }
