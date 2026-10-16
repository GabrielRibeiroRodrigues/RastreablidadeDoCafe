output "notifications_topic_arn" {
  description = "SNS topic for notifications and alarms."
  value       = aws_sns_topic.notifications.arn
}

output "recall_state_machine_arn" {
  description = "Recall state machine ARN (null when disabled)."
  value       = local.enabled ? aws_sfn_state_machine.recall[0].arn : null
}
