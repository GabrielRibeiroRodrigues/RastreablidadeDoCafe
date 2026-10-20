# Lambdas de jobs: migrate (invocada pelo deploy), expiry-alert (diária, EventBridge Scheduler) e
# recall-step (passo da state machine de recall) e audit-retention (mensal: arquiva e remove a
# auditoria além da retenção). Falhas assíncronas vão para uma DLQ SQS.

locals {
  common_env = merge(var.environment, {
    DATABASE_URL_SSM_PARAMETER = var.database_url_parameter_name
    DATABASE_POOL_MAX          = "2"
  })

  # Funções disparadas pelo EventBridge Scheduler (o papel do scheduler pode invocar todas).
  scheduled_function_arns = concat(
    var.enable_expiry_alert ? [module.expiry_alert[0].function_arn] : [],
    var.enable_audit_retention ? [module.audit_retention[0].function_arn] : [],
  )
  any_schedule = var.enable_expiry_alert || var.enable_audit_retention
}

resource "aws_sqs_queue" "dlq" {
  name                      = "${var.name_prefix}-jobs-dlq"
  message_retention_seconds = 1209600 # 14 dias
  sqs_managed_sse_enabled   = true
  tags                      = var.tags
}

module "migrate" {
  source = "../lambda-function"

  name               = "${var.name_prefix}-migrate"
  description        = "Applies pending Prisma migrations (invoked by the deploy workflow)"
  package_path       = "${var.artifacts_dir}/migrate.zip"
  memory_size        = 512
  timeout            = 300
  environment        = local.common_env
  ssm_parameter_arns = [var.database_url_parameter_arn]
  vpc_config         = var.vpc_config
  log_retention_days = var.log_retention_days
  tags               = var.tags
}

module "expiry_alert" {
  source = "../lambda-function"
  count  = var.enable_expiry_alert ? 1 : 0

  name                  = "${var.name_prefix}-expiry-alert"
  description           = "Daily alert for lots close to expiry"
  package_path          = "${var.artifacts_dir}/expiry-alert.zip"
  memory_size           = 512
  timeout               = 120
  environment           = local.common_env
  ssm_parameter_arns    = [var.database_url_parameter_arn]
  dead_letter_queue_arn = aws_sqs_queue.dlq.arn
  async                 = true
  vpc_config            = var.vpc_config
  log_retention_days    = var.log_retention_days
  tags                  = var.tags

  policy_statements = [{
    sid       = "PublishNotifications"
    actions   = ["sns:Publish"]
    resources = [var.notifications_topic_arn]
  }]
}

module "recall_step" {
  source = "../lambda-function"
  count  = var.enable_recall ? 1 : 0

  name                  = "${var.name_prefix}-recall-step"
  description           = "Recall workflow step (BLOCK_LOTS, REPORT, NOTIFY)"
  package_path          = "${var.artifacts_dir}/recall-step.zip"
  memory_size           = 1024
  timeout               = 300
  environment           = local.common_env
  ssm_parameter_arns    = [var.database_url_parameter_arn]
  dead_letter_queue_arn = aws_sqs_queue.dlq.arn
  vpc_config            = var.vpc_config
  log_retention_days    = var.log_retention_days
  tags                  = var.tags

  policy_statements = [
    {
      sid       = "PublishNotifications"
      actions   = ["sns:Publish"]
      resources = [var.notifications_topic_arn]
    },
    {
      sid       = "WriteReports"
      actions   = ["s3:PutObject", "s3:GetObject"]
      resources = ["${var.files_bucket_arn}/*"]
    },
  ]
}

module "audit_retention" {
  source = "../lambda-function"
  count  = var.enable_audit_retention ? 1 : 0

  name                  = "${var.name_prefix}-audit-retention"
  description           = "Monthly: archives audit records past retention to S3, then deletes them"
  package_path          = "${var.artifacts_dir}/audit-retention.zip"
  memory_size           = 512
  timeout               = 600
  environment           = local.common_env
  ssm_parameter_arns    = [var.database_url_parameter_arn]
  dead_letter_queue_arn = aws_sqs_queue.dlq.arn
  async                 = true
  vpc_config            = var.vpc_config
  log_retention_days    = var.log_retention_days
  tags                  = var.tags

  policy_statements = [{
    sid       = "WriteAuditArchive"
    actions   = ["s3:PutObject"]
    resources = ["${var.files_bucket_arn}/*/audit-archive/*"]
  }]
}

# --- Agendamentos (EventBridge Scheduler) --------------------------------------------------------

data "aws_iam_policy_document" "scheduler_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["scheduler.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "scheduler" {
  count              = local.any_schedule ? 1 : 0
  name               = "${var.name_prefix}-scheduler"
  assume_role_policy = data.aws_iam_policy_document.scheduler_assume.json
  tags               = var.tags
}

data "aws_iam_policy_document" "scheduler" {
  count = local.any_schedule ? 1 : 0

  statement {
    actions   = ["lambda:InvokeFunction"]
    resources = local.scheduled_function_arns
  }

  statement {
    actions   = ["sqs:SendMessage"]
    resources = [aws_sqs_queue.dlq.arn]
  }
}

resource "aws_iam_role_policy" "scheduler" {
  count  = local.any_schedule ? 1 : 0
  name   = "${var.name_prefix}-scheduler"
  role   = aws_iam_role.scheduler[0].id
  policy = data.aws_iam_policy_document.scheduler[0].json
}

resource "aws_scheduler_schedule" "expiry_alert" {
  count       = var.enable_expiry_alert ? 1 : 0
  name        = "${var.name_prefix}-expiry-alert"
  description = "Daily expiry alert"

  schedule_expression          = var.expiry_alert_schedule
  schedule_expression_timezone = "America/Sao_Paulo"

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = module.expiry_alert[0].function_arn
    role_arn = aws_iam_role.scheduler[0].arn
    input    = jsonencode({ source = "scheduler" })

    retry_policy {
      maximum_retry_attempts       = 2
      maximum_event_age_in_seconds = 3600
    }

    dead_letter_config {
      arn = aws_sqs_queue.dlq.arn
    }
  }
}

resource "aws_scheduler_schedule" "audit_retention" {
  count       = var.enable_audit_retention ? 1 : 0
  name        = "${var.name_prefix}-audit-retention"
  description = "Monthly audit retention (archive to S3, then delete)"

  schedule_expression          = var.audit_retention_schedule
  schedule_expression_timezone = "America/Sao_Paulo"

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = module.audit_retention[0].function_arn
    role_arn = aws_iam_role.scheduler[0].arn
    input    = jsonencode({ source = "scheduler" })

    retry_policy {
      maximum_retry_attempts       = 2
      maximum_event_age_in_seconds = 3600
    }

    dead_letter_config {
      arn = aws_sqs_queue.dlq.arn
    }
  }
}
