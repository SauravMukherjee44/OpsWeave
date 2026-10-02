data "aws_caller_identity" "current" {}
data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  name        = "opsweave-${var.environment}"
  portal_url  = "https://${var.portal_domain_name}"
  web_origins = distinct(concat(var.allowed_web_origins, [local.portal_url]))
}

data "aws_iam_policy_document" "kms" {
  statement {
    sid       = "AccountAdministration"
    effect    = "Allow"
    actions   = ["kms:*"]
    resources = ["*"]
    principals {
      type        = "AWS"
      identifiers = ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"]
    }
  }

  statement {
    sid    = "CloudWatchLogsEncryption"
    effect = "Allow"
    actions = [
      "kms:Encrypt",
      "kms:Decrypt",
      "kms:ReEncrypt*",
      "kms:GenerateDataKey*",
      "kms:DescribeKey",
    ]
    resources = ["*"]
    principals {
      type        = "Service"
      identifiers = ["logs.${var.aws_region}.amazonaws.com"]
    }
    condition {
      test     = "ArnLike"
      variable = "kms:EncryptionContext:aws:logs:arn"
      values   = ["arn:aws:logs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:log-group:/opsweave/${var.environment}/*"]
    }
  }
}

resource "aws_kms_key" "app" {
  description             = "OpsWeave ${var.environment} data encryption"
  deletion_window_in_days = 14
  enable_key_rotation     = true
  policy                  = data.aws_iam_policy_document.kms.json
}

resource "aws_kms_alias" "app" {
  name          = "alias/${local.name}"
  target_key_id = aws_kms_key.app.key_id
}

resource "aws_s3_bucket" "artifacts" {
  bucket        = "${local.name}-${data.aws_caller_identity.current.account_id}-${var.aws_region}"
  force_destroy = var.environment == "dev"
}

resource "aws_s3_bucket_versioning" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "artifacts" {
  bucket                  = aws_s3_bucket.artifacts.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_cors_configuration" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id
  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["POST"]
    allowed_origins = concat(local.web_origins, [aws_apigatewayv2_api.api.api_endpoint])
    expose_headers  = ["ETag"]
    max_age_seconds = 900
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id
  rule {
    id     = "abort-incomplete-uploads"
    status = "Enabled"
    filter {}
    abort_incomplete_multipart_upload { days_after_initiation = 1 }
    noncurrent_version_expiration { noncurrent_days = 30 }
  }
}

resource "aws_sqs_queue" "compilation_dlq" {
  name                      = "${local.name}-compilation-dlq"
  message_retention_seconds = 1209600
  sqs_managed_sse_enabled   = true
}

resource "aws_sqs_queue" "compilation" {
  name                       = "${local.name}-compilation"
  visibility_timeout_seconds = 900
  message_retention_seconds  = 345600
  sqs_managed_sse_enabled    = true
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.compilation_dlq.arn
    maxReceiveCount     = 3
  })
}

resource "aws_cloudwatch_event_bus" "app" {
  name = local.name
}

resource "aws_cognito_user_pool" "app" {
  name                     = local.name
  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]
  deletion_protection      = var.environment == "prod" ? "ACTIVE" : "INACTIVE"
  password_policy {
    minimum_length                   = 12
    require_lowercase                = true
    require_numbers                  = true
    require_symbols                  = true
    require_uppercase                = true
    temporary_password_validity_days = 3
  }
  user_attribute_update_settings {
    attributes_require_verification_before_update = ["email"]
  }
}

resource "aws_cognito_user_pool_client" "web" {
  name                                 = "${local.name}-web"
  user_pool_id                         = aws_cognito_user_pool.app.id
  generate_secret                      = false
  prevent_user_existence_errors        = "ENABLED"
  supported_identity_providers         = ["COGNITO"]
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["aws.cognito.signin.user.admin", "email", "openid", "profile"]
  callback_urls = [
    "${local.portal_url}/auth/callback",
    "${aws_apigatewayv2_api.api.api_endpoint}/auth/callback",
    "http://localhost:8000/auth/callback",
  ]
  logout_urls = [
    local.portal_url,
    aws_apigatewayv2_api.api.api_endpoint,
    "http://localhost:3000",
  ]
}

resource "aws_cognito_user_pool_domain" "app" {
  domain       = "${local.name}-${data.aws_caller_identity.current.account_id}"
  user_pool_id = aws_cognito_user_pool.app.id
}

# Netlify remains authoritative for sauravmukherjee.in. Terraform creates the
# ACM certificate and exposes its DNS validation record; the CNAME itself is
# intentionally managed in Netlify rather than creating a second DNS zone.
resource "aws_acm_certificate" "portal" {
  domain_name       = var.portal_domain_name
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_vpc" "app" {
  count                = var.enable_relational_database ? 1 : 0
  cidr_block           = "10.42.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true
  tags                 = { Name = local.name }
}

resource "aws_subnet" "database" {
  count             = var.enable_relational_database ? 2 : 0
  vpc_id            = aws_vpc.app[0].id
  cidr_block        = cidrsubnet(aws_vpc.app[0].cidr_block, 8, count.index + 10)
  availability_zone = data.aws_availability_zones.available.names[count.index]
  tags              = { Name = "${local.name}-db-${count.index + 1}" }
}

