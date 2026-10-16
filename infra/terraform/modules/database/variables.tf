variable "name" {
  description = "Instance identifier."
  type        = string
}

variable "subnet_ids" {
  description = "Subnets of the DB subnet group (2 AZs)."
  type        = list(string)
}

variable "security_group_id" {
  description = "Security group of the instance."
  type        = string
}

variable "publicly_accessible" {
  description = "Public endpoint (default network mode, ADR 0010)."
  type        = bool
  default     = true
}

variable "engine_version" {
  description = "PostgreSQL major version (minor upgrades are automatic)."
  type        = string
  default     = "17"
}

variable "instance_class" {
  description = "Instance class (db.t4g.micro is free tier eligible)."
  type        = string
  default     = "db.t4g.micro"
}

variable "allocated_storage" {
  description = "Storage in GB (free tier: 20)."
  type        = number
  default     = 20
}

variable "database_name" {
  description = "Initial database."
  type        = string
  default     = "traceflow"
}

variable "master_username" {
  description = "Master user (not `postgres`)."
  type        = string
  default     = "traceflow_admin"
}

variable "backup_retention_days" {
  description = "Automated backup retention."
  type        = number
  default     = 7
}

variable "deletion_protection" {
  description = "Block deletion (disable before `terraform destroy`)."
  type        = bool
  default     = true
}

variable "skip_final_snapshot" {
  description = "Skip the final snapshot on deletion."
  type        = bool
  default     = false
}

variable "ssm_prefix" {
  description = "SSM path prefix, e.g. /traceflow/prod."
  type        = string
}

variable "log_retention_days" {
  description = "Retention of the exported PostgreSQL logs."
  type        = number
  default     = 14
}

variable "tags" {
  description = "Tags applied to every resource."
  type        = map(string)
  default     = {}
}
