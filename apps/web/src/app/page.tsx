"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity, ArrowRight, Bell, Blocks, BookOpenCheck, Check, ChevronDown, CircleAlert,
  Cloud, CloudOff, Database, FileAudio, FileImage, FileSpreadsheet, FileText, FileVideo,
  FileWarning, FlaskConical, FolderKanban, GitBranch, Grid2X2, HelpCircle, Inbox, LoaderCircle,
  KeyRound, Menu, Moon, MoreHorizontal, Play, Plus, Search, Settings, ShieldCheck,
  Sparkles, Sun, UploadCloud, Users, WandSparkles, Waypoints, X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, type Approval, type Artifact, type AuditEvent, type CloudCompilation, type Evaluation, type Execution, type Project, type ProjectWorkspace, type WorkspaceInfo } from "@/lib/api";
import { WorkflowCanvas } from "@/components/workflow-canvas";

type Theme = "dark" | "light";
type Surface = "overview" | "projects" | "sources" | "evidence" | "conflicts" | "workflow" | "operations" | "evaluations" | "activity" | "members" | "settings";

const surfaceCopy: Record<Surface, { eyebrow: string; title: string; description: string }> = {
  overview: { eyebrow: "WORKSPACE OVERVIEW", title: "Turn operational knowledge into action.", description: "Connect real source material, compile a governed workflow, then publish it to your AWS runtime." },
  projects: { eyebrow: "PROJECTS", title: "Every operational system has its own boundary.", description: "Projects isolate sources, compilations, workflow versions, executions, and audit history." },
  sources: { eyebrow: "SOURCE LIBRARY", title: "One governed library for every modality.", description: "Upload and monitor documents, images, audio, video, tabular records, JSON, and API specifications." },
  evidence: { eyebrow: "EVIDENCE EXPLORER", title: "Trace every operational fact to its source.", description: "Inspect grounded facts, extraction confidence, and immutable provenance produced by the live multimodal pipeline." },
  conflicts: { eyebrow: "CONFLICT ROOM", title: "Resolve contradictions before they become automation.", description: "Compare incompatible instructions and make explicit, auditable policy decisions." },
  workflow: { eyebrow: "WORKFLOW STUDIO", title: "Inspect the compiled process as a governed graph.", description: "Review typed nodes, approval gates, tool boundaries, validation results, and clarification questions." },
  operations: { eyebrow: "OPERATIONS INBOX", title: "Human review for live workflow executions.", description: "Consequential decisions and low-confidence cases appear here when a workflow version is published." },
  evaluations: { eyebrow: "EVALUATION LAB", title: "Gate every version on quality and safety.", description: "Track citation accuracy, escalation recall, unsafe actions, execution success, latency, and cost." },
  activity: { eyebrow: "AUDIT ACTIVITY", title: "A trace for every material change.", description: "Review append-only workspace actions, actors, resources, and timestamps." },
  members: { eyebrow: "WORKSPACE MEMBERS", title: "Identity and roles stay inside the tenant boundary.", description: "Inspect the authenticated workspace owner and the production identity boundary." },
  settings: { eyebrow: "PLATFORM SETTINGS", title: "Operational controls without hidden defaults.", description: "Inspect resource isolation, model routing, rate limits, upload policy, and environment state." },
};

function SourceGlyph({ mediaType }: { mediaType: string }) {
  if (mediaType.startsWith("image/")) return <FileImage size={18} />;
  if (mediaType.startsWith("audio/")) return <FileAudio size={18} />;
  if (mediaType.startsWith("video/")) return <FileVideo size={18} />;
  if (mediaType.includes("sheet") || mediaType.includes("csv")) return <FileSpreadsheet size={18} />;
  return <FileText size={18} />;
}

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

function PortalPreloader() {
  const [phase, setPhase] = useState(0);
  const phases = [
    "Waking the secure workspace",
    "Connecting evidence and workflow services",
    "Restoring your live operational context",
  ];

  useEffect(() => {
    const timers = [
      window.setTimeout(() => setPhase(1), 1_200),
      window.setTimeout(() => setPhase(2), 3_200),
    ];
    return () => timers.forEach(window.clearTimeout);
  }, []);

  return (
    <main className="portal-preloader" role="status" aria-live="polite" aria-label="Loading OpsWeave">
      <div className="preloader-grid" aria-hidden="true" />
      <div className="preloader-aura" aria-hidden="true" />
      <section className="preloader-content">
        <div className="preloader-mark" aria-hidden="true">
          <span className="preloader-orbit orbit-blue"><FileText /></span>
          <span className="preloader-orbit orbit-red"><FileImage /></span>
          <span className="preloader-orbit orbit-yellow"><FileAudio /></span>
          <span className="preloader-orbit orbit-green"><ShieldCheck /></span>
          <div className="preloader-core"><span /><span /><span /><span /></div>
          <i className="preloader-ring ring-one" />
          <i className="preloader-ring ring-two" />
        </div>
        <div className="preloader-brand"><strong>OpsWeave</strong><span>Evidence to governed execution</span></div>
        <div className="preloader-progress" aria-hidden="true"><span /></div>
        <AnimatePresence mode="wait">
          <motion.p key={phase} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: .2 }}>
            {phases[phase]}<span className="loading-dots"><i /><i /><i /></span>
          </motion.p>
        </AnimatePresence>
        <small>Serverless resources may take a moment after inactivity.</small>
      </section>
    </main>
  );
}

