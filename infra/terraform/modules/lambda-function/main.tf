# Uma função Lambda com role própria (menor privilégio), log group com retenção e X-Ray.
# Usado pelos módulos `api` e `jobs`.

data "aws_partition" "current" {}

locals {
  log_group_name = "/aws/lambda/${var.name}"
}

resource "aws_cloudwatch_log_group" "this" {
  name              = local.log_group_name
  retention_in_days = var.log_retention_days
  tags              = var.tags
}

data "aws_iam_policy_document" "assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "this" {
  name               = "${var.name}-role"
  assume_role_policy = data.aws_iam_policy_document.assume.json
  tags               = var.tags
}

data "aws_iam_policy_document" "this" {
  statement {
    sid       = "Logs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.this.arn}:*"]
  }

  statement {
    sid       = "XRay"
    actions   = ["xray:PutTraceSegments", "xray:PutTelemetryRecords"]
    resources = ["*"]
  }

  dynamic "statement" {
    for_each = length(var.ssm_parameter_arns) > 0 ? [1] : []
    content {
      sid       = "ReadSecrets"
      actions   = ["ssm:GetParameter", "ssm:GetParameters"]
      resources = var.ssm_parameter_arns
    }
  }

  dynamic "statement" {
    for_each = var.dead_letter_queue_arn == null ? [] : [1]
    content {
      sid       = "DeadLetterQueue"
      actions   = ["sqs:SendMessage"]
      resources = [var.dead_letter_queue_arn]
    }
  }

  dynamic "statement" {
    for_each = var.policy_statements
    content {
      sid       = statement.value.sid
      actions   = statement.value.actions
      resources = statement.value.resources
    }
  }
}

resource "aws_iam_role_policy" "this" {
  name   = "${var.name}-policy"
  role   = aws_iam_role.this.id
  policy = data.aws_iam_policy_document.this.json
}

# ENIs na VPC: só quando a função roda em subnets privadas (modo private_networking).
resource "aws_iam_role_policy_attachment" "vpc" {
  count      = var.vpc_config == null ? 0 : 1
  role       = aws_iam_role.this.name
  policy_arn = "arn:${data.aws_partition.current.partition}:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

resource "aws_lambda_function" "this" {
  function_name = var.name
  description   = var.description
  role          = aws_iam_role.this.arn

  filename         = var.package_path
  source_code_hash = filebase64sha256(var.package_path)
  handler          = "index.handler"
  runtime          = "nodejs24.x"
  architectures    = ["arm64"]
  memory_size      = var.memory_size
  timeout          = var.timeout

  # -1 = sem reserva (usa o pool da conta).
  reserved_concurrent_executions = var.reserved_concurrency

  environment {
    variables = merge(
      {
        NODE_OPTIONS = "--enable-source-maps"
        # Desde o Node 20 a Lambda não carrega os certificados de CA da AWS (RDS) por padrão.
        NODE_EXTRA_CA_CERTS = "/var/runtime/ca-cert.pem"
      },
      var.environment,
    )
  }

  tracing_config {
    mode = "Active"
  }

  logging_config {
    log_format = "Text"
    log_group  = aws_cloudwatch_log_group.this.name
  }

  dynamic "dead_letter_config" {
    for_each = var.dead_letter_queue_arn == null ? [] : [1]
    content {
      target_arn = var.dead_letter_queue_arn
    }
  }

  dynamic "vpc_config" {
    for_each = var.vpc_config == null ? [] : [var.vpc_config]
    content {
      subnet_ids         = vpc_config.value.subnet_ids
      security_group_ids = vpc_config.value.security_group_ids
    }
  }

  tags = var.tags

  depends_on = [aws_iam_role_policy.this, aws_iam_role_policy_attachment.vpc]
}

# Invocações assíncronas (EventBridge Scheduler): no máximo 2 retentativas, eventos com até 1 h.
resource "aws_lambda_function_event_invoke_config" "this" {
  count                        = var.async ? 1 : 0
  function_name                = aws_lambda_function.this.function_name
  maximum_retry_attempts       = 2
  maximum_event_age_in_seconds = 3600
}
