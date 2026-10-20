variable "name_prefix" {
  description = "Prefix of the dashboard and alarm names."
  type        = string
}

variable "alarm_topic_arn" {
  description = "SNS topic notified by the alarms."
  type        = string
}

variable "api_id" {
  description = "HTTP API ID."
  type        = string
}

variable "api_function_name" {
  description = "API Lambda name."
  type        = string
}

variable "job_function_names" {
  description = "Job Lambdas by key (only the enabled ones)."
  type        = map(string)
  default     = {}
}

variable "db_instance_id" {
  description = "RDS instance identifier."
  type        = string
}

variable "db_connections_threshold" {
  description = "Alarm when connections reach this value (db.t4g.micro max_connections ~ 80)."
  type        = number
  default     = 60
}

variable "db_free_storage_threshold_gb" {
  description = "Alarm when the RDS free storage drops below this many GB."
  type        = number
  default     = 2
}

variable "dlq_name" {
  description = "Jobs dead-letter queue name."
  type        = string
}

variable "enable_recall_alarm" {
  description = "Create the recall failure alarm (requires state_machine_arn)."
  type        = bool
  default     = false
}

variable "state_machine_arn" {
  description = "Recall state machine ARN."
  type        = string
  default     = null
}

variable "tags" {
  description = "Tags applied to every resource."
  type        = map(string)
  default     = {}
}