export default function Home() {
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [theme, setTheme] = useState<Theme>("dark");
  const [surface, setSurface] = useState<Surface>("overview");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [compileError, setCompileError] = useState<string[]>([]);

  useEffect(() => {
    const stored = window.localStorage.getItem("opsweave-theme");
    if (stored === "light") {
      const frame = window.requestAnimationFrame(() => setTheme("light"));
      return () => window.cancelAnimationFrame(frame);
    }
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const toggleTheme = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    window.localStorage.setItem("opsweave-theme", next);
  };

  const health = useQuery({ queryKey: ["health"], queryFn: api.health, retry: 3, retryDelay: (attempt) => Math.min(750 * 2 ** attempt, 3_000), refetchInterval: 30_000 });
  const projects = useQuery({ queryKey: ["projects"], queryFn: api.projects, enabled: health.isSuccess, retry: 2 });
  const workspaceInfo = useQuery({ queryKey: ["workspace-info"], queryFn: api.workspaceInfo, enabled: projects.isSuccess });
  const auditEvents = useQuery({ queryKey: ["audit-events"], queryFn: api.auditEvents, enabled: projects.isSuccess, refetchInterval: 20_000 });

  const activeProjectId = selectedProjectId ?? projects.data?.[0]?.id ?? null;

  const selectedProject = useMemo(
    () => projects.data?.find((project) => project.id === activeProjectId) ?? null,
    [projects.data, activeProjectId],
  );

  const artifacts = useQuery({
    queryKey: ["artifacts", activeProjectId],
    queryFn: () => api.artifacts(activeProjectId!),
    enabled: Boolean(activeProjectId),
  });
  const workspace = useQuery({
    queryKey: ["workspace", activeProjectId],
    queryFn: () => api.workspace(activeProjectId!),
    enabled: Boolean(activeProjectId),
    refetchInterval: 10_000,
  });
  const executions = useQuery({ queryKey: ["executions", activeProjectId], queryFn: () => api.executions(activeProjectId!), enabled: Boolean(activeProjectId), refetchInterval: 4_000 });
  const approvals = useQuery({ queryKey: ["approvals", activeProjectId], queryFn: () => api.approvals(activeProjectId!), enabled: Boolean(activeProjectId), refetchInterval: 4_000 });
  const evaluations = useQuery({ queryKey: ["evaluations", activeProjectId], queryFn: () => api.evaluations(activeProjectId!), enabled: Boolean(activeProjectId), refetchInterval: 15_000 });

  const createProject = useMutation({
    mutationFn: api.createProject,
    onSuccess: async (project) => {
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      setSelectedProjectId(project.id);
      setShowCreate(false);
      setProjectName("");
      setProjectDescription("");
    },
  });

  const upload = useMutation({
    mutationFn: ({ projectId, file }: { projectId: string; file: File }) => api.uploadArtifact(projectId, file),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["artifacts", activeProjectId] }),
        queryClient.invalidateQueries({ queryKey: ["projects"] }),
      ]);
    },
  });

  const compile = useMutation({
    mutationFn: api.compile,
    onMutate: () => setCompileError([]),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["projects"] }),
        queryClient.invalidateQueries({ queryKey: ["workspace", activeProjectId] }),
      ]);
    },
    onError: (error: Error & { blockers?: string[] }) => setCompileError(error.blockers ?? [error.message]),
  });
  const resolveConflict = useMutation({
    mutationFn: api.resolveConflict,
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ["workspace", activeProjectId] }),
  });
  const publishWorkflow = useMutation({
    mutationFn: api.publishWorkflow,
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ["workspace", activeProjectId] }),
  });
  const createExecution = useMutation({
    mutationFn: api.createExecution,
    onSuccess: async () => Promise.all([queryClient.invalidateQueries({ queryKey: ["executions", activeProjectId] }), queryClient.invalidateQueries({ queryKey: ["approvals", activeProjectId] })]),
  });
  const decideApproval = useMutation({
    mutationFn: api.decideApproval,
    onSuccess: async () => Promise.all([queryClient.invalidateQueries({ queryKey: ["executions", activeProjectId] }), queryClient.invalidateQueries({ queryKey: ["approvals", activeProjectId] }), queryClient.invalidateQueries({ queryKey: ["audit-events"] })]),
  });
  const runEvaluation = useMutation({
    mutationFn: api.runEvaluation,
    onSuccess: async () => Promise.all([queryClient.invalidateQueries({ queryKey: ["evaluations", activeProjectId] }), queryClient.invalidateQueries({ queryKey: ["audit-events"] })]),
  });

  const onFiles = (files: FileList | null) => {
    if (!activeProjectId || !files?.length) return;
    Array.from(files).forEach((file) => upload.mutate({ projectId: activeProjectId, file }));
  };

  const backendOnline = health.isSuccess;
  const awsConnected = health.data?.aws_configured === true;
  const hasSources = Boolean(artifacts.data?.length);
  const cloudStatus = new Map((workspace.data?.artifacts ?? []).map((artifact) => [artifact.artifact_id, artifact.status]));
  const latestCompilation = workspace.data?.compilations[0];
  const heading = surfaceCopy[surface];
  const isBootstrapping = health.isPending || (health.isSuccess && projects.isPending);
  const bootstrapFailed = health.isError || projects.isError;

  if (isBootstrapping) return <PortalPreloader />;

  return (
    <main className="product-shell">
      <input ref={fileInput} type="file" multiple hidden accept=".pdf,.png,.jpg,.jpeg,.wav,.mp3,.m4a,.mp4,.mov,.csv,.xlsx,.docx,.txt,.json,.yaml,.yml" onChange={(event) => onFiles(event.target.files)} />
      <aside className="side-nav">
        <div className="brand-row">
          <div className="brand-symbol"><span /><span /><span /><span /></div>
          <span>OpsWeave</span>
        </div>

        <button className="workspace-select">
          <span className="workspace-logo">OW</span>
          <span><strong>My workspace</strong><small>Owner</small></span>
          <ChevronDown size={16} />
        </button>

        <nav aria-label="Primary">
          <p>Workspace</p>
          <button className={`nav-link ${surface === "overview" ? "active" : ""}`} onClick={() => setSurface("overview")}><Grid2X2 size={18} /><span>Overview</span></button>
          <button className={`nav-link ${surface === "projects" ? "active" : ""}`} onClick={() => setSurface("projects")}><FolderKanban size={18} /><span>Projects</span><em>{projects.data?.length ?? 0}</em></button>
          <button className={`nav-link ${surface === "sources" ? "active" : ""}`} onClick={() => setSurface("sources")}><Blocks size={18} /><span>Sources</span><em>{artifacts.data?.length ?? 0}</em></button>
          <button className={`nav-link ${surface === "evidence" ? "active" : ""}`} onClick={() => setSurface("evidence")}><BookOpenCheck size={18} /><span>Evidence</span><em>{workspace.data?.evidence.length ?? 0}</em></button>
          <button className={`nav-link ${surface === "conflicts" ? "active" : ""}`} onClick={() => setSurface("conflicts")}><FileWarning size={18} /><span>Conflicts</span><em>{workspace.data?.conflicts.filter((item) => item.status === "open").length ?? 0}</em></button>
          <button className={`nav-link ${surface === "workflow" ? "active" : ""}`} onClick={() => setSurface("workflow")}><GitBranch size={18} /><span>Workflow studio</span></button>
          <button className={`nav-link ${surface === "operations" ? "active" : ""}`} onClick={() => setSurface("operations")}><Inbox size={18} /><span>Review inbox</span></button>
          <p>Platform</p>
          <button className={`nav-link ${surface === "evaluations" ? "active" : ""}`} onClick={() => setSurface("evaluations")}><FlaskConical size={18} /><span>Evaluations</span></button>
          <button className={`nav-link ${surface === "activity" ? "active" : ""}`} onClick={() => setSurface("activity")}><Activity size={18} /><span>Activity</span></button>
          <button className={`nav-link ${surface === "members" ? "active" : ""}`} onClick={() => setSurface("members")}><Users size={18} /><span>Members</span></button>
          <button className={`nav-link ${surface === "settings" ? "active" : ""}`} onClick={() => setSurface("settings")}><Settings size={18} /><span>Settings</span></button>
        </nav>

        <div className="nav-footer">
          <div className={`service-state ${backendOnline ? "online" : "offline"}`}>
            {backendOnline ? <Cloud size={16} /> : <CloudOff size={16} />}
            <span><strong>{backendOnline ? "API connected" : "API unavailable"}</strong><small>{backendOnline ? health.data.environment : "Start the OpsWeave API"}</small></span>
          </div>
          <button className="account-row"><span className="avatar">SM</span><span><strong>Saurav Mukherjee</strong><small>Solution engineer</small></span><MoreHorizontal size={17} /></button>
        </div>
      </aside>

      <section className="product-main">
        <header className="app-header">
          <button className="icon-button mobile-menu" aria-label="Open menu"><Menu size={19} /></button>
          <div className="search-box"><Search size={18} /><input aria-label="Search" placeholder="Search projects, sources and workflows" /><kbd>⌘ K</kbd></div>
          <div className="header-actions">
            <button className="icon-button" aria-label="Help"><HelpCircle size={19} /></button>
            <button className="icon-button" aria-label="Notifications"><Bell size={19} /><i /></button>
            <button className="theme-toggle" onClick={toggleTheme} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}>
              <Sun size={16} /><span className={theme} /><Moon size={16} />
            </button>
            <button className="new-project-button" onClick={() => setShowCreate(true)}><Plus size={18} /> New project</button>
          </div>
        </header>

        <div className="content-wrap">
          <section className="page-heading">
            <div><span className="eyebrow">{heading.eyebrow}</span><h1>{heading.title}</h1><p>{heading.description}</p></div>
            {selectedProject && <button className="project-pill"><span className="project-color" />{selectedProject.name}<ChevronDown size={15} /></button>}
          </section>

          {bootstrapFailed && (
            <div className="system-banner error">
              <CircleAlert size={19} />
              <span><strong>OpsWeave could not finish loading.</strong> The live workspace did not respond after several attempts. No placeholder data is being shown.</span>
              <button onClick={() => void health.refetch().then((result) => { if (result.isSuccess) void projects.refetch(); })}>Try again</button>
            </div>
          )}

          {backendOnline && projects.data?.length === 0 && (
            <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="empty-workspace">
              <div className="empty-visual"><div className="orbit one"><FileText /></div><div className="orbit two"><FileImage /></div><div className="orbit three"><FileAudio /></div><div className="center-spark"><WandSparkles /></div></div>
              <span>YOUR FIRST LIVE WORKFLOW</span><h2>Create a workspace project</h2><p>Start with a real operating procedure, policy, image, spreadsheet or interview recording. OpsWeave will preserve its provenance from upload onward.</p><button onClick={() => setShowCreate(true)}><Plus size={18} /> Create project</button>
            </motion.section>
          )}

          {selectedProject && surface === "overview" && (
            <div className="workspace-grid">
              <section className="source-workbench card">
                <div className="card-heading"><div><span className="section-icon blue"><UploadCloud size={19} /></span><span><strong>Source workbench</strong><small>Real files stored with checksum and tenant ownership</small></span></div><span className="count-chip">{artifacts.data?.length ?? 0} sources</span></div>

                <button className="drop-zone" onClick={() => fileInput.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); onFiles(event.dataTransfer.files); }}>
                  <span className="upload-illustration"><UploadCloud size={26} /></span>
                  <span><strong>{upload.isPending ? "Uploading securely…" : "Drop source files here"}</strong><small>PDF, image, audio, spreadsheet, document or OpenAPI file · 25 MB max</small></span>
                  <em>Browse files</em>
                </button>

                {upload.isError && <div className="inline-error"><CircleAlert size={15} />{upload.error.message}</div>}

                <div className="source-table-head"><span>Source</span><span>Status</span><span>Size</span><span>Added</span></div>
                <div className="source-rows">
                  {artifacts.isLoading && <div className="loading-row"><LoaderCircle className="spin" size={17} /> Loading sources</div>}
                  {artifacts.data?.map((artifact, index) => <SourceRow artifact={{ ...artifact, status: cloudStatus.get(artifact.id) ?? artifact.status }} key={artifact.id} index={index} />)}
                  {!artifacts.isLoading && !artifacts.data?.length && <div className="no-sources"><FileText size={21} /><span><strong>No sources yet</strong><small>Files you upload will appear here with their real processing state.</small></span></div>}
                </div>
              </section>

              <aside className="right-rail">
                <section className="pipeline-card card">
                  <div className="card-heading compact"><div><span className="section-icon multicolor"><Sparkles size={18} /></span><span><strong>Launch readiness</strong><small>Live configuration checks</small></span></div></div>
                  <div className="readiness-list">
                    <ReadinessItem done={backendOnline} color="blue" title="Platform API" detail={backendOnline ? "Connected" : "Unavailable"} />
                    <ReadinessItem done={Boolean(selectedProject)} color="yellow" title="Project context" detail={selectedProject.name} />
                    <ReadinessItem done={hasSources} color="red" title="Source evidence" detail={hasSources ? `${artifacts.data!.length} uploaded` : "Required"} />
                    <ReadinessItem done={awsConnected} color="green" title="AWS intelligence" detail={awsConnected ? "Bedrock + S3 configured" : "Configuration required"} />
                  </div>
                  <button className="compile-button" disabled={!hasSources || compile.isPending} onClick={() => compile.mutate(selectedProject.id)}>{compile.isPending ? <LoaderCircle className="spin" size={17} /> : <WandSparkles size={17} />} Compile workflow <ArrowRight size={17} /></button>
                  <p className="real-action-note"><ShieldCheck size={14} />This calls the configured AWS pipeline. It never fabricates a workflow.</p>
                </section>

                <AnimatePresence>{compile.isSuccess && <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="queued-card"><div><Check size={18} /><strong>Compilation queued</strong></div><p>Job <code>{compile.data.id.slice(0, 8)}</code> is waiting for the AWS worker. The portal will only show evidence and workflows produced by that job.</p></motion.section>}</AnimatePresence>

                {latestCompilation && <CompilationProgress compilation={latestCompilation} onOpen={() => setSurface(latestCompilation.status === "succeeded" ? "workflow" : "evidence")} />}

                <AnimatePresence>{compileError.length > 0 && <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="blocker-card"><div><CircleAlert size={18} /><strong>Compilation blocked</strong><button onClick={() => setCompileError([])} aria-label="Dismiss"><X size={15} /></button></div><ul>{compileError.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul></motion.section>}</AnimatePresence>

                <section className="project-card card">
                  <span className="section-icon purple"><FolderKanban size={19} /></span><div><small>ACTIVE PROJECT</small><strong>{selectedProject.name}</strong><p>{selectedProject.description || "No description provided."}</p></div>
                  <div className="project-meta"><span><i className="blue-dot" />{selectedProject.status}</span><span>Updated {new Date(selectedProject.updated_at).toLocaleDateString()}</span></div>
                </section>
              </aside>
            </div>
          )}

          {surface === "projects" && <ProjectsSurface projects={projects.data ?? []} selectedProjectId={activeProjectId} onSelect={(projectId) => { setSelectedProjectId(projectId); setSurface("overview"); }} onCreate={() => setShowCreate(true)} />}
          {selectedProject && surface === "sources" && <SourcesSurface artifacts={artifacts.data ?? []} cloudArtifacts={workspace.data?.artifacts ?? []} pending={upload.isPending} onUpload={() => fileInput.current?.click()} />}
          {selectedProject && surface === "evidence" && <EvidenceExplorer workspace={workspace.data} loading={workspace.isLoading} />}
          {selectedProject && surface === "conflicts" && <ConflictRoom workspace={workspace.data} pending={resolveConflict.isPending} onResolve={(conflictId, resolution) => resolveConflict.mutate({ projectId: selectedProject.id, conflictId, resolution })} />}
          {selectedProject && surface === "workflow" && <WorkflowStudio workspace={workspace.data} publishPending={publishWorkflow.isPending} publishError={publishWorkflow.error?.message} onPublish={(workflowId) => publishWorkflow.mutate({ projectId: selectedProject.id, workflowId })} />}
          {selectedProject && surface === "operations" && <OperationsSurface projectId={selectedProject.id} workflow={workspace.data?.workflow} approvals={approvals.data ?? []} executions={executions.data ?? []} pending={decideApproval.isPending || createExecution.isPending} onRun={() => workspace.data?.workflow && createExecution.mutate({ projectId: selectedProject.id, workflowId: workspace.data.workflow.workflow_id })} onDecision={(approvalId, decision) => decideApproval.mutate({ projectId: selectedProject.id, approvalId, decision })} />}
          {selectedProject && surface === "evaluations" && <EvaluationSurface workflow={workspace.data?.workflow} evaluations={evaluations.data ?? []} pending={runEvaluation.isPending} error={runEvaluation.error?.message} onRun={() => workspace.data?.workflow && runEvaluation.mutate({ projectId: selectedProject.id, workflowId: workspace.data.workflow.workflow_id })} />}
          {surface === "activity" && <ActivitySurface events={auditEvents.data ?? []} loading={auditEvents.isLoading} />}
          {surface === "members" && <MembersSurface info={workspaceInfo.data} loading={workspaceInfo.isLoading} />}
          {surface === "settings" && <SettingsSurface info={workspaceInfo.data} healthOnline={backendOnline} awsConnected={awsConnected} />}
        </div>
      </section>

      <AnimatePresence>{showCreate && <CreateProjectDialog name={projectName} description={projectDescription} pending={createProject.isPending} error={createProject.error?.message} onName={setProjectName} onDescription={setProjectDescription} onClose={() => setShowCreate(false)} onSubmit={() => createProject.mutate({ name: projectName, description: projectDescription })} />}</AnimatePresence>
    </main>
  );
}

