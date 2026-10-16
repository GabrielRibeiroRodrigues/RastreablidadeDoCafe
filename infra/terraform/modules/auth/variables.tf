variable "name" {
  description = "User pool name."
  type        = string
}

variable "domain_prefix" {
  description = "Hosted UI prefix: https://<prefix>.auth.<region>.amazoncognito.com (globally unique)."
  type        = string
}

variable "callback_urls" {
  description = "Allowed OAuth callback URLs (the web /auth/callback route)."
  type        = list(string)
}

variable "logout_urls" {
  description = "Allowed sign-out URLs (the web /login route)."
  type        = list(string)
}

variable "groups" {
  description = "Groups (API roles) and their descriptions."
  type        = map(string)
  default = {
    admin    = "Administrador da empresa"
    operator = "Operação: recebimento, produção, expedição"
    auditor  = "Somente leitura e rastreio"
  }
}

variable "deletion_protection" {
  description = "Protect the user pool from deletion."
  type        = bool
  default     = true
}

variable "tags" {
  description = "Tags applied to every resource."
  type        = map(string)
  default     = {}
}
