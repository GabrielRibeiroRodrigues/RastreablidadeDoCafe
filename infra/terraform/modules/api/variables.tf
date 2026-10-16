variable "name" {
  description = "Name of the function and of the HTTP API."
  type        = string
}

variable "package_path" {
  description = "dist-lambda/api.zip."
  type        = string
}

variable "memory_size" {
  description = "Lambda memory (MB)."
  type        = number
  default     = 1024
}

variable "timeout" {
  description = "Lambda timeout (s). API Gateway cuts at 30 s."
  type        = number
  default     = 29
}

variable "reserved_concurrency" {
  description = "Caps concurrent instances to protect RDS connections (-1 = no cap)."
  type        = number
  default     = 5
}

variable "environment" {
  description = "Lambda environment variables."
  type        = map(string)
  default     = {}
}

variable "ssm_parameter_arns" {
  description = "SSM parameters readable at runtime."
  type        = list(string)
  default     = []
}

variable "policy_statements" {
  description = "Extra IAM statements."
  type = list(object({
    sid       = string
    actions   = list(string)
    resources = list(string)
  }))
  default = []
}

variable "vpc_config" {
  description = "VPC attachment (null = outside the VPC)."
  type = object({
    subnet_ids         = list(string)
    security_group_ids = list(string)
  })
  default = null
}

variable "cors_allowed_origins" {
  description = "Origins allowed by CORS (the web URL)."
  type        = list(string)
}

variable "throttling_burst_limit" {
  description = "Stage burst limit."
  type        = number
  default     = 50
}

variable "throttling_rate_limit" {
  description = "Stage steady-state requests per second."
  type        = number
  default     = 20
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
