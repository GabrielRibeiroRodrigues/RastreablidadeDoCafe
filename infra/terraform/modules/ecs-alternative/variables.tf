variable "name" {
  description = "Name prefix."
  type        = string
}

variable "vpc_id" {
  description = "VPC ID (network module)."
  type        = string
}

variable "public_subnet_ids" {
  description = "Subnets of the ALB."
  type        = list(string)
}

variable "private_subnet_ids" {
  description = "Subnets of the tasks (need NAT or VPC endpoints for ECR, logs, SSM)."
  type        = list(string)
}

variable "database_security_group_id" {
  description = "RDS security group (tasks egress to 5432)."
  type        = string
}

variable "image" {
  description = "API image (apps/api/Dockerfile) in ECR."
  type        = string
}

variable "cpu" {
  description = "Task CPU units."
  type        = number
  default     = 256
}

variable "memory" {
  description = "Task memory (MB)."
  type        = number
  default     = 512
}

variable "desired_count" {
  description = "Number of tasks."
  type        = number
  default     = 1
}

variable "environment" {
  description = "Plain environment variables."
  type        = map(string)
  default     = {}
}

variable "secrets" {
  description = "Environment variable name -> SSM parameter ARN."
  type        = map(string)
  default     = {}
}

variable "task_policy_statements" {
  description = "IAM statements of the task role."
  type = list(object({
    sid       = string
    actions   = list(string)
    resources = list(string)
  }))
  default = []
}

variable "certificate_arn" {
  description = "ACM certificate for HTTPS (null = HTTP only, not for production)."
  type        = string
  default     = null
}

variable "rate_limit_per_5min" {
  description = "WAF rate limit per IP (requests per 5 minutes)."
  type        = number
  default     = 1000
}

variable "log_retention_days" {
  description = "CloudWatch Logs retention."
  type        = number
  default     = 14
}

variable "tags" {
  description = "Tags applied to every resource."
  type        = map(string)
  default     = {}
}