function ProjectsSurface({ projects, selectedProjectId, onSelect, onCreate }: { projects: Project[]; selectedProjectId: string | null; onSelect: (projectId: string) => void; onCreate: () => void }) {
  return <div className="project-gallery"><button className="create-project-tile" onClick={onCreate}><span><Plus size={22} /></span><strong>Create another project</strong><small>Start a separate tenant-scoped process</small></button>{projects.map((project, index) => <motion.button className={`project-tile card ${project.id === selectedProjectId ? "selected" : ""}`} key={project.id} onClick={() => onSelect(project.id)} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * .04 }}><span className={`project-tile-icon color-${index % 4}`}><FolderKanban size={21} /></span><span className="project-tile-status"><i />{project.status}</span><strong>{project.name}</strong><p>{project.description || "No project description."}</p><footer><span>{project.artifact_count} sources</span><span>Updated {new Date(project.updated_at).toLocaleDateString()}</span></footer></motion.button>)}</div>;
}

function SourcesSurface({ artifacts, cloudArtifacts, pending, onUpload }: { artifacts: Artifact[]; cloudArtifacts: ProjectWorkspace["artifacts"]; pending: boolean; onUpload: () => void }) {
  const cloud = new Map(cloudArtifacts.map((artifact) => [artifact.artifact_id, artifact]));
  const groups = artifacts.reduce<Record<string, number>>((acc, artifact) => {
    const group = artifact.media_type.startsWith("image/") ? "Images" : artifact.media_type.startsWith("audio/") ? "Audio" : artifact.media_type.startsWith("video/") ? "Video" : artifact.media_type.includes("csv") || artifact.media_type.includes("json") || artifact.media_type.includes("yaml") ? "Structured" : "Documents";
    acc[group] = (acc[group] ?? 0) + 1;
    return acc;
  }, {});
  return <div className="source-library-layout"><section className="source-library card"><div className="surface-card-head"><span><strong>{artifacts.length} governed sources</strong><small>Checksummed originals with immutable processing provenance</small></span><button className="surface-action" onClick={onUpload} disabled={pending}>{pending ? <LoaderCircle className="spin" size={15} /> : <UploadCloud size={15} />}Upload sources</button></div><div className="source-library-grid">{artifacts.map((artifact, index) => { const remote = cloud.get(artifact.id); const effective = { ...artifact, status: remote?.status ?? artifact.status }; return <article className="source-card" key={artifact.id}><span className={`file-icon ${["blue", "red", "green", "yellow", "purple"][index % 5]}`}><SourceGlyph mediaType={artifact.media_type} /></span><span className={`status-chip ${effective.status}`}><i />{effective.status}</span><strong title={artifact.filename}>{artifact.filename}</strong><small>{artifact.media_type}</small><dl><div><dt>Size</dt><dd>{formatBytes(artifact.size_bytes)}</dd></div><div><dt>Evidence</dt><dd>{remote?.evidence_count ?? "—"}</dd></div><div><dt>SHA-256</dt><dd title={artifact.checksum_sha256}>{artifact.checksum_sha256.slice(0, 10)}…</dd></div></dl></article>; })}</div></section><aside className="modality-rail card"><span className="section-icon multicolor"><Blocks size={19} /></span><h3>Modality coverage</h3><p>Binary media routes through Bedrock Data Automation. Text and structured formats use deterministic normalization before entering the same evidence store.</p>{Object.entries(groups).map(([name, count]) => <div className="modality-row" key={name}><span>{name}</span><strong>{count}</strong></div>)}</aside></div>;
}

