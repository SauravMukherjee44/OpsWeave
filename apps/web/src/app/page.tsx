"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, CircleAlert, Plus, WandSparkles } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, type Artifact } from "@/lib/api";
import { surfaceCopy, type Surface } from "@/lib/surfaces";
import { surfaceTransition } from "@/lib/motion";
import { Button, EmptyState } from "@/components/ui";
import { AppHeader, type Theme } from "@/components/shell/app-header";
import { PageHeading } from "@/components/shell/page-heading";
import { AmbientBackdrop, PortalPreloader } from "@/components/shell/preloader";
import { SideNav } from "@/components/shell/side-nav";
import { ActivitySurface } from "@/components/surfaces/activity";
import { ConflictRoom } from "@/components/surfaces/conflicts";
import { EvaluationSurface } from "@/components/surfaces/evaluations";
import { EvidenceExplorer } from "@/components/surfaces/evidence";
import { MembersSurface } from "@/components/surfaces/members";
import { OperationsSurface } from "@/components/surfaces/operations";
import { OverviewSurface } from "@/components/surfaces/overview";
import { ProjectsSurface } from "@/components/surfaces/projects";
import { SettingsSurface } from "@/components/surfaces/settings";
import { SourcesSurface } from "@/components/surfaces/sources";
import { WorkflowStudio } from "@/components/surfaces/workflow-studio";
import { ArtifactPreview } from "@/components/dialogs/artifact-preview";
import { AuthDialog } from "@/components/dialogs/auth-dialog";
import { CreateProjectDialog } from "@/components/dialogs/create-project-dialog";
import { HelpCenter } from "@/components/dialogs/help-center";
import { NotificationCenter } from "@/components/dialogs/notification-center";

