variable "aws_region" {
  type    = string
  default = "us-east-1"
}

variable "aws_profile" {
  type        = string
  description = "Local AWS CLI profile used for interactive Terraform operations"
  default     = "opsweave"
}

variable "aws_account_id" {
  type        = string
  description = "Only this AWS account may receive OpsWeave infrastructure"
  validation {
    condition     = can(regex("^[0-9]{12}$", var.aws_account_id))
    error_message = "aws_account_id must be a 12-digit AWS account ID"
  }
}

variable "environment" {
  type    = string
  default = "dev"
  validation {
    condition     = contains(["dev", "prod"], var.environment)
    error_message = "environment must be dev or prod"
  }
}

variable "monthly_budget_usd" {
  type    = number
  default = 20
}

variable "budget_notification_email" {
  type        = string
  description = "Email address that receives AWS budget alerts"
}

variable "allowed_web_origins" {
  type        = list(string)
  description = "Origins allowed to upload directly to the artifact bucket"
  default     = ["http://localhost:3000"]
}

variable "portal_domain_name" {
  type        = string
  description = "Public HTTPS hostname for the OpsWeave portal; DNS stays managed by Netlify."
  default     = "opsweave.sauravmukherjee.in"
}

variable "enable_relational_database" {
  type        = bool
  description = "Provision PostgreSQL/Aurora. Disabled for the six-month free-plan demo runtime."
  default     = false
}

variable "bedrock_reasoning_model_id" {
  type        = string
  description = "Bedrock inference profile used by the evidence-bound workflow compiler"
  default     = "us.openai.gpt-5.6-luna"
}

variable "bda_project_arn" {
  type        = string
  description = "Bedrock Data Automation project ARN used for multimodal extraction"
}

variable "api_image_tag" {
  type        = string
  description = "Immutable ECR image tag deployed to the hosted OpsWeave API"
  default     = "hosted-v17"
}