function ActivitySurface({ events, loading }: { events: AuditEvent[]; loading: boolean }) {
  if (loading) return <LoadingSurface label="Loading audit activity" />;
  return <section className="activity-card card"><div className="surface-card-head"><span><strong>{events.length} recent audit events</strong><small>Read directly from the tenant-scoped append-only application log</small></span><em><ShieldCheck size={14} /> Tenant filtered</em></div><div className="activity-list">{events.map((event) => <article key={event.id}><span className={`activity-icon ${event.resource_type}`}><Activity size={16} /></span><span><strong>{event.action.replaceAll(".", " ")}</strong><small>{event.resource_type} · {event.resource_id.slice(0, 12)}</small></span><code>{event.actor_id}</code><time>{new Date(event.created_at).toLocaleString()}</time></article>)}{events.length === 0 && <div className="no-sources">No audit activity has been recorded.</div>}</div></section>;
}

function MembersSurface({ info, loading }: { info?: WorkspaceInfo; loading: boolean }) {
  if (loading) return <LoadingSurface label="Loading workspace identity" />;
  if (!info) return <AwaitingPublicationSurface icon={<Users size={28} />} title="Workspace identity unavailable" detail="The authenticated workspace endpoint could not be reached." />;
  return <div className="admin-grid"><section className="member-card card"><header><span className="avatar large">SM</span><span><strong>Saurav Mukherjee</strong><small>{info.actor_id}</small></span><em>{info.role}</em></header><div className="member-detail"><KeyRound size={17} /><span><strong>Authenticated principal</strong><small>Development headers are replaced by verified Cognito claims at the production API boundary.</small></span></div><div className="member-detail"><ShieldCheck size={17} /><span><strong>Tenant scope</strong><small>{info.tenant_name} · {info.tenant_id}</small></span></div></section><section className="invite-card card"><span className="section-icon blue"><Users size={19} /></span><h3>Invite-controlled production access</h3><p>The user pool is provisioned independently for OpsWeave. Public visitors use a read-only guided tenant; authenticated members receive explicit tenant and role claims.</p><button disabled><Plus size={16} /> Invitations activate with hosted sign-in</button></section></div>;
}

