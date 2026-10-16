variable "name_prefix" {
  description = "Name prefix."
  type        = string
}

variable "enable_recall" {
  description = "Create the recall state machine (requires recall_step_function_arn)."
  type        = bool
  default     = true
}

variable "recall_step_function_arn" {
  description = "Recall step Lambda ARN."
  type        = string
  default     = null
}

variable "notification_emails" {
  description = "E-mails subscribed to the notifications topic (alarms, recall failures)."
  type        = list(string)
  default     = []
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
