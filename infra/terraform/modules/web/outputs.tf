output "bucket_name" {
  description = "Bucket that receives the web build."
  value       = aws_s3_bucket.web.id
}

output "distribution_id" {
  description = "CloudFront distribution ID (cache invalidation)."
  value       = aws_cloudfront_distribution.web.id
}

output "domain_name" {
  description = "CloudFront domain."
  value       = aws_cloudfront_distribution.web.domain_name
}

output "url" {
  description = "Public URL of the web app."
  value       = "https://${length(var.aliases) > 0 ? var.aliases[0] : aws_cloudfront_distribution.web.domain_name}"
}