function SettingsSurface({ info, healthOnline, awsConnected }: { info?: WorkspaceInfo; healthOnline: boolean; awsConnected: boolean }) {
  if (!info) return <LoadingSurface label="Loading platform controls" />;
  const settingsRows = [
    { icon: <Cloud size={18} />, color: "blue", title: "AWS environment", value: `${info.region} · ${info.environment}`, detail: info.isolation },
    { icon: <Sparkles size={18} />, color: "purple", title: "Reasoning model alias", value: info.model_alias ?? "Not configured", detail: "Portable workflow versions retain aliases rather than provider credentials." },
    { icon: <ShieldCheck size={18} />, color: "green", title: "Rate limiting", value: info.rate_limiting ? "Enforced" : "Disabled", detail: "DynamoDB-backed tenant and session quotas protect the public demo." },
    { icon: <Database size={18} />, color: "yellow", title: "Maximum artifact size", value: formatBytes(info.max_upload_bytes), detail: "Uploads enter the dedicated encrypted quarantine bucket." },
  ];
  return <div className="settings-layout"><section className="settings-card card"><div className="surface-card-head"><span><strong>Runtime configuration</strong><small>Non-secret values reported by the live API</small></span><span className={`health-pill ${healthOnline && awsConnected ? "online" : "offline"}`}><i />{healthOnline && awsConnected ? "Healthy" : "Attention"}</span></div>{settingsRows.map((row) => <article className="setting-row" key={row.title}><span className={`section-icon ${row.color}`}>{row.icon}</span><span><strong>{row.title}</strong><small>{row.detail}</small></span><code>{row.value}</code></article>)}</section><aside className="budget-card card"><span>MONTHLY PROJECT BUDGET</span><strong>$20</strong><p>OpsWeave uses a dedicated tag-scoped budget. Health AI retains its separate $20 budget; the account total remains $40.</p><div><span>Model call control</span><em>{info.model_calls_configured ? "Configured" : "Missing"}</em></div><div><span>Resource boundary</span><em>Dedicated</em></div></aside></div>;
}

