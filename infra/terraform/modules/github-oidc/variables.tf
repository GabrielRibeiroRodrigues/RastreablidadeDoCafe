variable "repository" {
  description = "GitHub repository allowed to assume the role (owner/name)."
  type        = string
  default     = "GabrielRibeiroRodrigues/RastreablidadeDoCafe"
}

variable "environments" {
  description = "GitHub environments allowed to assume the role."
  type        = list(string)
  default     = ["production"]
}

variable "role_name" {
  description = "Deploy role name."
  type        = string
  default     = "traceflow-github-deploy"
}

variable "resource_prefix" {
  description = "IAM roles the deploy role may manage must start with this prefix."
  type        = string
  default     = "traceflow-"
}

variable "create_provider" {
  description = "Create the GitHub OIDC provider (false if the account already has one)."
  type        = bool
  default     = true
}

variable "tags" {
  description = "Tags applied to every resource."
  type        = map(string)
  default     = {}
}
