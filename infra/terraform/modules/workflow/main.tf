# Notificações (SNS) e state machine do recall: BLOCK_LOTS -> REPORT -> NOTIFY, cada passo com
# retentativas e backoff; qualquer falha publica um aviso no SNS e encerra como Failed.
# Entrada da execução: { "recallId": "...", "companyId": "..." }.

data "aws_caller_identity" "current" {}

# Sem KMS de propósito: alarmes do CloudWatch não publicam em tópico cifrado com a chave gerenciada
# aws/sns, e as mensagens não carregam dados sensíveis (IDs e contagens).
resource "aws_sns_topic" "notifications" {
  name = "${var.name_prefix}-notifications"
  tags = var.tags
}

data "aws_iam_policy_document" "topic" {
  statement {
    sid       = "AllowCloudWatchAlarms"
    actions   = ["sns:Publish"]
    resources = [aws_sns_topic.notifications.arn]
    principals {
      type        = "Service"
      identifiers = ["cloudwatch.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }

  statement {
    sid       = "AllowAccountPrincipals"
    actions   = ["sns:Publish", "sns:Subscribe", "sns:GetTopicAttributes"]
    resources = [aws_sns_topic.notifications.arn]
    principals {
      type        = "AWS"
      identifiers = ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"]
    }
  }
}

resource "aws_sns_topic_policy" "notifications" {
  arn    = aws_sns_topic.notifications.arn
  policy = data.aws_iam_policy_document.topic.json
}

# A assinatura fica "PendingConfirmation" até o destinatário clicar no link do e-mail.
resource "aws_sns_topic_subscription" "email" {
  for_each  = toset(var.notification_emails)
  topic_arn = aws_sns_topic.notifications.arn
  protocol  = "email"
  endpoint  = each.value
}

# --- State machine -------------------------------------------------------------------------------

locals {
  enabled = var.enable_recall

  retry = [
    {
      ErrorEquals     = ["Lambda.ServiceException", "Lambda.AWSLambdaException", "Lambda.SdkClientException", "Lambda.TooManyRequestsException"]
      IntervalSeconds = 2
      MaxAttempts     = 4
      BackoffRate     = 2
      JitterStrategy  = "FULL"
    },
    {
      ErrorEquals     = ["States.TaskFailed", "States.Timeout"]
      IntervalSeconds = 5
      MaxAttempts     = 2
      BackoffRate     = 3
    },
  ]

  catch = [{ ErrorEquals = ["States.ALL"], ResultPath = "$.error", Next = "NotifyFailure" }]

  steps = {
    BlockLots = { step = "BLOCK_LOTS", next = "Report", result = "$.results.blockLots" }
    Report    = { step = "REPORT", next = "Notify", result = "$.results.report" }
    Notify    = { step = "NOTIFY", next = "Succeeded", result = "$.results.notify" }
  }

  step = { for name, cfg in local.steps : name => {
    Type     = "Task"
    Resource = "arn:aws:states:::lambda:invoke"
    Parameters = {
      FunctionName = var.recall_step_function_arn
      Payload = {
        "recallId.$"  = "$.recallId"
        "companyId.$" = "$.companyId"
        step          = cfg.step
      }
    }
    ResultSelector = { "result.$" = "$.Payload" }
    ResultPath     = cfg.result
    TimeoutSeconds = 300
    Retry          = local.retry
    Catch          = local.catch
    Next           = "${name}Check"
  } }

  # A Lambda do passo não lança erro quando a regra de negócio falha: ela marca o recall como
  # FAILED, notifica e devolve `status = FAILED`. Sem esta verificação a máquina seguiria adiante.
  step_check = { for name, cfg in local.steps : "${name}Check" => {
    Type = "Choice"
    Choices = [{
      Variable     = "${cfg.result}.result.status"
      StringEquals = "FAILED"
      Next         = "StepFailed"
    }]
    Default = cfg.next
  } }

  definition = {
    Comment = "TraceFlow recall: block lots, build the report, notify"
    StartAt = "BlockLots"
    States = merge(local.step, local.step_check, {
      Succeeded = { Type = "Succeed" }
      # O app já registrou a falha e notificou: só encerra a execução como falha.
      StepFailed = { Type = "Fail", Error = "RecallStepFailed", Cause = "The step reported FAILED (already notified by the app)" }
      NotifyFailure = {
        Type     = "Task"
        Resource = "arn:aws:states:::sns:publish"
        Parameters = {
          TopicArn    = aws_sns_topic.notifications.arn
          Subject     = "TraceFlow: falha no recall"
          "Message.$" = "States.Format('Recall {} (empresa {}) falhou: {}', $.recallId, $.companyId, States.JsonToString($.error))"
        }
        ResultPath = null
        Next       = "Failed"
      }
      Failed = { Type = "Fail", Error = "RecallFailed", Cause = "A recall step failed after retries" }
    })
  }
}

resource "aws_cloudwatch_log_group" "recall" {
  count             = local.enabled ? 1 : 0
  name              = "/aws/vendedlogs/states/${var.name_prefix}-recall"
  retention_in_days = var.log_retention_days
  tags              = var.tags
}

data "aws_iam_policy_document" "sfn_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["states.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }
}

resource "aws_iam_role" "sfn" {
  count              = local.enabled ? 1 : 0
  name               = "${var.name_prefix}-recall-sfn"
  assume_role_policy = data.aws_iam_policy_document.sfn_assume.json
  tags               = var.tags
}

data "aws_iam_policy_document" "sfn" {
  count = local.enabled ? 1 : 0

  statement {
    sid       = "InvokeRecallStep"
    actions   = ["lambda:InvokeFunction"]
    resources = [var.recall_step_function_arn, "${var.recall_step_function_arn}:*"]
  }

  statement {
    sid       = "NotifyFailure"
    actions   = ["sns:Publish"]
    resources = [aws_sns_topic.notifications.arn]
  }

  statement {
    sid       = "XRay"
    actions   = ["xray:PutTraceSegments", "xray:PutTelemetryRecords", "xray:GetSamplingRules", "xray:GetSamplingTargets"]
    resources = ["*"]
  }

  # Entrega de logs do Step Functions (APIs de log delivery não aceitam ARN de recurso).
  statement {
    sid = "LogDelivery"
    actions = [
      "logs:CreateLogDelivery", "logs:GetLogDelivery", "logs:UpdateLogDelivery",
      "logs:DeleteLogDelivery", "logs:ListLogDeliveries", "logs:PutResourcePolicy",
      "logs:DescribeResourcePolicies", "logs:DescribeLogGroups",
    ]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "sfn" {
  count  = local.enabled ? 1 : 0
  name   = "${var.name_prefix}-recall-sfn"
  role   = aws_iam_role.sfn[0].id
  policy = data.aws_iam_policy_document.sfn[0].json
}

resource "aws_sfn_state_machine" "recall" {
  count      = local.enabled ? 1 : 0
  name       = "${var.name_prefix}-recall"
  role_arn   = aws_iam_role.sfn[0].arn
  type       = "STANDARD"
  definition = jsonencode(local.definition)

  logging_configuration {
    log_destination        = "${aws_cloudwatch_log_group.recall[0].arn}:*"
    include_execution_data = false
    level                  = "ERROR"
  }

  tracing_configuration {
    enabled = true
  }

  tags       = var.tags
  depends_on = [aws_iam_role_policy.sfn]
}
