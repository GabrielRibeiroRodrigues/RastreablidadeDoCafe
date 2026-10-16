# Lambdas de jobs: migrate (invocada pelo deploy), expiry-alert (diária, EventBridge Scheduler) e
# recall-step (passo da state machine de recall). Falhas assíncronas vão para uma DLQ SQS.

locals {
  common_env = merge(var.environment, {
    DATABASE_URL_SSM_PARAMETER = var.database_url_parameter_name
    DATABASE_POOL_MAX          = "2"
  })
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

# --- Agendamento diário do alerta de validade ---------------------------------------------------

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
  count              = var.enable_expiry_alert ? 1 : 0
  name               = "${var.name_prefix}-scheduler"
  assume_role_policy = data.aws_iam_policy_document.scheduler_assume.json
  tags               = var.tags
}

data "aws_iam_policy_document" "scheduler" {
  count = var.enable_expiry_alert ? 1 : 0

  statement {
    actions   = ["lambda:InvokeFunction"]
    resources = [module.expiry_alert[0].function_arn]
  }

  statement {
    actions   = ["sqs:SendMessage"]
    resources = [aws_sqs_queue.dlq.arn]
  }
}

resource "aws_iam_role_policy" "scheduler" {
  count  = var.enable_expiry_alert ? 1 : 0
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
