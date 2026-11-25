locals {
  traffic_alert_prefix = var.environment == "dev" ? "opsweave" : local.name
  traffic_alarms = {
    api-traffic-spike = {
      namespace  = "AWS/ApiGateway"
      metric     = "Count"
      dimensions = { ApiId = aws_apigatewayv2_api.api.id }
      threshold  = 100
    }
    compilation-invocation-spike = {
      namespace  = "AWS/Lambda"
      metric     = "Invocations"
      dimensions = { FunctionName = aws_lambda_function.worker.function_name }
      threshold  = 8
    }
    workflow-invocation-spike = {
      namespace  = "AWS/Lambda"
      metric     = "Invocations"
      dimensions = { FunctionName = aws_lambda_function.runtime.function_name }
      threshold  = 15
    }
  }
}

resource "aws_sns_topic" "traffic_alerts" {
  name = "${local.traffic_alert_prefix}-traffic-alerts"
}

data "aws_iam_policy_document" "traffic_alerts" {
  policy_id = "__default_policy_ID"

  # Retain the standard same-account SNS topic permissions.
  statement {
    sid = "__default_statement_ID"
    actions = [
      "SNS:AddPermission", "SNS:DeleteTopic", "SNS:GetTopicAttributes",
      "SNS:ListSubscriptionsByTopic", "SNS:Publish", "SNS:RemovePermission",
      "SNS:SetTopicAttributes", "SNS:Subscribe",
    ]
    resources = [aws_sns_topic.traffic_alerts.arn]
    principals {
      type        = "AWS"
      identifiers = ["*"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceOwner"
      values   = [var.aws_account_id]
    }
  }

  statement {
    sid       = "AllowProjectCloudWatchAlarmPublishing"
    actions   = ["sns:Publish"]
    resources = [aws_sns_topic.traffic_alerts.arn]
    principals {
      type        = "Service"
      identifiers = ["cloudwatch.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [var.aws_account_id]
    }
    condition {
      test     = "ArnEquals"
      variable = "aws:SourceArn"
      values   = [for alarm in aws_cloudwatch_metric_alarm.traffic : alarm.arn]
    }
  }
}

resource "aws_sns_topic_policy" "traffic_alerts" {
  arn    = aws_sns_topic.traffic_alerts.arn
  policy = data.aws_iam_policy_document.traffic_alerts.json
}

resource "aws_sns_topic_subscription" "traffic_alerts" {
  topic_arn = aws_sns_topic.traffic_alerts.arn
  protocol  = "email"
  endpoint  = var.budget_notification_email
}

resource "aws_cloudwatch_metric_alarm" "traffic" {
  for_each = local.traffic_alarms

  alarm_name          = "${local.traffic_alert_prefix}-${each.key}"
  alarm_description   = "${each.value.metric} reached ${each.value.threshold} in five minutes. Review traffic and use the project rate limits to contain costs."
  namespace           = each.value.namespace
  metric_name         = each.value.metric
  dimensions          = each.value.dimensions
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  datapoints_to_alarm = 1
  threshold           = each.value.threshold
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.traffic_alerts.arn]
}

# Only the designated OpsWeave stack owns the account-wide budget.
resource "aws_budgets_budget" "account_spend_before_credits" {
  count = coalesce(var.manage_account_spend_alert, var.environment == "dev") ? 1 : 0

  name         = "account-monthly-spend-before-credits"
  budget_type  = "COST"
  limit_amount = "5"
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  cost_types {
    include_credit = false
    include_refund = false
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 5
    threshold_type             = "ABSOLUTE_VALUE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.budget_notification_email]
  }
}
