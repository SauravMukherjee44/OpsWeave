export const LOCAL_TENANT_ID = "00000000-0000-0000-0000-000000000001";

export type Health = { status: string; environment: string; aws_configured: boolean };
export type Project = {
  id: string;
  name: string;
  description: string;
  status: "draft" | "ready" | "compiling" | "failed";
  artifact_count: number;
  created_at: string;
  updated_at: string;
};
export type Artifact = {
  id: string;
  project_id: string;
  filename: string;
  media_type: string;
  size_bytes: number;
  checksum_sha256: string;
  status: "stored" | "processing" | "processed" | "failed";
  created_at: string;
};
export type Compilation = {
  id: string;
  project_id: string;
  status: "pending" | "queued" | "ingesting" | "compiling" | "succeeded" | "failed";
  model_id: string;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};
export type Evidence = {
  evidence_id: string;
  statement: string;
  kind: "rule" | "actor" | "action" | "entity" | "constraint";
  confidence: number;
  source_evidence_ids: string[];
  created_at: string;
  stage?: "extracted" | "compiled";
  artifact_id?: string;
  filename?: string;
  page?: number | null;
  timestamp?: string | null;
};
export type Conflict = {
  conflict_id: string;
  title: string;
  description: string;
  severity: "low" | "medium" | "high";
  source_evidence_ids: string[];
  recommended_resolution: string;
  resolution?: string;
  status: "open" | "resolved";
};
export type WorkflowNode = {
  id: string;
  type: string;
  name: string;
  config: Record<string, unknown>;
};
export type WorkflowEdge = { source: string; target: string; condition?: string | null; on?: string };
export type WorkflowRecord = {
  workflow_id: string;
  version: number;
  status: "draft" | "published";
  summary: string;
  definition: { name: string; nodes: WorkflowNode[]; edges: WorkflowEdge[] };
  clarification_questions: string[];
  validation: { valid: boolean; errors: string[] };
  model_id: string;
  prompt_version: string;
  compilation_method?: string;
};
export type CloudCompilation = Compilation & {
  compilation_id: string;
  progress?: number;
  summary?: string;
  evidence_count?: number;
  conflict_count?: number;
};
export type ProjectWorkspace = {
  cloud_connected: boolean;
  artifacts: Array<Artifact & { artifact_id: string; evidence_count?: number; error_message?: string }>;
  evidence: Evidence[];
  conflicts: Conflict[];
  compilations: CloudCompilation[];
  workflow: WorkflowRecord | null;
};
export type AuditEvent = {
  id: string;
  actor_id: string;
  action: string;
  resource_type: string;
  resource_id: string;
  created_at: string;
};
export type WorkspaceInfo = {
  tenant_id: string;
  tenant_name: string;
  actor_id: string;
  role: string;
  region: string;
  environment: string;
  isolation: string;
  rate_limiting: boolean;
  model_alias: string | null;
  model_calls_configured: boolean;
  max_upload_bytes: number;
  preferences: { timezone?: string; notifications?: string; retention?: string; review_threshold?: string };
};
export type Execution = {
  execution_id: string;
  workflow_id: string;
  workflow_version: number;
  status: string;
  current_node: string;
  claim: { claim_id: string; order_id: string; shipment_id: string; claimed_amount_usd: number; damage_description?: string };
  refund?: { refund_id: string; status: string; amount_usd: number };
  created_at: string;
  updated_at: string;
  runtime_context?: Record<string, unknown>;
};
export type ExecutionDetail = Execution & { trace: Array<{ id: number; type: string; timestamp: string; state_name?: string | null; resource?: string | null; error?: string | null; cause?: string | null }> };
export type Approval = {
  approval_id: string;
  execution_id: string;
  status: "pending" | "decided";
  decision?: "approve" | "reject";
  reason?: string;
  claim: Execution["claim"];
  recommendation: { decision: string; reason: string; confidence: number; missing_fields: string[] };
  created_at: string;
};
export type Evaluation = {
  evaluation_id: string;
  workflow_id: string;
  workflow_version: number;
  status: "passed" | "failed";
  method: string;
  metrics: { case_count: number; workflow_execution_success: number; citation_accuracy: number; escalation_recall: number; unsafe_action_rate: number; unnecessary_escalation_rate: number; straight_through_rate: number };
  gates: Record<string, boolean>;
  case_groups: Record<string, number>;
  created_at: string;
};

