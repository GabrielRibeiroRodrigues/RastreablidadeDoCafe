variable "aws_region" {
  description = "AWS region."
  type        = string
  default     = "us-east-1"
}

variable "project" {
  description = "Project name (resource prefix)."
  type        = string
  default     = "traceflow"
}

variable "environment" {
  description = "Environment name."
  type        = string
  default     = "prod"
}

variable "github_repository" {
  description = "Repository allowed to deploy via OIDC."
  type        = string
  default     = "GabrielRibeiroRodrigues/RastreablidadeDoCafe"
}

variable "create_github_oidc_provider" {
  description = "Create the GitHub OIDC provider (false if the account already has one)."
  type        = bool
  default     = true
}

variable "artifacts_dir" {
  description = "Lambda zips from `pnpm --filter @traceflow/api bundle:lambda`."
  type        = string
  default     = "../../../../apps/api/dist-lambda"
}

variable "enable_expiry_alert" {
  description = "Deploy the expiry-alert job (requires expiry-alert.zip)."
  type        = bool
  default     = true
}

variable "enable_recall" {
  description = "Deploy the recall-step job and state machine (requires recall-step.zip)."
  type        = bool
  default     = true
}

variable "private_networking" {
  description = "Lambdas inside the VPC + private RDS + paid interface endpoints (ADR 0010)."
  type        = bool
  default     = false
}

variable "interface_endpoints" {
  description = "Interface endpoints created in private_networking mode (~US$ 7/month each)."
  type        = list(string)
  default     = ["ssm", "sns", "states"]
}

variable "database_public_cidrs" {
  description = "CIDRs allowed to reach the public RDS endpoint (public mode only)."
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "db_deletion_protection" {
  description = "Protect RDS, Cognito and the files bucket. Set false before `terraform destroy`."
  type        = bool
  default     = true
}

variable "api_reserved_concurrency" {
  description = "API Lambda reserved concurrency (-1 if the account concurrency limit is 10)."
  type        = number
  default     = 5
}

variable "notification_emails" {
  description = "E-mails subscribed to alarms and recall notifications."
  type        = list(string)
  default     = []
}

variable "cognito_domain_prefix" {
  description = "Hosted UI prefix (default: traceflow-prod-<account id>)."
  type        = string
  default     = null
}

variable "web_aliases" {
  description = "Custom domains for CloudFront (optional)."
  type        = list(string)
  default     = []
}

variable "web_certificate_arn" {
  description = "ACM certificate in us-east-1 for web_aliases."
  type        = string
  default     = null
}

variable "web_content_security_policy" {
  description = "Content-Security-Policy for the SPA (empty = not sent)."
  type        = string
  default     = ""
}

variable "extra_callback_urls" {
  description = "Extra Cognito callback URLs (e.g. http://localhost:5173/auth/callback)."
  type        = list(string)
  default     = []
}

variable "extra_logout_urls" {
  description = "Extra Cognito sign-out URLs (e.g. http://localhost:5173/login)."
  type        = list(string)
  default     = []
}

variable "extra_cors_origins" {
  description = "Extra origins allowed by the API and the files bucket."
  type        = list(string)
  default     = []
}