function SourceRow({ artifact, index }: { artifact: Artifact; index: number }) {
  const colors = ["blue", "red", "green", "yellow", "purple"];
  return <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.035 }} className="source-row"><span className={`file-icon ${colors[index % colors.length]}`}><SourceGlyph mediaType={artifact.media_type} /></span><span className="file-name"><strong>{artifact.filename}</strong><small>{artifact.media_type}</small></span><span className={`status-chip ${artifact.status}`}><i />{artifact.status}</span><span className="file-size">{formatBytes(artifact.size_bytes)}</span><span className="file-date">{new Date(artifact.created_at).toLocaleDateString()}</span><button aria-label={`More options for ${artifact.filename}`}><MoreHorizontal size={17} /></button></motion.div>;
}

function CompilationProgress({ compilation, onOpen }: { compilation: CloudCompilation; onOpen: () => void }) {
  const progress = compilation.progress ?? ({ pending: 3, queued: 8, ingesting: 30, compiling: 72, succeeded: 100, failed: 100 }[compilation.status] ?? 0);
  return <section className={`compilation-progress card ${compilation.status}`}><div className="compilation-progress-head"><span className="section-icon blue">{compilation.status === "succeeded" ? <Check size={18} /> : compilation.status === "failed" ? <CircleAlert size={18} /> : <LoaderCircle className="spin" size={18} />}</span><span><small>LIVE COMPILATION</small><strong>{compilation.status.replaceAll("_", " ")}</strong></span><em>{progress}%</em></div><div className="progress-track"><span style={{ width: `${progress}%` }} /></div>{compilation.summary && <p>{compilation.summary}</p>}{compilation.error_message && <p className="progress-error">{compilation.error_message}</p>}<button onClick={onOpen}>{compilation.status === "succeeded" ? "Open compiled workflow" : "Inspect live evidence"}<ArrowRight size={15} /></button></section>;
}

