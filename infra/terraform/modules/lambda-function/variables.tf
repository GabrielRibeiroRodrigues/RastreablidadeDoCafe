variable "name" {
  description = "Function name (also prefixes the role and the log group)."
  type        = string
}

variable "description" {
  description = "Function description."
  type        = string
  default     = ""
}

variable "package_path" {
  description = "Path to the deployment zip produced by `pnpm bundle:lambda`."
  type        = string
}

variable "memory_size" {
  description = "Memory in MB (CPU scales with it)."
  type        = number
  default     = 512
}

variable "timeout" {
  description = "Timeout in seconds."
  type        = number
  default     = 30
}

variable "reserved_concurrency" {
  description = "Reserved concurrency; -1 disables the reservation."
  type        = number
  default     = -1
}

variable "environment" {
  description = "Environment variables (never plain-text secrets: use *_SSM_PARAMETER)."
  type        = map(string)
  default     = {}
}

variable "ssm_parameter_arns" {
  description = "SSM parameters the function may read (runtime secrets)."
  type        = list(string)
  default     = []
}

variable "policy_statements" {
  description = "Extra IAM statements (least privilege)."
  type = list(object({
    sid       = string
    actions   = list(string)
    resources = list(string)
  }))
  default = []
}

variable "dead_letter_queue_arn" {
  description = "SQS queue for failed asynchronous invocations (null = none)."
  type        = string
  default     = null
}

variable "async" {
  description = "Configure asynchronous invocation retries (scheduled/event-driven functions)."
  type        = bool
  default     = false
}

variable "vpc_config" {
  description = "Subnets and security groups when the function runs inside the VPC (null = outside)."
  type = object({
    subnet_ids         = list(string)
    security_group_ids = list(string)
  })
  default = null
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
