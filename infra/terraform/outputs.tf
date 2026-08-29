output "artifact_bucket" {
  value = aws_s3_bucket.artifacts.id
}

output "compilation_queue_url" {
  value = aws_sqs_queue.compilation.url
}

output "event_bus_name" {
  value = aws_cloudwatch_event_bus.app.name
}

output "user_pool_id" {
  value = aws_cognito_user_pool.app.id
}

output "user_pool_client_id" {
  value = aws_cognito_user_pool_client.web.id
}

output "database_cluster_arn" {
  value = var.enable_relational_database ? (var.environment == "prod" ? aws_rds_cluster.app[0].arn : aws_db_instance.development[0].arn) : null
}

output "database_secret_arn" {
  value     = var.enable_relational_database ? (var.environment == "prod" ? aws_rds_cluster.app[0].master_user_secret[0].secret_arn : aws_db_instance.development[0].master_user_secret[0].secret_arn) : null
  sensitive = true
}

output "database_endpoint" {
  value = var.enable_relational_database ? (var.environment == "prod" ? aws_rds_cluster.app[0].endpoint : aws_db_instance.development[0].address) : null
}

output "application_table_name" {
  value = aws_dynamodb_table.application.name
}

output "quota_table_name" {
  value = aws_dynamodb_table.quotas.name
}

output "model_calls_kill_switch" {
  value = aws_ssm_parameter.model_calls_enabled.name
}

output "api_repository_url" {
  value = aws_ecr_repository.api.repository_url
}

output "claims_state_machine_arn" {
  value = aws_sfn_state_machine.claims.arn
}

output "hosted_api_url" {
  value = aws_apigatewayv2_api.api.api_endpoint
}

output "portal_url" {
  value = aws_apigatewayv2_api.api.api_endpoint
}
