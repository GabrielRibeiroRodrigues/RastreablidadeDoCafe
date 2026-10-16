output "api_url" {
  description = "Base URL of the API (web: VITE_API_URL)."
  value       = aws_apigatewayv2_stage.default.invoke_url
}

output "api_id" {
  description = "HTTP API ID (CloudWatch dimension)."
  value       = aws_apigatewayv2_api.this.id
}

output "function_name" {
  description = "API Lambda name."
  value       = module.function.function_name
}
