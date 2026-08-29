import {
  Activity,
  Blocks,
  BookOpenCheck,
  FileWarning,
  FlaskConical,
  FolderKanban,
  GitBranch,
  Grid2X2,
  Inbox,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";

export type Surface =
  | "overview"
  | "projects"
  | "sources"
  | "evidence"
  | "conflicts"
  | "workflow"
  | "operations"
  | "evaluations"
  | "activity"
  | "members"
  | "settings";

export type CountKey = "projects" | "sources" | "evidence" | "conflicts";

export type NavItem = {
  id: Surface;
  label: string;
  icon: LucideIcon;
  count?: CountKey;
};

export const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Workspace",
    items: [
      { id: "overview", label: "Overview", icon: Grid2X2 },
      { id: "projects", label: "Projects", icon: FolderKanban, count: "projects" },
      { id: "sources", label: "Sources", icon: Blocks, count: "sources" },
      { id: "evidence", label: "Evidence", icon: BookOpenCheck, count: "evidence" },
      { id: "conflicts", label: "Conflicts", icon: FileWarning, count: "conflicts" },
      { id: "workflow", label: "Workflow studio", icon: GitBranch },
      { id: "operations", label: "Review inbox", icon: Inbox },
    ],
  },
  {
    label: "Platform",
    items: [
      { id: "evaluations", label: "Evaluations", icon: FlaskConical },
      { id: "activity", label: "Activity", icon: Activity },
      { id: "members", label: "Members", icon: Users },
      { id: "settings", label: "Settings", icon: Settings },
    ],
  },
];

export const surfaceCopy: Record<Surface, { eyebrow: string; title: string; description: string }> = {
  overview: {
    eyebrow: "WORKSPACE OVERVIEW",
    title: "Turn operational knowledge into action.",
    description: "Connect real source material, compile a governed workflow, then publish it to your AWS runtime.",
  },
  projects: {
    eyebrow: "PROJECTS",
    title: "Every operational system has its own boundary.",
    description: "Projects isolate sources, compilations, workflow versions, executions, and audit history.",
  },
  sources: {
    eyebrow: "SOURCE LIBRARY",
    title: "One governed library for every modality.",
    description: "Upload and monitor documents, images, audio, video, tabular records, JSON, and API specifications.",
  },
  evidence: {
    eyebrow: "EVIDENCE EXPLORER",
    title: "Trace every operational fact to its source.",
    description: "Inspect grounded facts, extraction confidence, and immutable provenance produced by the live multimodal pipeline.",
  },
  conflicts: {
    eyebrow: "CONFLICT ROOM",
    title: "Resolve contradictions before they become automation.",
    description: "Compare incompatible instructions and make explicit, auditable policy decisions.",
  },
  workflow: {
    eyebrow: "WORKFLOW STUDIO",
    title: "Inspect the compiled process as a governed graph.",
    description: "Review typed nodes, approval gates, tool boundaries, validation results, and clarification questions.",
  },
  operations: {
    eyebrow: "OPERATIONS INBOX",
    title: "Human review for live workflow executions.",
    description: "Consequential decisions and low-confidence cases appear here when a workflow version is published.",
  },
  evaluations: {
    eyebrow: "EVALUATION LAB",
    title: "Gate every version on quality and safety.",
    description: "Track citation accuracy, escalation recall, unsafe actions, execution success, latency, and cost.",
  },
  activity: {
    eyebrow: "AUDIT ACTIVITY",
    title: "A trace for every material change.",
    description: "Review append-only workspace actions, actors, resources, and timestamps.",
  },
  members: {
    eyebrow: "WORKSPACE MEMBERS",
    title: "Identity and roles stay inside the tenant boundary.",
    description: "Inspect the authenticated workspace owner and the production identity boundary.",
  },
  settings: {
    eyebrow: "PLATFORM SETTINGS",
    title: "Operational controls without hidden defaults.",
    description: "Inspect resource isolation, model routing, rate limits, upload policy, and environment state.",
  },
};

export const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};
