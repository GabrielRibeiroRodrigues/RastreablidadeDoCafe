output "instance_id" {
  description = "RDS instance identifier (CloudWatch dimension)."
  value       = aws_db_instance.this.identifier
}

output "address" {
  description = "Endpoint hostname."
  value       = aws_db_instance.this.address
}

output "database_url_parameter_name" {
  description = "SSM parameter holding DATABASE_URL."
  value       = aws_ssm_parameter.database_url.name
}

output "database_url_parameter_arn" {
  description = "ARN of the DATABASE_URL parameter (IAM)."
  value       = aws_ssm_parameter.database_url.arn
}

output "master_password_parameter_name" {
  description = "SSM parameter holding the master password."
  value       = aws_ssm_parameter.master_password.name
}
