data "archive_file" "worker" {
  type        = "zip"
  source_file = "${path.module}/../../apps/workers/handler.py"
  output_path = "${path.module}/.terraform/opsweave-worker.zip"
}

data "aws_iam_policy_document" "worker_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "worker" {
  name               = "${local.name}-worker"
  assume_role_policy = data.aws_iam_policy_document.worker_assume.json
}

data "aws_iam_policy_document" "worker" {
  statement {
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.worker.arn}:*"]
  }
  statement {
    actions   = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:Query", "dynamodb:BatchWriteItem"]
    resources = [aws_dynamodb_table.application.arn, "${aws_dynamodb_table.application.arn}/index/*"]
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
    actions   = ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes"]
    resources = [aws_sqs_queue.compilation.arn]
  }
  statement {
    actions   = ["bedrock:InvokeDataAutomationAsync", "bedrock:GetDataAutomationStatus", "bedrock:TagResource"]
    resources = ["*"]
  }
  statement {
    actions   = ["bedrock:InvokeModel"]
    resources = ["*"]
  }
  statement {
    actions   = ["ssm:GetParameter"]
    resources = [aws_ssm_parameter.model_calls_enabled.arn]
  }
  statement {
    actions   = ["events:EnableRule", "events:DisableRule"]
    resources = [aws_cloudwatch_event_rule.status.arn]
  }
}

resource "aws_iam_role_policy" "worker" {
  role   = aws_iam_role.worker.id
  policy = data.aws_iam_policy_document.worker.json
}

resource "aws_cloudwatch_log_group" "worker" {
  name              = "/opsweave/${var.environment}/worker"
  retention_in_days = 7
}

resource "aws_lambda_function" "worker" {
  function_name    = "${local.name}-worker"
  role             = aws_iam_role.worker.arn
  runtime          = "python3.12"
  handler          = "handler.compilation_handler"
  filename         = data.archive_file.worker.output_path
  source_code_hash = data.archive_file.worker.output_base64sha256
  timeout          = 180
  memory_size      = 256
  environment {
    variables = {
      APPLICATION_TABLE             = aws_dynamodb_table.application.name
      ARTIFACT_BUCKET               = aws_s3_bucket.artifacts.id
      BDA_PROJECT_ARN               = var.bda_project_arn
      BDA_PROFILE_ARN               = "arn:aws:bedrock:${var.aws_region}:${data.aws_caller_identity.current.account_id}:data-automation-profile/us.data-automation-v1"
      MODEL_CALLS_ENABLED_PARAMETER = aws_ssm_parameter.model_calls_enabled.name
      BEDROCK_REASONING_MODEL_ID    = var.bedrock_reasoning_model_id
      STATUS_RULE_NAME              = aws_cloudwatch_event_rule.status.name
    }
  }
  depends_on = [aws_iam_role_policy.worker, aws_cloudwatch_log_group.worker]
}

resource "aws_lambda_event_source_mapping" "compilation" {
  event_source_arn                   = aws_sqs_queue.compilation.arn
  function_name                      = aws_lambda_function.worker.arn
  batch_size                         = 2
  function_response_types            = ["ReportBatchItemFailures"]
  maximum_batching_window_in_seconds = 5
  scaling_config { maximum_concurrency = 2 }
}

resource "aws_lambda_function" "status" {
  function_name    = "${local.name}-bda-status"
  role             = aws_iam_role.worker.arn
  runtime          = "python3.12"
  handler          = "handler.status_handler"
  filename         = data.archive_file.worker.output_path
  source_code_hash = data.archive_file.worker.output_base64sha256
  timeout          = 180
  memory_size      = 256
  environment {
    variables = {
      APPLICATION_TABLE             = aws_dynamodb_table.application.name
      ARTIFACT_BUCKET               = aws_s3_bucket.artifacts.id
      BDA_PROJECT_ARN               = var.bda_project_arn
      BDA_PROFILE_ARN               = "arn:aws:bedrock:${var.aws_region}:${data.aws_caller_identity.current.account_id}:data-automation-profile/us.data-automation-v1"
      MODEL_CALLS_ENABLED_PARAMETER = aws_ssm_parameter.model_calls_enabled.name
      BEDROCK_REASONING_MODEL_ID    = var.bedrock_reasoning_model_id
      STATUS_RULE_NAME              = aws_cloudwatch_event_rule.status.name
    }
  }
  depends_on = [aws_iam_role_policy.worker, aws_cloudwatch_log_group.worker]
}

