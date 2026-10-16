output "alb_dns_name" {
  description = "ALB DNS name."
  value       = aws_lb.this.dns_name
}

output "service_name" {
  description = "ECS service name."
  value       = aws_ecs_service.api.name
}

output "web_acl_arn" {
  description = "WAF web ACL ARN."
  value       = aws_wafv2_web_acl.this.arn
}
