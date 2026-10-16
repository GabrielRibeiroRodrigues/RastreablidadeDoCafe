variable "name_prefix" {
  description = "Prefix of the function names."
  type        = string
}

variable "artifacts_dir" {
  description = "Directory with the zips produced by `pnpm bundle:lambda` (apps/api/dist-lambda)."
  type        = string
}

variable "enable_expiry_alert" {
  description = "Create the expiry-alert Lambda and its schedule (needs dist-lambda/expiry-alert.zip)."
  type        = bool
  default     = true
}

variable "enable_recall" {
  description = "Create the recall-step Lambda (needs dist-lambda/recall-step.zip)."
  type        = bool
  default     = true
}

variable "expiry_alert_schedule" {
  description = "Scheduler expression, evaluated in America/Sao_Paulo."
  type        = string
  default     = "cron(0 7 * * ? *)"
}

variable "environment" {
  description = "Environment shared by every job (same app config as the API)."
  type        = map(string)
  default     = {}
}

variable "database_url_parameter_name" {
  description = "SSM parameter with DATABASE_URL."
  type        = string
}

variable "database_url_parameter_arn" {
  description = "ARN of the DATABASE_URL parameter."
  type        = string
}

variable "notifications_topic_arn" {
  description = "SNS topic for notifications."
  type        = string
}

variable "files_bucket_arn" {
  description = "Files bucket (recall reports)."
  type        = string
}

variable "vpc_config" {
  description = "VPC attachment (null = outside the VPC)."
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
