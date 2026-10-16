# Ambiente de produção do TraceFlow. Arquitetura e custos: docs/deploy.md e docs/adr/0010.

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = var.project
      Environment = var.environment
      ManagedBy   = "terraform"
      Repository  = var.github_repository
    }
  }
}

data "aws_caller_identity" "current" {}

locals {
  name       = "${var.project}-${var.environment}"
  account_id = data.aws_caller_identity.current.account_id
  ssm_prefix = "/${var.project}/${var.environment}"

  web_url = module.web.url

  # Modo padrão (private_networking = false): Lambdas fora da VPC, RDS com endpoint público + TLS.
  lambda_vpc_config = var.private_networking ? {
    subnet_ids         = module.network.private_subnet_ids
    security_group_ids = [module.network.lambda_security_group_id]
  } : null

  # Configuração da aplicação compartilhada entre API e jobs (apps/api/src/config/env.ts).
  app_environment = {
    NODE_ENV             = "production"
    LOG_LEVEL            = "info"
    TRUST_PROXY          = "1"
    AUTH_MODE            = "cognito"
    COGNITO_REGION       = var.aws_region
    COGNITO_USER_POOL_ID = module.auth.user_pool_id
    COGNITO_CLIENT_ID    = module.auth.client_id
    CORS_ORIGINS         = local.web_url
    PUBLIC_WEB_URL       = local.web_url
    SWAGGER_ENABLED      = "false"
    S3_BUCKET            = module.storage.bucket_name
    S3_REGION            = var.aws_region
    SNS_TOPIC_ARN        = module.workflow.notifications_topic_arn
  }
}

module "network" {
  source = "../../modules/network"

  name                  = local.name
  database_public_cidrs = var.private_networking ? [] : var.database_public_cidrs
  interface_endpoints   = var.private_networking ? var.interface_endpoints : []
}

module "database" {
  source = "../../modules/database"

  name = local.name
  # Sempre nas subnets "públicas": alternar private_networking só muda publicly_accessible e o
  # SG, sem trocar o subnet group (o que exigiria recriar a instância).
  subnet_ids          = module.network.public_subnet_ids
  security_group_id   = module.network.database_security_group_id
  publicly_accessible = !var.private_networking
  deletion_protection = var.db_deletion_protection
  skip_final_snapshot = !var.db_deletion_protection
  ssm_prefix          = local.ssm_prefix
}

module "web" {
  source = "../../modules/web"

  name                    = local.name
  bucket_name             = "${local.name}-web-${local.account_id}"
  aliases                 = var.web_aliases
  acm_certificate_arn     = var.web_certificate_arn
  content_security_policy = var.web_content_security_policy
}

module "auth" {
  source = "../../modules/auth"

  name                = local.name
  domain_prefix       = coalesce(var.cognito_domain_prefix, "${local.name}-${local.account_id}")
  callback_urls       = concat(["${local.web_url}/auth/callback"], var.extra_callback_urls)
  logout_urls         = concat(["${local.web_url}/login"], var.extra_logout_urls)
  deletion_protection = var.db_deletion_protection
}

module "storage" {
  source = "../../modules/storage"

  bucket_name          = "${local.name}-files-${local.account_id}"
  cors_allowed_origins = concat([local.web_url], var.extra_cors_origins)
  force_destroy        = !var.db_deletion_protection
}

module "workflow" {
  source = "../../modules/workflow"

  name_prefix              = local.name
  enable_recall            = var.enable_recall
  recall_step_function_arn = module.jobs.recall_step_function_arn
  notification_emails      = var.notification_emails
}

module "jobs" {
  source = "../../modules/jobs"

  name_prefix                 = local.name
  artifacts_dir               = var.artifacts_dir
  enable_expiry_alert         = var.enable_expiry_alert
  enable_recall               = var.enable_recall
  environment                 = local.app_environment
  database_url_parameter_name = module.database.database_url_parameter_name
  database_url_parameter_arn  = module.database.database_url_parameter_arn
  notifications_topic_arn     = module.workflow.notifications_topic_arn
  files_bucket_arn            = module.storage.bucket_arn
  vpc_config                  = local.lambda_vpc_config
}

module "api" {
  source = "../../modules/api"

  name                 = "${local.name}-api"
  package_path         = "${var.artifacts_dir}/api.zip"
  reserved_concurrency = var.api_reserved_concurrency
  cors_allowed_origins = concat([local.web_url], var.extra_cors_origins)
  vpc_config           = local.lambda_vpc_config
  ssm_parameter_arns   = [module.database.database_url_parameter_arn]

  environment = merge(local.app_environment, {
    DATABASE_URL_SSM_PARAMETER = module.database.database_url_parameter_name
    # Com reserved concurrency 5, no máximo 5 x 2 = 10 conexões da API no RDS.
    DATABASE_POOL_MAX        = "2"
    RECALL_STATE_MACHINE_ARN = var.enable_recall ? module.workflow.recall_state_machine_arn : ""
  })

  policy_statements = concat(
    [
      {
        sid       = "Files"
        actions   = ["s3:GetObject", "s3:PutObject"]
        resources = ["${module.storage.bucket_arn}/*"]
      },
      {
        sid       = "PublishNotifications"
        actions   = ["sns:Publish"]
        resources = [module.workflow.notifications_topic_arn]
      },
    ],
    var.enable_recall ? [{
      sid       = "StartRecall"
      actions   = ["states:StartExecution"]
      resources = [module.workflow.recall_state_machine_arn]
    }] : [],
  )
}

module "observability" {
  source = "../../modules/observability"

  name_prefix       = local.name
  alarm_topic_arn   = module.workflow.notifications_topic_arn
  api_id            = module.api.api_id
  api_function_name = module.api.function_name
  job_function_names = merge(
    { migrate = module.jobs.migrate_function_name },
    var.enable_expiry_alert ? { expiry-alert = module.jobs.expiry_alert_function_name } : {},
    var.enable_recall ? { recall-step = module.jobs.recall_step_function_name } : {},
  )
  db_instance_id      = module.database.instance_id
  dlq_name            = module.jobs.dlq_name
  enable_recall_alarm = var.enable_recall
  state_machine_arn   = module.workflow.recall_state_machine_arn
}

module "github_oidc" {
  source = "../../modules/github-oidc"

  repository      = var.github_repository
  role_name       = "${var.project}-github-deploy"
  resource_prefix = "${local.name}-"
  create_provider = var.create_github_oidc_provider
}
