variable "name" {
  description = "Name prefix."
  type        = string
}

variable "cidr_block" {
  description = "VPC CIDR."
  type        = string
  default     = "10.20.0.0/16"
}

variable "database_public_cidrs" {
  description = "CIDRs allowed to reach PostgreSQL directly (public mode). Empty in private mode."
  type        = list(string)
  default     = []
}

variable "interface_endpoints" {
  description = "Interface endpoint services (e.g. sns, states, ssm). Each costs ~US$ 7/month."
  type        = list(string)
  default     = []
}

variable "tags" {
  description = "Tags applied to every resource."
  type        = map(string)
  default     = {}
}
