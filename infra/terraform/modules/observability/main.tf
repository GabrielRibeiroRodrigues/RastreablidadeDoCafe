# Dashboard e alarmes (-> SNS). ~10 alarmes (limite do free tier do CloudWatch) + o de disco do RDS.

data "aws_region" "current" {}

locals {
  region    = data.aws_region.current.region
  functions = merge({ api = var.api_function_name }, var.job_function_names)

  alarms = merge(
    {
      api-5xx = {
        description = "API Gateway is returning 5xx"
        namespace   = "AWS/ApiGateway"
        metric      = "5xx"
        dimensions  = { ApiId = var.api_id, Stage = "$default" }
        statistic   = "Sum"
        threshold   = 5
        period      = 300
      }
      api-latency-p95 = {
        description = "API p95 latency above 3 s"
        namespace   = "AWS/ApiGateway"
        metric      = "Latency"
        dimensions  = { ApiId = var.api_id, Stage = "$default" }
        statistic   = null
        extended    = "p95"
        threshold   = 3000
        period      = 300
      }
      api-throttles = {
        description = "API Lambda is being throttled (reserved concurrency reached)"
        namespace   = "AWS/Lambda"
        metric      = "Throttles"
        dimensions  = { FunctionName = var.api_function_name }
        statistic   = "Sum"
        threshold   = 1
        period      = 300
      }
      rds-cpu = {
        description = "RDS CPU above 80%"
        namespace   = "AWS/RDS"
        metric      = "CPUUtilization"
        dimensions  = { DBInstanceIdentifier = var.db_instance_id }
        statistic   = "Average"
        threshold   = 80
        period      = 600
      }
      rds-connections = {
        description = "RDS connections close to the db.t4g.micro limit"
        namespace   = "AWS/RDS"
        metric      = "DatabaseConnections"
        dimensions  = { DBInstanceIdentifier = var.db_instance_id }
        statistic   = "Maximum"
        threshold   = var.db_connections_threshold
        period      = 300
      }
      # Disco cheio para o banco (gp3 sem autoscaling, ADR 0010): o 11º alarme, ~US$ 0,10/mês.
      rds-free-storage = {
        description = "RDS free storage below ${var.db_free_storage_threshold_gb} GB"
        namespace   = "AWS/RDS"
        metric      = "FreeStorageSpace"
        dimensions  = { DBInstanceIdentifier = var.db_instance_id }
        statistic   = "Minimum"
        threshold   = var.db_free_storage_threshold_gb * 1024 * 1024 * 1024
        period      = 300
        comparison  = "LessThanThreshold"
      }
      dlq-messages = {
        description = "Failed asynchronous job invocations in the DLQ"
        namespace   = "AWS/SQS"
        metric      = "ApproximateNumberOfMessagesVisible"
        dimensions  = { QueueName = var.dlq_name }
        statistic   = "Maximum"
        threshold   = 1
        period      = 300
      }
    },
    { for key, fn in local.functions : "${key}-errors" => {
      description = "Lambda ${fn} errors"
      namespace   = "AWS/Lambda"
      metric      = "Errors"
      dimensions  = { FunctionName = fn }
      statistic   = "Sum"
      threshold   = key == "api" ? 5 : 1
      period      = 300
    } if !contains(["migrate", "audit-retention"], key) },
    # migrate é invocada pelo deploy (falha aparece no workflow); audit-retention é assíncrona e
    # mensal (falha cai na DLQ, que já tem alarme) — assim os alarmes ficam no limite do free tier.
    !var.enable_recall_alarm ? {} : {
      recall-failed = {
        description = "Recall executions failed"
        namespace   = "AWS/States"
        metric      = "ExecutionsFailed"
        dimensions  = { StateMachineArn = var.state_machine_arn }
        statistic   = "Sum"
        threshold   = 1
        period      = 300
      }
    },
  )
}