resource "aws_lambda_function" "runtime" {
  function_name    = "${local.name}-runtime"
  role             = aws_iam_role.worker.arn
  runtime          = "python3.12"
  handler          = "handler.runtime_handler"
  filename         = data.archive_file.worker.output_path
  source_code_hash = data.archive_file.worker.output_base64sha256
  timeout          = 30
  memory_size      = 256
  environment {
    variables = {
      APPLICATION_TABLE             = aws_dynamodb_table.application.name
      ARTIFACT_BUCKET               = aws_s3_bucket.artifacts.id
      BDA_PROJECT_ARN               = var.bda_project_arn
      BDA_PROFILE_ARN               = "arn:aws:bedrock:${var.aws_region}:${data.aws_caller_identity.current.account_id}:data-automation-profile/us.data-automation-v1"
      MODEL_CALLS_ENABLED_PARAMETER = aws_ssm_parameter.model_calls_enabled.name
      BEDROCK_REASONING_MODEL_ID    = var.bedrock_reasoning_model_id
    }
  }
  depends_on = [aws_iam_role_policy.worker, aws_cloudwatch_log_group.worker]
}

data "aws_iam_policy_document" "states_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["states.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "states" {
  name               = "${local.name}-states"
  assume_role_policy = data.aws_iam_policy_document.states_assume.json
}

resource "aws_iam_role_policy" "states" {
  role = aws_iam_role.states.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["lambda:InvokeFunction"]
      Resource = [aws_lambda_function.runtime.arn, "${aws_lambda_function.runtime.arn}:*"]
    }]
  })
}

resource "aws_sfn_state_machine" "claims" {
  name     = "${local.name}-damaged-claims"
  role_arn = aws_iam_role.states.arn
  type     = "STANDARD"
  definition = jsonencode({
    Comment = "OpsWeave governed damaged-shipment claims runtime"
    StartAt = "EvaluateClaim"
    States = {
      EvaluateClaim = {
        Type       = "Task"
        Resource   = "arn:aws:states:::lambda:invoke"
        Parameters = { FunctionName = aws_lambda_function.runtime.arn, Payload = { action = "evaluate", "context.$" = "$" } }
        OutputPath = "$.Payload"
        Next       = "ManagerApproval"
      }
      ManagerApproval = {
        Type           = "Task"
        Resource       = "arn:aws:states:::lambda:invoke.waitForTaskToken"
        Parameters     = { FunctionName = aws_lambda_function.runtime.arn, Payload = { action = "request_approval", "task_token.$" = "$$.Task.Token", "context.$" = "$" } }
        TimeoutSeconds = 86400
        Next           = "IssueRefund"
      }
      IssueRefund = {
        Type       = "Task"
        Resource   = "arn:aws:states:::lambda:invoke"
        Parameters = { FunctionName = aws_lambda_function.runtime.arn, Payload = { action = "issue_refund", "context.$" = "$" } }
        OutputPath = "$.Payload"
        Next       = "NotifyClaimant"
      }
      NotifyClaimant = {
        Type       = "Task"
        Resource   = "arn:aws:states:::lambda:invoke"
        Parameters = { FunctionName = aws_lambda_function.runtime.arn, Payload = { action = "notify", "context.$" = "$" } }
        OutputPath = "$.Payload"
        Next       = "CompleteExecution"
      }
      CompleteExecution = {
        Type       = "Task"
        Resource   = "arn:aws:states:::lambda:invoke"
        Parameters = { FunctionName = aws_lambda_function.runtime.arn, Payload = { action = "complete", "context.$" = "$" } }
        OutputPath = "$.Payload"
        End        = true
      }
    }
  })
  depends_on = [aws_iam_role_policy.states]
  tags       = { Application = "OpsWeave", Environment = var.environment }
}

resource "aws_cloudwatch_event_rule" "status" {
  name                = "${local.name}-bda-status"
  schedule_expression = "rate(5 minutes)"
  state               = "DISABLED"
}

resource "aws_cloudwatch_event_target" "status" {
  rule = aws_cloudwatch_event_rule.status.name
  arn  = aws_lambda_function.status.arn
}

resource "aws_lambda_permission" "status_schedule" {
  statement_id  = "AllowEventBridgeStatusPoll"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.status.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.status.arn
}
