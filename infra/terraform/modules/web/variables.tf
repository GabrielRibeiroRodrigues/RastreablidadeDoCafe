variable "name" {
  description = "Name prefix of the CloudFront policies."
  type        = string
}

variable "bucket_name" {
  description = "Globally unique bucket name for the SPA build."
  type        = string
}

variable "aliases" {
  description = "Custom domains (optional; requires acm_certificate_arn in us-east-1)."
  type        = list(string)
  default     = []
}

variable "acm_certificate_arn" {
  description = "ACM certificate (us-east-1) for the aliases; null = *.cloudfront.net."
  type        = string
  default     = null
}

variable "content_security_policy" {
  description = "Content-Security-Policy header; empty = not sent (see docs/deploy.md)."
  type        = string
  default     = ""
}

variable "tags" {
  description = "Tags applied to every resource."
  type        = map(string)
  default     = {}
}
