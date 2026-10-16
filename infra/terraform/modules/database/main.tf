# RDS PostgreSQL 17 db.t4g.micro (free tier), single-AZ, gp3 20 GB, criptografado, TLS obrigatório.
# Senha gerada aqui e guardada no SSM (SecureString). Ela também fica no state do Terraform:
# por isso o bucket de state é privado e criptografado (docs/deploy.md).

resource "random_password" "master" {
  length  = 40
  special = false # evita escapes na connection string
}

resource "aws_db_subnet_group" "this" {
  name       = var.name
  subnet_ids = var.subnet_ids
  tags       = var.tags
}

resource "aws_db_parameter_group" "this" {
  name        = "${var.name}-pg17"
  family      = "postgres17"
  description = "TraceFlow: TLS required, query logging for slow statements"

  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }

  parameter {
    name  = "ssl_min_protocol_version"
    value = "TLSv1.2"
  }

  parameter {
    name  = "log_min_duration_statement"
    value = "1000"
  }

  parameter {
    name  = "log_connections"
    value = "1"
  }

  tags = var.tags
}

resource "aws_db_instance" "this" {
  identifier     = var.name
  engine         = "postgres"
  engine_version = var.engine_version
  instance_class = var.instance_class

  allocated_storage     = var.allocated_storage
  max_allocated_storage = 0 # sem autoscaling de disco (custo previsível)
  storage_type          = "gp3"
  storage_encrypted     = true

  db_name  = var.database_name
  username = var.master_username
  password = random_password.master.result
  port     = 5432

  db_subnet_group_name   = aws_db_subnet_group.this.name
  vpc_security_group_ids = [var.security_group_id]
  publicly_accessible    = var.publicly_accessible
  multi_az               = false
  parameter_group_name   = aws_db_parameter_group.this.name
  ca_cert_identifier     = "rds-ca-rsa2048-g1"

  iam_database_authentication_enabled = true
  auto_minor_version_upgrade          = true
  backup_retention_period             = var.backup_retention_days
  backup_window                       = "05:00-05:30" # 02:00 em Brasília
  maintenance_window                  = "sun:06:00-sun:06:30"
  copy_tags_to_snapshot               = true
  deletion_protection                 = var.deletion_protection
  skip_final_snapshot                 = var.skip_final_snapshot
  final_snapshot_identifier           = var.skip_final_snapshot ? null : "${var.name}-final"
  enabled_cloudwatch_logs_exports     = ["postgresql"]

  # Performance Insights e Enhanced Monitoring desligados (custo); métricas básicas bastam aqui.
  performance_insights_enabled = false
  monitoring_interval          = 0

  apply_immediately = false
  tags              = var.tags

  # O log group precisa existir antes (com retenção); senão o RDS o cria sem expiração.
  depends_on = [aws_cloudwatch_log_group.postgresql]
}

resource "aws_cloudwatch_log_group" "postgresql" {
  name              = "/aws/rds/instance/${var.name}/postgresql"
  retention_in_days = var.log_retention_days
  tags              = var.tags
}

resource "aws_ssm_parameter" "master_password" {
  name        = "${var.ssm_prefix}/db/master-password"
  description = "TraceFlow RDS master password"
  type        = "SecureString"
  value       = random_password.master.result
  tags        = var.tags
}

# Connection string completa, lida pelas Lambdas no init (DATABASE_URL_SSM_PARAMETER).
# verify-full: valida o certificado do RDS (CA da AWS via NODE_EXTRA_CA_CERTS na Lambda).
resource "aws_ssm_parameter" "database_url" {
  name        = "${var.ssm_prefix}/db/url"
  description = "TraceFlow DATABASE_URL (TLS verify-full)"
  type        = "SecureString"
  value = format(
    "postgresql://%s:%s@%s:%d/%s?sslmode=verify-full",
    var.master_username,
    random_password.master.result,
    aws_db_instance.this.address,
    aws_db_instance.this.port,
    var.database_name,
  )
  tags = var.tags
}