export default function Home() {
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);

  const [theme, setTheme] = useState<Theme>("dark");
  const [surface, setSurface] = useState<Surface>("overview");
  const [navOpen, setNavOpen] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [compileError, setCompileError] = useState<string[]>([]);
  const [previewArtifact, setPreviewArtifact] = useState<Artifact | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [readNotificationIds, setReadNotificationIds] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const stored = JSON.parse(window.localStorage.getItem("opsweave-read-notifications") ?? "[]");
      return new Set(Array.isArray(stored) ? stored.filter(item => typeof item === "string") : []);
    } catch {
      return new Set();
    }
  });

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

  const health = useQuery({
    queryKey: ["health"],
    queryFn: api.health,
    retry: 3,
    retryDelay: (attempt) => Math.min(750 * 2 ** attempt, 3_000),
    refetchInterval: 30_000,
  });
  const hasHealthyBackend = health.data?.status === "ok";
  const projects = useQuery({ queryKey: ["projects"], queryFn: api.projects, enabled: hasHealthyBackend, retry: 2 });
  const hasProjectResponse = projects.data !== undefined;
  const workspaceInfo = useQuery({ queryKey: ["workspace-info"], queryFn: api.workspaceInfo, enabled: hasProjectResponse });
  const auditEvents = useQuery({ queryKey: ["audit-events"], queryFn: api.auditEvents, enabled: hasProjectResponse, refetchInterval: 20_000 });

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
  const executions = useQuery({
    queryKey: ["executions", activeProjectId],
    queryFn: () => api.executions(activeProjectId!),
    enabled: Boolean(activeProjectId),
    refetchInterval: 4_000,
  });
  const approvals = useQuery({
    queryKey: ["approvals", activeProjectId],
    queryFn: () => api.approvals(activeProjectId!),
    enabled: Boolean(activeProjectId),
    refetchInterval: 4_000,
  });
  const evaluations = useQuery({
    queryKey: ["evaluations", activeProjectId],
    queryFn: () => api.evaluations(activeProjectId!),
    enabled: Boolean(activeProjectId),
    refetchInterval: 15_000,
  });

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
    onSuccess: async () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["executions", activeProjectId] }),
        queryClient.invalidateQueries({ queryKey: ["approvals", activeProjectId] }),
      ]),
  });
  const decideApproval = useMutation({
    mutationFn: api.decideApproval,
    onSuccess: async () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["executions", activeProjectId] }),
        queryClient.invalidateQueries({ queryKey: ["approvals", activeProjectId] }),
        queryClient.invalidateQueries({ queryKey: ["audit-events"] }),
      ]),
  });
  const runEvaluation = useMutation({
    mutationFn: api.runEvaluation,
    onSuccess: async () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["evaluations", activeProjectId] }),
        queryClient.invalidateQueries({ queryKey: ["audit-events"] }),
      ]),
  });

  const onFiles = (files: FileList | null) => {
    if (!activeProjectId || !files?.length) return;
    Array.from(files).forEach((file) => upload.mutate({ projectId: activeProjectId, file }));
  };

  const backendOnline = hasHealthyBackend;
  const awsConnected = health.data?.aws_configured === true;
  const cloudStatus = new Map(
    (workspace.data?.artifacts ?? []).map((artifact) => [artifact.artifact_id, artifact.status]),
  );
  const heading = surfaceCopy[surface];
  // A background refetch can fail while TanStack Query still holds valid data.
  // Keep rendering that last known-good workspace and reserve the blocking error
  // state for an initial load that never produced usable data.
  const isBootstrapping =
    (health.isPending && health.data === undefined) ||
    (hasHealthyBackend && projects.isPending && projects.data === undefined);
  const bootstrapFailed =
    (health.isError && health.data === undefined) ||
    (projects.isError && projects.data === undefined);
  const bootstrapError = (projects.error ?? health.error) as (Error & { status?: number }) | null;
  const isGuest = workspaceInfo.data?.role === "demo guest";

  const requestPrivateWorkspace = () => setShowAuth(true);
  const requestCreate = () => (isGuest ? requestPrivateWorkspace() : setShowCreate(true));
  const requestUpload = () => (isGuest ? requestPrivateWorkspace() : fileInput.current?.click());

  const goTo = (next: Surface) => {
    setSurface(next);
    setNavOpen(false);
  };

  const persistReadNotifications = (ids: Set<string>) => {
    setReadNotificationIds(ids);
    window.localStorage.setItem("opsweave-read-notifications", JSON.stringify([...ids]));
  };
  const notificationIds = [
    ...(approvals.data ?? []).filter(item => item.status === "pending").map(item => `approval-${item.approval_id}`),
    ...(auditEvents.data ?? []).slice(0, 30).map(item => `event-${item.id}`),
  ];
  const unreadNotifications = notificationIds.filter(id => !readNotificationIds.has(id)).length;

  if (isBootstrapping) return <PortalPreloader />;

  return (
    <main className="relative flex min-h-dvh">
      <AmbientBackdrop />

      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        accept=".pdf,.png,.jpg,.jpeg,.wav,.mp3,.m4a,.mp4,.mov,.csv,.xlsx,.docx,.txt,.json,.yaml,.yml"
        onChange={(event) => onFiles(event.target.files)}
      />

      <SideNav
        surface={surface}
        counts={{
          projects: projects.data?.length ?? 0,
          sources: artifacts.data?.length ?? 0,
          evidence: workspace.data?.evidence.length ?? 0,
          conflicts: workspace.data?.conflicts.filter((item) => item.status === "open").length ?? 0,
        }}
        workspaceName={workspaceInfo.data?.tenant_name ?? "My workspace"}
        isGuest={isGuest}
        onSelect={goTo}
        onSignIn={requestPrivateWorkspace}
        open={navOpen}
        onClose={() => setNavOpen(false)}
      />

      <section className="relative z-1 min-w-0 flex-1">
        <AppHeader
          theme={theme}
          isGuest={isGuest}
          onToggleTheme={toggleTheme}
          onCreate={requestCreate}
          onSignIn={requestPrivateWorkspace}
          onOpenNav={() => setNavOpen(true)}
          onOpenHelp={() => setShowHelp(true)}
          onOpenNotifications={() => setShowNotifications(true)}
          unreadNotifications={unreadNotifications}
        />

        <div className="mx-auto max-w-[1460px] px-4 pt-9 pb-16 sm:px-7">
          <PageHeading
            eyebrow={heading.eyebrow}
            title={heading.title}
            description={heading.description}
            projectName={selectedProject?.name}
          />

          {bootstrapFailed ? (
            <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-danger-border bg-danger-bg px-4 py-3.5 text-xs text-content-2">
              <CircleAlert size={18} className="shrink-0 text-danger-fg" />
              <span className="min-w-50 flex-1">
                <strong className="text-content">OpsWeave could not finish loading.</strong>{" "}
                {bootstrapError?.message ?? "The live workspace did not respond after several attempts."}
                {bootstrapError?.status ? ` (HTTP ${bootstrapError.status})` : ""} No placeholder data is being shown.
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  if (bootstrapError?.status === 401) {
                    window.location.assign("/auth/login");
                    return;
                  }
                  void health.refetch().then((result) => {
                    if (result.isSuccess) void projects.refetch();
                  });
                }}
              >
                {bootstrapError?.status === 401 ? "Sign in again" : "Try again"}
              </Button>
            </div>
          ) : null}

          {isGuest ? (
            <div className="sheen mb-5 grid grid-cols-1 items-center gap-3 rounded-2xl border border-accent-border bg-brand-soft px-4 py-3 text-xs sm:grid-cols-[auto_1fr_auto]">
              <span className="relative z-1 flex w-max items-center gap-2 rounded-lg bg-surface px-2 py-1.5 font-mono text-2xs font-bold tracking-[0.08em] text-accent-fg">
                <i className="size-1.5 animate-[pulse-dot_1.8s_ease-in-out_infinite] rounded-full bg-current" />
                LIVE DEMO
              </span>
              <span className="relative z-1 text-muted">
                <strong className="text-content">You&rsquo;re exploring a shared, rate-limited workspace.</strong>{" "}
                Inspect sources, evidence, workflows and executions. Sign in before creating projects
                or uploading private files.
              </span>
              <button
                onClick={requestPrivateWorkspace}
                className="relative z-1 flex items-center gap-1.5 text-2xs font-bold text-brand-coral"
              >
                Create my workspace <ArrowRight size={14} />
              </button>
            </div>
          ) : null}

          {backendOnline && projects.data?.length === 0 ? (
            <EmptyState
              icon={<WandSparkles size={26} />}
              eyebrow="YOUR FIRST LIVE WORKFLOW"
              title="Create a workspace project"
              detail="Start with a real operating procedure, policy, image, spreadsheet or interview recording. OpsWeave preserves its provenance from upload onward."
              action={
                <Button variant="primary" size="lg" icon={<Plus size={17} />} onClick={requestCreate}>
                  Create project
                </Button>
              }
            />
          ) : null}

          <AnimatePresence mode="wait">
            <motion.div key={surface} variants={surfaceTransition} initial="hidden" animate="show" exit="exit">
              {selectedProject && surface === "overview" ? (
                <OverviewSurface
                  project={selectedProject}
                  artifacts={artifacts.data ?? []}
                  artifactsLoading={artifacts.isLoading}
                  cloudStatus={cloudStatus}
                  latestCompilation={workspace.data?.compilations[0]}
                  backendOnline={backendOnline}
                  awsConnected={awsConnected}
                  uploading={upload.isPending}
                  uploadError={upload.error?.message}
                  compilePending={compile.isPending}
                  compileQueuedId={compile.isSuccess ? compile.data.id : undefined}
                  compileBlockers={compileError}
                  onUpload={requestUpload}
                  onDropFiles={(files) => (isGuest ? requestPrivateWorkspace() : onFiles(files))}
                  onCompile={() => compile.mutate(selectedProject.id)}
                  onPreview={setPreviewArtifact}
                  onDismissBlockers={() => setCompileError([])}
                  onOpenCompilation={() =>
                    goTo(workspace.data?.compilations[0]?.status === "succeeded" ? "workflow" : "evidence")
                  }
                />
              ) : null}

              {surface === "projects" ? (
                <ProjectsSurface
                  projects={projects.data ?? []}
                  selectedProjectId={activeProjectId}
                  onSelect={(projectId) => {
                    setSelectedProjectId(projectId);
                    goTo("overview");
                  }}
                  onCreate={requestCreate}
                />
              ) : null}

              {selectedProject && surface === "sources" ? (
                <SourcesSurface
                  artifacts={artifacts.data ?? []}
                  cloudArtifacts={workspace.data?.artifacts ?? []}
                  pending={upload.isPending}
                  onUpload={requestUpload}
                  onPreview={setPreviewArtifact}
                />
              ) : null}

              {selectedProject && surface === "evidence" ? (
                <EvidenceExplorer workspace={workspace.data} loading={workspace.isLoading} />
              ) : null}

              {selectedProject && surface === "conflicts" ? (
                <ConflictRoom
                  workspace={workspace.data}
                  pending={resolveConflict.isPending}
                  onResolve={(conflictId, resolution) =>
                    resolveConflict.mutate({ projectId: selectedProject.id, conflictId, resolution })
                  }
                />
              ) : null}

              {selectedProject && surface === "workflow" ? (
                <WorkflowStudio
                  workspace={workspace.data}
                  publishPending={publishWorkflow.isPending}
                  publishError={publishWorkflow.error?.message}
                  onPublish={(workflowId) =>
                    publishWorkflow.mutate({ projectId: selectedProject.id, workflowId })
                  }
                />
              ) : null}

              {selectedProject && surface === "operations" ? (
                <OperationsSurface
                  projectId={selectedProject.id}
                  workflow={workspace.data?.workflow}
                  approvals={approvals.data ?? []}
                  executions={executions.data ?? []}
                  pending={decideApproval.isPending || createExecution.isPending}
                  onRun={() =>
                    workspace.data?.workflow &&
                    createExecution.mutate({
                      projectId: selectedProject.id,
                      workflowId: workspace.data.workflow.workflow_id,
                    })
                  }
                  onDecision={(approvalId, decision) =>
                    decideApproval.mutate({ projectId: selectedProject.id, approvalId, decision })
                  }
                />
              ) : null}

              {selectedProject && surface === "evaluations" ? (
                <EvaluationSurface
                  workflow={workspace.data?.workflow}
                  evaluations={evaluations.data ?? []}
                  pending={runEvaluation.isPending}
                  error={runEvaluation.error?.message}
                  onRun={() =>
                    workspace.data?.workflow &&
                    runEvaluation.mutate({
                      projectId: selectedProject.id,
                      workflowId: workspace.data.workflow.workflow_id,
                    })
                  }
                />
              ) : null}

              {surface === "activity" ? (
                <ActivitySurface
                  events={auditEvents.data ?? []}
                  workspace={workspace.data}
                  loading={auditEvents.isLoading}
                />
              ) : null}

              {surface === "members" ? (
                <MembersSurface
                  info={workspaceInfo.data}
                  loading={workspaceInfo.isLoading}
                  onSignIn={requestPrivateWorkspace}
                />
              ) : null}

              {surface === "settings" ? (
                <SettingsSurface
                  info={workspaceInfo.data}
                  healthOnline={backendOnline}
                  awsConnected={awsConnected}
                />
              ) : null}
            </motion.div>
          </AnimatePresence>
        </div>
      </section>

      <AnimatePresence>
        {showCreate ? (
          <CreateProjectDialog
            name={projectName}
            description={projectDescription}
            pending={createProject.isPending}
            error={createProject.error?.message}
            onName={setProjectName}
            onDescription={setProjectDescription}
            onClose={() => setShowCreate(false)}
            onSubmit={() => createProject.mutate({ name: projectName, description: projectDescription })}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>{showAuth ? <AuthDialog onClose={() => setShowAuth(false)} /> : null}</AnimatePresence>

      <AnimatePresence>
        {showHelp ? <HelpCenter onClose={() => setShowHelp(false)} onNavigate={goTo} /> : null}
      </AnimatePresence>

      <AnimatePresence>
        {showNotifications ? (
          <NotificationCenter
            auditEvents={auditEvents.data ?? []}
            approvals={approvals.data ?? []}
            readIds={readNotificationIds}
            onRead={(id) => persistReadNotifications(new Set([...readNotificationIds, id]))}
            onReadAll={(ids) => persistReadNotifications(new Set([...readNotificationIds, ...ids]))}
            onClose={() => setShowNotifications(false)}
            onNavigate={goTo}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {previewArtifact ? (
          <ArtifactPreview artifact={previewArtifact} onClose={() => setPreviewArtifact(null)} />
        ) : null}
      </AnimatePresence>
    </main>
  );
}
