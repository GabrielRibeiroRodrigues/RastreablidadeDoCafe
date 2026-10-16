output "vpc_id" {
  description = "VPC ID."
  value       = aws_vpc.this.id
}

output "public_subnet_ids" {
  description = "Public subnets (RDS in public mode, ALB of the ECS alternative)."
  value       = aws_subnet.public[*].id
}

output "private_subnet_ids" {
  description = "Private subnets (no internet egress)."
  value       = aws_subnet.private[*].id
}

output "lambda_security_group_id" {
  description = "Security group for Lambdas attached to the VPC."
  value       = aws_security_group.lambda.id
}

output "database_security_group_id" {
  description = "Security group of the RDS instance."
  value       = aws_security_group.database.id
}