resource "aws_db_subnet_group" "app" {
  count      = var.enable_relational_database ? 1 : 0
  name       = local.name
  subnet_ids = aws_subnet.database[*].id
}

resource "aws_security_group" "database" {
  count       = var.enable_relational_database ? 1 : 0
  name        = "${local.name}-database"
  description = "Isolated Aurora security group"
  vpc_id      = aws_vpc.app[0].id
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_rds_cluster" "app" {
  count                           = var.enable_relational_database && var.environment == "prod" ? 1 : 0
  cluster_identifier              = local.name
  engine                          = "aurora-postgresql"
  engine_mode                     = "provisioned"
  database_name                   = "opsweave"
  master_username                 = "opsweave_admin"
  manage_master_user_password     = true
  db_subnet_group_name            = aws_db_subnet_group.app[0].name
  vpc_security_group_ids          = [aws_security_group.database[0].id]
  storage_encrypted               = true
  kms_key_id                      = aws_kms_key.app.arn
  backup_retention_period         = var.environment == "prod" ? 14 : 1
  deletion_protection             = var.environment == "prod"
  skip_final_snapshot             = var.environment != "prod"
  enabled_cloudwatch_logs_exports = ["postgresql"]
  enable_http_endpoint            = true
  serverlessv2_scaling_configuration {
    min_capacity             = 0
    max_capacity             = var.environment == "prod" ? 8 : 2
    seconds_until_auto_pause = 900
  }
}

resource "aws_rds_cluster_instance" "app" {
  count              = var.enable_relational_database && var.environment == "prod" ? 1 : 0
  identifier         = "${local.name}-writer"
  cluster_identifier = aws_rds_cluster.app[0].id
  instance_class     = "db.serverless"
  engine             = aws_rds_cluster.app[0].engine
  engine_version     = aws_rds_cluster.app[0].engine_version
}

resource "aws_db_instance" "development" {
  count                           = var.enable_relational_database && var.environment == "dev" ? 1 : 0
  identifier                      = local.name
  engine                          = "postgres"
  instance_class                  = "db.t4g.micro"
  allocated_storage               = 20
  storage_type                    = "gp3"
  db_name                         = "opsweave"
  username                        = "opsweave_admin"
  manage_master_user_password     = true
  db_subnet_group_name            = aws_db_subnet_group.app[0].name
  vpc_security_group_ids          = [aws_security_group.database[0].id]
  storage_encrypted               = true
  kms_key_id                      = aws_kms_key.app.arn
  backup_retention_period         = 1
  multi_az                        = false
  publicly_accessible             = false
  deletion_protection             = false
  skip_final_snapshot             = true
  enabled_cloudwatch_logs_exports = ["postgresql"]
}

resource "aws_dynamodb_table" "application" {
  name         = "${local.name}-application"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"
  range_key    = "sk"

  attribute {
    name = "pk"
    type = "S"
  }
  attribute {
    name = "sk"
    type = "S"
  }
  attribute {
    name = "gsi1pk"
    type = "S"
  }
  attribute {
    name = "gsi1sk"
    type = "S"
  }

  global_secondary_index {
    name            = "gsi1"
    hash_key        = "gsi1pk"
    range_key       = "gsi1sk"
    projection_type = "ALL"
  }

  point_in_time_recovery {
    enabled = true
  }
  server_side_encryption {
    enabled = false
  }
  ttl {
    attribute_name = "expires_at"
    enabled        = true
  }
}

resource "aws_dynamodb_table" "quotas" {
  name         = "${local.name}-quotas"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"
  attribute {
    name = "pk"
    type = "S"
  }
  server_side_encryption {
    enabled = false
  }
  ttl {
    attribute_name = "expires_at"
    enabled        = true
  }
}

resource "aws_ssm_parameter" "model_calls_enabled" {
  name  = "/opsweave/${var.environment}/model-calls-enabled"
  type  = "String"
  value = "true"
}

resource "aws_ecr_repository" "api" {
  name                 = "${local.name}/api"
  image_tag_mutability = "IMMUTABLE"
  image_scanning_configuration {
    scan_on_push = true
  }
  encryption_configuration {
    encryption_type = "KMS"
    kms_key         = aws_kms_key.app.arn
  }
}

# Keep only the deployed image so the repository stays below ECR's 500 MB
# first-year Free Tier storage allowance. Git retains the reproducible source.
resource "aws_ecr_lifecycle_policy" "api" {
  repository = aws_ecr_repository.api.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Expire untagged OpsWeave API images after one day"
        selection = {
          tagStatus   = "untagged"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = 1
        }
        action = { type = "expire" }
      },
      {
        rulePriority = 2
        description  = "Retain only the deployed hosted API release"
        selection = {
          tagStatus     = "tagged"
          tagPrefixList = ["hosted-v"]
          countType     = "imageCountMoreThan"
          countNumber   = 1
        }
        action = { type = "expire" }
      },
    ]
  })
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/opsweave/${var.environment}/api"
  retention_in_days = var.environment == "prod" ? 90 : 14
}

resource "aws_budgets_budget" "monthly" {
  name         = "${local.name}-monthly"
  budget_type  = "COST"
  limit_amount = tostring(var.monthly_budget_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"
  cost_filter {
    name   = "TagKeyValue"
    values = ["user:Application$OpsWeave"]
  }
  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = [var.budget_notification_email]
  }
  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.budget_notification_email]
  }
}
