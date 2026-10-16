output "web_url" {
  description = "Public URL of the web app."
  value       = module.web.url
}

output "web_bucket" {
  description = "Bucket that receives the web build."
  value       = module.web.bucket_name
}

output "web_distribution_id" {
  description = "CloudFront distribution (invalidation)."
  value       = module.web.distribution_id
}

output "api_url" {
  description = "API base URL (VITE_API_URL)."
  value       = trimsuffix(module.api.api_url, "/")
}

output "cognito_authority" {
  description = "VITE_COGNITO_AUTHORITY."
  value       = module.auth.issuer
}

output "cognito_client_id" {
  description = "VITE_COGNITO_CLIENT_ID."
  value       = module.auth.client_id
}

output "cognito_domain" {
  description = "VITE_COGNITO_DOMAIN."
  value       = module.auth.hosted_ui_url
}

output "cognito_user_pool_id" {
  description = "User pool (admin-create-user)."
  value       = module.auth.user_pool_id
}

output "migrate_function_name" {
  description = "Lambda invoked after each apply."
  value       = module.jobs.migrate_function_name
}

output "database_address" {
  description = "RDS endpoint."
  value       = module.database.address
}

output "database_url_parameter" {
  description = "SSM parameter with DATABASE_URL (aws ssm get-parameter --with-decryption)."
  value       = module.database.database_url_parameter_name
}

output "files_bucket" {
  description = "Private files bucket."
  value       = module.storage.bucket_name
}

output "github_deploy_role_arn" {
  description = "GitHub secret AWS_DEPLOY_ROLE_ARN."
  value       = module.github_oidc.role_arn
}

output "dashboard_url" {
  description = "CloudWatch dashboard."
  value       = "https://${var.aws_region}.console.aws.amazon.com/cloudwatch/home?region=${var.aws_region}#dashboards/dashboard/${module.observability.dashboard_name}"
}