resource "aws_cloudwatch_metric_alarm" "this" {
  for_each = local.alarms

  alarm_name          = "${var.name_prefix}-${each.key}"
  alarm_description   = each.value.description
  namespace           = each.value.namespace
  metric_name         = each.value.metric
  dimensions          = each.value.dimensions
  statistic           = try(each.value.statistic, null)
  extended_statistic  = try(each.value.extended, null)
  period              = each.value.period
  evaluation_periods  = 1
  threshold           = each.value.threshold
  comparison_operator = try(each.value.comparison, "GreaterThanOrEqualToThreshold")
  treat_missing_data  = "notBreaching"
  alarm_actions       = [var.alarm_topic_arn]
  ok_actions          = [var.alarm_topic_arn]
  tags                = var.tags
}

# Erros do navegador (POST /v1/client-errors → log `event=client_error`) viram métrica: filtro de
# log não conta no limite de alarmes do free tier e aparece no dashboard.
resource "aws_cloudwatch_log_metric_filter" "client_errors" {
  name           = "${var.name_prefix}-client-errors"
  log_group_name = "/aws/lambda/${var.api_function_name}"
  pattern        = "{ $.event = \"client_error\" }"

  metric_transformation {
    name          = "ClientErrors"
    namespace     = "TraceFlow"
    value         = "1"
    default_value = "0"
  }
}

resource "aws_cloudwatch_dashboard" "this" {
  dashboard_name = var.name_prefix
  dashboard_body = jsonencode({
    widgets = [
      {
        type = "metric", x = 0, y = 0, width = 12, height = 6
        properties = {
          title  = "API: requests and errors"
          region = local.region
          stat   = "Sum"
          period = 300
          metrics = [
            ["AWS/ApiGateway", "Count", "ApiId", var.api_id, "Stage", "$default"],
            [".", "4xx", ".", ".", ".", "."],
            [".", "5xx", ".", ".", ".", "."],
          ]
        }
      },
      {
        type = "metric", x = 12, y = 0, width = 12, height = 6
        properties = {
          title  = "API: latency (ms)"
          region = local.region
          period = 300
          metrics = [
            ["AWS/ApiGateway", "Latency", "ApiId", var.api_id, "Stage", "$default", { stat = "p50" }],
            ["...", { stat = "p95" }],
            ["AWS/Lambda", "Duration", "FunctionName", var.api_function_name, { stat = "p95" }],
          ]
        }
      },
      {
        type = "metric", x = 0, y = 6, width = 12, height = 6
        properties = {
          title   = "Lambda: errors and throttles"
          region  = local.region
          stat    = "Sum"
          period  = 300
          metrics = flatten([for fn in values(local.functions) : [["AWS/Lambda", "Errors", "FunctionName", fn], ["AWS/Lambda", "Throttles", "FunctionName", fn]]])
        }
      },
      {
        type = "metric", x = 12, y = 6, width = 12, height = 6
        properties = {
          title  = "RDS: CPU (%) and connections"
          region = local.region
          period = 300
          metrics = [
            ["AWS/RDS", "CPUUtilization", "DBInstanceIdentifier", var.db_instance_id, { stat = "Average" }],
            [".", "DatabaseConnections", ".", ".", { stat = "Maximum", yAxis = "right" }],
          ]
        }
      },
      {
        type = "metric", x = 0, y = 12, width = 12, height = 6
        properties = {
          title  = "RDS: free storage (bytes)"
          region = local.region
          period = 300
          stat   = "Minimum"
          metrics = [
            ["AWS/RDS", "FreeStorageSpace", "DBInstanceIdentifier", var.db_instance_id],
          ]
        }
      },
      {
        type = "metric", x = 12, y = 12, width = 12, height = 6
        properties = {
          title  = "Jobs: DLQ depth"
          region = local.region
          period = 300
          stat   = "Maximum"
          metrics = [
            ["AWS/SQS", "ApproximateNumberOfMessagesVisible", "QueueName", var.dlq_name],
          ]
        }
      },
      {
        type = "metric", x = 0, y = 18, width = 12, height = 6
        properties = {
          title  = "Web: browser errors (ClientErrors)"
          region = local.region
          period = 300
          stat   = "Sum"
          metrics = [
            ["TraceFlow", "ClientErrors"],
          ]
        }
      },
    ]
  })
}
