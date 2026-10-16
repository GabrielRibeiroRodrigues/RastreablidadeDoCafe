output "bucket_name" {
  description = "Bucket name (API: S3_BUCKET)."
  value       = aws_s3_bucket.files.id
}

output "bucket_arn" {
  description = "Bucket ARN (IAM)."
  value       = aws_s3_bucket.files.arn
}
