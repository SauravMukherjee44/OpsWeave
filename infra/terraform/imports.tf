// The development budget was created before the first Terraform apply so cost
// protection exists from day one. Terraform adopts it into the initial state.
import {
  to = aws_budgets_budget.monthly
  id = "${var.aws_account_id}:${local.name}-monthly"
}
