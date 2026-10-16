output "dashboard_name" {
  description = "CloudWatch dashboard name."
  value       = aws_cloudwatch_dashboard.this.dashboard_name
}

output "alarm_names" {
  description = "Alarm names."
  value       = [for alarm in aws_cloudwatch_metric_alarm.this : alarm.alarm_name]
}
