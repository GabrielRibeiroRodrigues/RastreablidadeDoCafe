output "migrate_function_name" {
  description = "Migrate Lambda (invoked by the deploy workflow)."
  value       = module.migrate.function_name
}

output "expiry_alert_function_name" {
  description = "Expiry alert Lambda (null when disabled)."
  value       = var.enable_expiry_alert ? module.expiry_alert[0].function_name : null
}

output "recall_step_function_name" {
  description = "Recall step Lambda (null when disabled)."
  value       = var.enable_recall ? module.recall_step[0].function_name : null
}

output "recall_step_function_arn" {
  description = "Recall step Lambda ARN (null when disabled)."
  value       = var.enable_recall ? module.recall_step[0].function_arn : null
}

output "dlq_name" {
  description = "Dead-letter queue name."
  value       = aws_sqs_queue.dlq.name
}

output "dlq_arn" {
  description = "Dead-letter queue ARN."
  value       = aws_sqs_queue.dlq.arn
}
