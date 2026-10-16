variable "bucket_name" {
  description = "Globally unique bucket name."
  type        = string
}

variable "cors_allowed_origins" {
  description = "Web origins allowed to upload/download directly (e.g. the CloudFront URL)."
  type        = list(string)
}

variable "versioning" {
  description = "Keep previous object versions for 30 days (protection against overwrites)."
  type        = bool
  default     = true
}

variable "force_destroy" {
  description = "Allow `terraform destroy` to delete a non-empty bucket."
  type        = bool
  default     = false
}

variable "tags" {
  description = "Tags applied to every resource."
  type        = map(string)
  default     = {}
}
