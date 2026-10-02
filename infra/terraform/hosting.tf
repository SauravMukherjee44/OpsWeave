resource "random_password" "session" {
  length  = 48
  special = false
}

resource "aws_cloudwatch_log_group" "hosted_api" {
  name              = "/aws/lambda/${local.name}-api"
  retention_in_days = 7
}

data "aws_iam_policy_document" "api_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "api" {
  name               = "${local.name}-api"
  assume_role_policy = data.aws_iam_policy_document.api_assume.json
}

data "aws_iam_policy_document" "api" {
  statement {
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.hosted_api.arn}:*"]
  }
  statement {
    actions   = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:Query", "dynamodb:BatchWriteItem"]
    resources = [aws_dynamodb_table.application.arn, "${aws_dynamodb_table.application.arn}/index/*", aws_dynamodb_table.quotas.arn]
  }
  statement {
    actions   = ["s3:GetObject", "s3:PutObject"]
    resources = ["${aws_s3_bucket.artifacts.arn}/*"]
  }
  statement {
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.artifacts.arn]
  }
  statement {
    actions   = ["sqs:SendMessage"]
    resources = [aws_sqs_queue.compilation.arn]
  }
  statement {
    actions = ["states:StartExecution", "states:DescribeExecution", "states:GetExecutionHistory", "states:SendTaskSuccess", "states:SendTaskFailure"]
    resources = [
      aws_sfn_state_machine.claims.arn,
      "arn:aws:states:${var.aws_region}:${data.aws_caller_identity.current.account_id}:execution:${aws_sfn_state_machine.claims.name}:*",
    ]
  }
  statement {
    actions   = ["ssm:GetParameter"]
    resources = [aws_ssm_parameter.model_calls_enabled.arn]
  }
}

resource "aws_iam_role_policy" "api" {
  role   = aws_iam_role.api.id
  policy = data.aws_iam_policy_document.api.json
}

resource "aws_lambda_function" "api" {
  function_name = "${local.name}-api"
  role          = aws_iam_role.api.arn
  package_type  = "Image"
  image_uri     = "${aws_ecr_repository.api.repository_url}:${var.api_image_tag}"
  architectures = ["x86_64"]
  timeout       = 30
  memory_size   = 512

  environment {
    variables = {
      OPSWEAVE_ENVIRONMENT                   = var.environment
      OPSWEAVE_DATABASE_URL                  = "sqlite+aiosqlite:////tmp/opsweave.db"
      OPSWEAVE_LOCAL_UPLOAD_DIR              = "/tmp/opsweave-uploads"
      OPSWEAVE_CORS_ORIGINS                  = join(",", local.web_origins)
      OPSWEAVE_ARTIFACT_BUCKET               = aws_s3_bucket.artifacts.id
      OPSWEAVE_COMPILATION_QUEUE_URL         = aws_sqs_queue.compilation.url
      OPSWEAVE_APPLICATION_TABLE             = aws_dynamodb_table.application.name
      OPSWEAVE_QUOTA_TABLE                   = aws_dynamodb_table.quotas.name
      OPSWEAVE_RATE_LIMIT_ENABLED            = "true"
      OPSWEAVE_SESSION_SECRET                = random_password.session.result
      OPSWEAVE_MODEL_CALLS_ENABLED_PARAMETER = aws_ssm_parameter.model_calls_enabled.name
      OPSWEAVE_BEDROCK_REASONING_MODEL_ID    = var.bedrock_reasoning_model_id
      OPSWEAVE_CLAIMS_STATE_MACHINE_ARN      = aws_sfn_state_machine.claims.arn
      OPSWEAVE_COGNITO_DOMAIN                = "${aws_cognito_user_pool_domain.app.domain}.auth.${var.aws_region}.amazoncognito.com"
      OPSWEAVE_COGNITO_CLIENT_ID             = aws_cognito_user_pool_client.web.id
      OPSWEAVE_PUBLIC_APP_URL                = local.portal_url
    }
  }

  depends_on = [aws_iam_role_policy.api, aws_cloudwatch_log_group.hosted_api]
}

resource "aws_apigatewayv2_api" "api" {
  name          = "${local.name}-api"
  protocol_type = "HTTP"
  cors_configuration {
    allow_origins  = local.web_origins
    allow_methods  = ["GET", "POST", "PATCH", "OPTIONS"]
    allow_headers  = ["authorization", "content-type", "x-actor-id", "x-tenant-id"]
    expose_headers = ["retry-after", "x-ratelimit-limit", "x-ratelimit-remaining"]
    max_age        = 3600
  }
}

resource "aws_apigatewayv2_integration" "api" {
  api_id                 = aws_apigatewayv2_api.api.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.api.invoke_arn
  payload_format_version = "2.0"
  timeout_milliseconds   = 30000
}

resource "aws_apigatewayv2_route" "default" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "$default"
  target    = "integrations/${aws_apigatewayv2_integration.api.id}"
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.api.id
  name        = "$default"
  auto_deploy = true
  default_route_settings {
    throttling_burst_limit = 20
    throttling_rate_limit  = 10
  }
}

resource "aws_apigatewayv2_domain_name" "portal" {
  domain_name = var.portal_domain_name

  domain_name_configuration {
    certificate_arn = aws_acm_certificate.portal.arn
    endpoint_type   = "REGIONAL"
    security_policy = "TLS_1_2"
  }
}

resource "aws_apigatewayv2_api_mapping" "portal" {
  api_id      = aws_apigatewayv2_api.api.id
  domain_name = aws_apigatewayv2_domain_name.portal.id
  stage       = aws_apigatewayv2_stage.default.id
}

resource "aws_lambda_permission" "api_gateway" {
  statement_id  = "AllowApiGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.api.execution_arn}/*/*"
}