const configuredBaseUrl = process.env.NEXT_PUBLIC_API_URL;
function apiBaseUrl() {
  if (configuredBaseUrl) return configuredBaseUrl;
  if (typeof window !== "undefined" && ["localhost", "127.0.0.1"].includes(window.location.hostname)) {
    return "http://localhost:8000";
  }
  return "";
}
const headers = { "X-Tenant-Id": LOCAL_TENANT_ID, "X-Actor-Id": "local-owner" };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl()}${path}`, { ...init, credentials: "include", headers: { ...headers, ...init?.headers } });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = body?.detail;
    const message = typeof detail === "string" ? detail : detail?.message ?? `Request failed (${response.status})`;
    const error = new Error(message) as Error & { blockers?: string[]; status?: number };
    error.blockers = detail?.blockers;
    error.status = response.status;
    throw error;
  }
  return body as T;
}

export const api = {
  health: () => request<Health>("/health"),
  workspaceInfo: () => request<WorkspaceInfo>("/v1/workspace"),
  updatePreferences: (payload: { timezone: string; notifications: string; retention: string; review_threshold: string }) => request("/v1/workspace/preferences", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }),
  auditEvents: () => request<AuditEvent[]>("/v1/audit-events?limit=100"),
  projects: () => request<Project[]>("/v1/projects"),
  createProject: (payload: { name: string; description: string }) => request<Project>("/v1/projects", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  }),
  artifacts: (projectId: string) => request<Artifact[]>(`/v1/projects/${projectId}/artifacts`),
  artifactPreviewUrl: (artifactId: string) => `${apiBaseUrl()}/v1/artifacts/${artifactId}/preview`,
  uploadArtifact: (projectId: string, file: File) => {
    const form = new FormData();
    form.append("upload", file);
    return request<Artifact>(`/v1/projects/${projectId}/artifacts`, { method: "POST", body: form });
  },
  compile: (projectId: string) => request<Compilation>(`/v1/projects/${projectId}/compilations`, { method: "POST" }),
  compilation: (compilationId: string) => request<Compilation>(`/v1/compilations/${compilationId}`),
  workspace: (projectId: string) => request<ProjectWorkspace>(`/v1/projects/${projectId}/workspace`),
  executions: (projectId: string) => request<Execution[]>(`/v1/projects/${projectId}/executions`),
  execution: (projectId: string, executionId: string) => request<ExecutionDetail>(`/v1/executions/${executionId}?project_id=${encodeURIComponent(projectId)}`),
  approvals: (projectId: string) => request<Approval[]>(`/v1/projects/${projectId}/approvals`),
  evaluations: (projectId: string) => request<Evaluation[]>(`/v1/projects/${projectId}/evaluations`),
  runEvaluation: ({ projectId, workflowId }: { projectId: string; workflowId: string }) => request<Evaluation>(`/v1/workflows/${workflowId}/evaluations`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ project_id: projectId }),
  }),
  publishWorkflow: ({ projectId, workflowId }: { projectId: string; workflowId: string }) => request<WorkflowRecord>(`/v1/workflows/${workflowId}/publish`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ project_id: projectId }),
  }),
  createExecution: ({ projectId, workflowId }: { projectId: string; workflowId: string }) => request<Execution>("/v1/executions", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
      project_id: projectId, workflow_id: workflowId,
      claim: { claim_id: `CLM-DEMO-${Date.now().toString().slice(-6)}`, order_id: "ORD-82048", shipment_id: "SHP-72048", claimed_amount_usd: 219, evidence_complete: true, fraud_signal: false, damage_description: "Crushed corner and water damage verified in the uploaded evidence." },
    }),
  }),
  decideApproval: ({ projectId, approvalId, decision }: { projectId: string; approvalId: string; decision: "approve" | "reject" }) => request(`/v1/approvals/${approvalId}/decision`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ project_id: projectId, decision, reason: decision === "approve" ? "Evidence verified; stricter USD 200 control applied." : "Reviewer rejected the claim evidence." }),
  }),
  resolveConflict: ({ projectId, conflictId, resolution }: { projectId: string; conflictId: string; resolution: string }) =>
    request<Conflict>(`/v1/projects/${projectId}/conflicts/${conflictId}/resolve`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ resolution }),
    }),
};
