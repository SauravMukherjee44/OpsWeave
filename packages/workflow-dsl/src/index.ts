export const workflowNodeTypes = [
  "trigger", "extract", "retrieve", "rule", "agent", "transform", "tool",
  "approval", "wait_for_event", "notification", "terminal",
] as const;

export type WorkflowNodeType = (typeof workflowNodeTypes)[number];

export interface RetryPolicy {
  max_attempts: number;
  backoff_seconds: number;
}

export interface WorkflowNode {
  id: string;
  type: WorkflowNodeType;
  name: string;
  config: Record<string, unknown>;
  timeout_seconds: number;
  retry: RetryPolicy;
}

export interface WorkflowEdge {
  source: string;
  target: string;
  condition?: string;
  on: "success" | "failure" | "timeout";
}

export interface WorkflowDefinition {
  schema_version: "1.0";
  id: string;
  version: number;
  name: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  deployment_gates: {
    minimum_citation_accuracy: number;
    minimum_escalation_recall: number;
    maximum_unauthorized_actions: number;
  };
}
