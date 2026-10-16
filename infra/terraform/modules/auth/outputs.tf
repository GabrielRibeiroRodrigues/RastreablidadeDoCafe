output "user_pool_id" {
  description = "User pool ID (API: COGNITO_USER_POOL_ID)."
  value       = aws_cognito_user_pool.this.id
}

output "user_pool_arn" {
  description = "User pool ARN."
  value       = aws_cognito_user_pool.this.arn
}

output "client_id" {
  description = "Web app client ID (API: COGNITO_CLIENT_ID, web: VITE_COGNITO_CLIENT_ID)."
  value       = aws_cognito_user_pool_client.web.id
}

output "issuer" {
  description = "OIDC issuer (web: VITE_COGNITO_AUTHORITY)."
  value       = "https://cognito-idp.${data.aws_region.current.region}.amazonaws.com/${aws_cognito_user_pool.this.id}"
}

output "hosted_ui_url" {
  description = "Hosted UI base URL (web: VITE_COGNITO_DOMAIN)."
  value       = "https://${aws_cognito_user_pool_domain.this.domain}.auth.${data.aws_region.current.region}.amazoncognito.com"
}