function EvidenceExplorer({ workspace, loading }: { workspace?: ProjectWorkspace; loading: boolean }) {
  if (loading) return <LoadingSurface label="Loading grounded evidence" />;
  if (!workspace?.cloud_connected) return <AwaitingPublicationSurface icon={<CloudOff size={28} />} title="AWS evidence store is not connected" detail="Configure the OpsWeave DynamoDB application table to inspect live compilation output." />;
  if (!workspace.evidence.length) return <AwaitingPublicationSurface icon={<BookOpenCheck size={28} />} title="No compiled evidence yet" detail="Upload source material and start a compilation. Facts will appear only after Bedrock extraction and citation validation complete." />;
  const extracted = workspace.evidence.some((item) => item.stage === "extracted");
  return <div className="evidence-layout"><section className="evidence-list card"><div className="surface-card-head"><span><strong>{workspace.evidence.length} grounded findings</strong><small>{extracted ? "Normalized directly from live AWS multimodal extraction" : "Produced by the latest evidence-bound compilation"}</small></span><em><ShieldCheck size={14} /> Provenance required</em></div>{workspace.evidence.map((item) => <article className="evidence-fact" key={item.evidence_id}><div className={`fact-kind ${item.kind}`}>{item.stage === "extracted" ? "source" : item.kind}</div><div><p>{item.statement}</p>{item.filename && <div className="source-provenance"><SourceGlyph mediaType={workspace.artifacts.find((artifact) => artifact.artifact_id === item.artifact_id)?.media_type ?? "text/plain"} /><span>{item.filename}{item.page ? ` · page ${item.page}` : ""}{item.timestamp ? ` · ${item.timestamp}` : ""}</span></div>}<div className="citation-row">{item.source_evidence_ids.map((citation) => <code key={citation}>#{citation.slice(0, 10)}</code>)}</div></div><span className="confidence"><strong>{Math.round(Number(item.confidence) * 100)}%</strong><small>confidence</small></span></article>)}</section><aside className="evidence-summary card"><span className="section-icon multicolor"><Sparkles size={19} /></span><h3>Evidence health</h3><p>{extracted ? "Source extraction remains independently inspectable while the reasoning compiler is unavailable. No inferred workflow facts are being presented as complete." : "Every process fact must cite extracted source evidence. Unsupported model output is rejected before a workflow version can be created."}</p><dl><div><dt>Grounded findings</dt><dd>{workspace.evidence.length}</dd></div><div><dt>Open conflicts</dt><dd>{workspace.conflicts.filter((item) => item.status === "open").length}</dd></div><div><dt>Workflow version</dt><dd>{workspace.workflow ? `v${workspace.workflow.version}` : "—"}</dd></div></dl></aside></div>;
}

function ConflictRoom({ workspace, pending, onResolve }: { workspace?: ProjectWorkspace; pending: boolean; onResolve: (conflictId: string, resolution: string) => void }) {
  if (!workspace?.conflicts.length) return <AwaitingPublicationSurface icon={<FileWarning size={28} />} title="No source contradictions detected" detail="Conflicts will appear here when independently grounded sources disagree on a rule, threshold, actor, or required action." />;
  return <div className="conflict-grid">{workspace.conflicts.map((conflict) => <article className={`conflict-panel card ${conflict.status}`} key={conflict.conflict_id}><header><span className={`severity ${conflict.severity}`}>{conflict.severity}</span><span className={`resolution-state ${conflict.status}`}>{conflict.status}</span></header><h2>{conflict.title}</h2><p>{conflict.description}</p><div className="conflict-citations"><small>CONTRADICTORY EVIDENCE</small>{conflict.source_evidence_ids.map((citation) => <code key={citation}>#{citation.slice(0, 12)}</code>)}</div><div className="recommendation"><WandSparkles size={17} /><span><small>RECOMMENDED INTERPRETATION</small><p>{conflict.recommended_resolution}</p></span></div>{conflict.status === "open" ? <button disabled={pending} onClick={() => onResolve(conflict.conflict_id, conflict.recommended_resolution)}>{pending ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />} Accept and record resolution</button> : <div className="resolved-copy"><ShieldCheck size={16} />{conflict.resolution}</div>}</article>)}</div>;
}

function WorkflowStudio({ workspace, publishPending, publishError, onPublish }: { workspace?: ProjectWorkspace; publishPending: boolean; publishError?: string; onPublish: (workflowId: string) => void }) {
  const workflow = workspace?.workflow;
  if (!workflow) return <AwaitingPublicationSurface icon={<Waypoints size={28} />} title="No workflow version compiled yet" detail="The studio will open after multimodal evidence, contradictions, and graph validation have completed successfully." />;
  return <div className="studio-layout"><section className="studio-main card"><div className="surface-card-head"><span><strong>{workflow.definition.name}</strong><small>{workflow.status === "published" ? "Published" : "Draft"} version {workflow.version} · {workflow.compilation_method?.replaceAll("_", " ") ?? workflow.model_id}</small></span><em className={workflow.validation.valid ? "valid" : "invalid"}>{workflow.validation.valid ? <Check size={14} /> : <CircleAlert size={14} />}{workflow.validation.valid ? "Graph valid" : "Validation issues"}</em></div><WorkflowCanvas workflow={workflow} /></section><aside className="studio-rail"><section className="card workflow-summary"><span className="section-icon purple"><GitBranch size={18} /></span><h3>Compiled intent</h3><p>{workflow.summary}</p><dl><div><dt>Typed nodes</dt><dd>{workflow.definition.nodes.length}</dd></div><div><dt>Transitions</dt><dd>{workflow.definition.edges.length}</dd></div><div><dt>Approval gates</dt><dd>{workflow.definition.nodes.filter((node) => node.type === "approval").length}</dd></div></dl>{workflow.status === "draft" ? <button className="publish-button" disabled={publishPending || !workflow.validation.valid} onClick={() => onPublish(workflow.workflow_id)}>{publishPending ? <LoaderCircle className="spin" size={16} /> : <Cloud size={16} />}Publish to AWS runtime</button> : <div className="published-badge"><Cloud size={15} />Live on Step Functions</div>}{publishError && <div className="inline-error"><CircleAlert size={15} />{publishError}</div>}</section><section className="card question-list"><small>CLARIFICATION QUEUE</small><h3>{workflow.clarification_questions.length} questions</h3>{workflow.clarification_questions.map((question, index) => <p key={`${index}-${question}`}><span>{index + 1}</span>{question}</p>)}</section></aside></div>;
}

function OperationsSurface({ projectId, workflow, approvals, executions, pending, onRun, onDecision }: { projectId: string; workflow?: ProjectWorkspace["workflow"]; approvals: Approval[]; executions: Execution[]; pending: boolean; onRun: () => void; onDecision: (approvalId: string, decision: "approve" | "reject") => void }) {
  const [selectedExecutionId, setSelectedExecutionId] = useState<string | null>(executions[0]?.execution_id ?? null);
  const activeExecutionId = selectedExecutionId ?? executions[0]?.execution_id ?? null;
  const detail = useQuery({ queryKey: ["execution-detail", projectId, activeExecutionId], queryFn: () => api.execution(projectId, activeExecutionId!), enabled: Boolean(activeExecutionId), refetchInterval: 5_000 });
  if (!workflow || workflow.status !== "published") return <AwaitingPublicationSurface icon={<Inbox size={28} />} title="Publish a workflow to activate operations" detail="The operations inbox becomes active only after a validated workflow version passes publication gates." />;
  const pendingApprovals = approvals.filter((approval) => approval.status === "pending");
  return <div className="operations-layout"><section className="approval-queue card"><div className="surface-card-head"><span><strong>{pendingApprovals.length} claims awaiting review</strong><small>Callback-token executions paused inside AWS Step Functions</small></span><button className="surface-action" disabled={pending} onClick={onRun}>{pending ? <LoaderCircle className="spin" size={15} /> : <Play size={15} />}Run live sample claim</button></div>{pendingApprovals.length ? <div className="approval-list">{pendingApprovals.map((approval) => <article key={approval.approval_id}><header><span className="claim-id">{approval.claim.claim_id}</span><span className="confidence-chip">{Math.round(Number(approval.recommendation.confidence) * 100)}% confidence</span></header><div className="claim-summary"><span><small>CLAIM AMOUNT</small><strong>${Number(approval.claim.claimed_amount_usd).toFixed(2)}</strong></span><span><small>ORDER</small><strong>{approval.claim.order_id}</strong></span><span><small>SHIPMENT</small><strong>{approval.claim.shipment_id}</strong></span></div><p>{approval.claim.damage_description}</p><div className="agent-recommendation"><WandSparkles size={17} /><span><small>AGENT RECOMMENDATION</small><strong>Human review · {approval.recommendation.reason.replaceAll("_", " ")}</strong></span></div><footer><button className="reject" disabled={pending} onClick={() => onDecision(approval.approval_id, "reject")}><X size={16} />Reject</button><button className="approve" disabled={pending} onClick={() => onDecision(approval.approval_id, "approve")}><Check size={16} />Approve refund</button></footer></article>)}</div> : <div className="no-sources"><Check size={20} /><span><strong>Review queue is clear</strong><small>Run a live sample claim to exercise the callback approval path.</small></span></div>}</section><aside className="execution-rail card"><div className="card-heading compact"><div><span className="section-icon blue"><Activity size={18} /></span><span><strong>Live executions</strong><small>Latest Step Functions state</small></span></div></div>{executions.map((execution) => <button className={`execution-row ${activeExecutionId === execution.execution_id ? "selected" : ""}`} key={execution.execution_id} onClick={() => setSelectedExecutionId(execution.execution_id)}><span className={`execution-state ${execution.status}`}><i /></span><span><strong>{execution.claim.claim_id}</strong><small>{execution.current_node?.replaceAll("_", " ")} · v{execution.workflow_version}</small></span><em>{execution.status.replaceAll("_", " ")}</em></button>)}{!executions.length && <p className="rail-empty">No workflow executions yet.</p>}</aside>{activeExecutionId && <section className="execution-trace card"><div className="surface-card-head"><span><strong>Execution trace</strong><small>{detail.data?.claim.claim_id ?? activeExecutionId} · authoritative AWS history</small></span>{detail.isLoading ? <LoaderCircle className="spin" size={16} /> : <span className={`evaluation-status ${detail.data?.status === "succeeded" ? "passed" : "failed"}`}>{detail.data?.status}</span>}</div><div className="trace-events">{detail.data?.trace.map((event) => <article key={event.id}><span className={`trace-dot ${event.type.includes("Succeeded") ? "success" : event.type.includes("Failed") ? "failure" : ""}`} /><span><strong>{event.state_name ?? event.type.replaceAll(/([a-z])([A-Z])/g, "$1 $2")}</strong><small>{event.resource ?? event.type}</small></span><time>{new Date(event.timestamp).toLocaleTimeString()}</time></article>)}</div></section>}</div>;
}

function EvaluationSurface({ workflow, evaluations, pending, error, onRun }: { workflow?: ProjectWorkspace["workflow"]; evaluations: Evaluation[]; pending: boolean; error?: string; onRun: () => void }) {
  if (!workflow) return <AwaitingPublicationSurface icon={<FlaskConical size={28} />} title="Compile a workflow before evaluation" detail="The evaluation lab runs only against a validated workflow version and its grounded evidence." />;
  const latest = evaluations[0];
  if (!latest) return <section className="evaluation-empty card"><span className="section-icon multicolor"><FlaskConical size={20} /></span><small>REAL METRICS ONLY</small><h2>Run the 60-case policy suite</h2><p>Fifteen standard, ambiguous, incomplete, and adversarial claims are evaluated against the current graph, citations, escalation behavior, and consequential-action controls.</p><button onClick={onRun} disabled={pending}>{pending ? <LoaderCircle className="spin" size={16} /> : <Play size={16} />}Run evaluation suite</button>{error && <div className="inline-error"><CircleAlert size={15} />{error}</div>}</section>;
  const metrics = [
    ["Execution success", latest.metrics.workflow_execution_success, ">= 90%", "blue"],
    ["Citation accuracy", latest.metrics.citation_accuracy, ">= 95%", "green"],
    ["Escalation recall", latest.metrics.escalation_recall, ">= 95%", "purple"],
    ["Unsafe action rate", latest.metrics.unsafe_action_rate, "= 0%", "red"],
  ] as const;
  return <div className="evaluation-layout"><section className="evaluation-main card"><div className="surface-card-head"><span><strong>Workflow v{latest.workflow_version} evaluation</strong><small>{latest.metrics.case_count} labeled cases · {latest.method.replaceAll("_", " ")}</small></span><span className={`evaluation-status ${latest.status}`}>{latest.status === "passed" ? <Check size={14} /> : <CircleAlert size={14} />}{latest.status}</span></div><div className="metric-grid">{metrics.map(([name, value, threshold, color]) => <article className={`metric-card ${color}`} key={name}><span>{name}</span><strong>{Math.round(Number(value) * 100)}%</strong><small>Gate {threshold}</small><div><i style={{ width: `${Math.max(2, Number(value) * 100)}%` }} /></div></article>)}</div><div className="case-groups">{Object.entries(latest.case_groups).map(([name, count]) => <article key={name}><span className={`case-dot ${name}`} /><span><strong>{name}</strong><small>Policy-labeled scenario group</small></span><em>{count} cases</em></article>)}</div></section><aside className="evaluation-rail card"><span className="section-icon yellow"><ShieldCheck size={19} /></span><h3>Safety posture</h3><p>The published graph escalates every case, producing perfect required-escalation recall and zero unsafe tool paths, but a conservative straight-through rate.</p><dl><div><dt>Unnecessary escalations</dt><dd>{Math.round(Number(latest.metrics.unnecessary_escalation_rate) * 100)}%</dd></div><div><dt>Straight-through rate</dt><dd>{Math.round(Number(latest.metrics.straight_through_rate) * 100)}%</dd></div><div><dt>Gates passed</dt><dd>{Object.values(latest.gates).filter(Boolean).length}/{Object.keys(latest.gates).length}</dd></div></dl><button onClick={onRun} disabled={pending}>{pending ? <LoaderCircle className="spin" size={15} /> : <FlaskConical size={15} />}Run again</button></aside></div>;
}

function LoadingSurface({ label }: { label: string }) {
  return <div className="loading-surface card"><LoaderCircle className="spin" size={22} />{label}</div>;
}

function AwaitingPublicationSurface({ icon, title, detail }: { icon: ReactNode; title: string; detail: string }) {
  return <section className="awaiting-surface card"><span>{icon}</span><small>LIVE DATA ONLY</small><h2>{title}</h2><p>{detail}</p></section>;
}

function ReadinessItem({ done, color, title, detail }: { done: boolean; color: string; title: string; detail: string }) {
  return <div className="readiness-item"><span className={`readiness-icon ${color} ${done ? "done" : ""}`}>{done ? <Check size={15} /> : <span />}</span><span><strong>{title}</strong><small>{detail}</small></span></div>;
}

function CreateProjectDialog({ name, description, pending, error, onName, onDescription, onClose, onSubmit }: { name: string; description: string; pending: boolean; error?: string; onName: (value: string) => void; onDescription: (value: string) => void; onClose: () => void; onSubmit: () => void }) {
  return <motion.div className="dialog-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><motion.form className="dialog" initial={{ opacity: 0, scale: .97, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: .98 }} onSubmit={(event) => { event.preventDefault(); onSubmit(); }}><div className="dialog-head"><span className="section-icon blue"><FolderKanban size={20} /></span><div><h2>Create a project</h2><p>Projects isolate sources, workflow versions and audit history.</p></div><button type="button" onClick={onClose} aria-label="Close"><X size={18} /></button></div><label>Project name<input autoFocus value={name} onChange={(event) => onName(event.target.value)} minLength={3} maxLength={180} placeholder="Damaged shipment resolution" required /></label><label>Description<textarea value={description} onChange={(event) => onDescription(event.target.value)} maxLength={2000} placeholder="Describe the operating process and intended outcome." /></label>{error && <div className="inline-error"><CircleAlert size={15} />{error}</div>}<div className="dialog-actions"><button type="button" onClick={onClose}>Cancel</button><button type="submit" disabled={pending || name.trim().length < 3}>{pending && <LoaderCircle className="spin" size={16} />}Create project</button></div></motion.form></motion.div>;
}
