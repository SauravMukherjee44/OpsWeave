"use client";

import {
  ArrowRight,
  Check,
  CircleAlert,
  Eye,
  FolderKanban,
  Sparkles,
  UploadCloud,
  WandSparkles,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/cn";
import { formatBytes } from "@/lib/surfaces";
import { listItem, staggerContainer } from "@/lib/motion";
import type { Artifact, CloudCompilation, Project } from "@/lib/api";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  CountChip,
  InlineLoading,
  SectionIcon,
  SplitLayout,
  StatusBadge,
} from "@/components/ui";
import { SourceIcon } from "@/components/shared/source-glyph";

export function OverviewSurface({
  project,
  artifacts,
  artifactsLoading,
  cloudStatus,
  latestCompilation,
  backendOnline,
  awsConnected,
  uploading,
  uploadError,
  compilePending,
  compileQueuedId,
  compileBlockers,
  onUpload,
  onDropFiles,
  onCompile,
  onPreview,
  onDismissBlockers,
  onOpenCompilation,
}: {
  project: Project;
  artifacts: Artifact[];
  artifactsLoading: boolean;
  cloudStatus: Map<string, string>;
  latestCompilation?: CloudCompilation;
  backendOnline: boolean;
  awsConnected: boolean;
  uploading: boolean;
  uploadError?: string;
  compilePending: boolean;
  compileQueuedId?: string;
  compileBlockers: string[];
  onUpload: () => void;
  onDropFiles: (files: FileList) => void;
  onCompile: () => void;
  onPreview: (artifact: Artifact) => void;
  onDismissBlockers: () => void;
  onOpenCompilation: () => void;
}) {
  const hasSources = artifacts.length > 0;

  return (
    <SplitLayout
      main={
        <Card className="min-h-[560px] p-5">
          <CardHeader
            icon={
              <SectionIcon tone="brand">
                <UploadCloud size={18} />
              </SectionIcon>
            }
            title="Source workbench"
            subtitle="Real files stored with checksum and tenant ownership"
            action={<CountChip>{artifacts.length} sources</CountChip>}
          />

          <button
            onClick={onUpload}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              onDropFiles(event.dataTransfer.files);
            }}
            className={cn(
              "mt-4 grid w-full grid-cols-[44px_1fr] items-center gap-3.5 rounded-2xl p-4 text-left sm:grid-cols-[44px_1fr_auto]",
              "border border-dashed border-line-accent bg-accent-bg/40",
              "transition-[border-color,background,transform] duration-150",
              "hover:-translate-y-px hover:border-[var(--brand-violet)] hover:bg-accent-bg",
            )}
          >
            <span className="bg-brand-gradient shadow-brand grid size-11 place-items-center rounded-xl text-white">
              <UploadCloud size={22} />
            </span>
            <span className="min-w-0">
              <strong className="block text-xs font-[650] text-content">
                {uploading ? "Uploading securely…" : "Drop source files here"}
              </strong>
              <small className="mt-1 block text-2xs text-muted">
                PDF, image, audio, spreadsheet, document or OpenAPI file · 25 MB max
              </small>
            </span>
            <em className="hidden rounded-lg border border-line bg-surface px-3 py-2 text-2xs font-semibold not-italic text-accent-fg sm:block">
              Browse files
            </em>
          </button>

          {uploadError ? <InlineError message={uploadError} /> : null}

          <div className="mt-5 hidden grid-cols-[1fr_110px_90px_90px_32px] gap-3 border-b border-line px-2 pb-2.5 font-mono text-2xs font-[650] tracking-[0.06em] text-faint uppercase lg:grid">
            <span>Source</span>
            <span>Status</span>
            <span>Size</span>
            <span>Added</span>
            <span />
          </div>

          <div>
            {artifactsLoading ? <InlineLoading label="Loading sources" /> : null}

            <motion.div variants={staggerContainer()} initial="hidden" animate="show">
              {artifacts.map((artifact) => {
                const status = cloudStatus.get(artifact.id) ?? artifact.status;
                return (
                  <motion.div
                    key={artifact.id}
                    variants={listItem}
                    className="grid grid-cols-[38px_1fr_32px] items-center gap-3 border-b border-line px-2 py-2.5 transition-colors hover:bg-surface-2 lg:grid-cols-[38px_1fr_110px_90px_90px_32px]"
                  >
                    <SourceIcon mediaType={artifact.media_type} />
                    <span className="min-w-0">
                      <strong className="block truncate text-xs font-semibold text-content">
                        {artifact.filename}
                      </strong>
                      <small className="mt-0.5 block truncate text-2xs text-muted">
                        {artifact.media_type}
                      </small>
                    </span>
                    <span className="hidden lg:block">
                      <StatusBadge status={status} />
                    </span>
                    <span className="hidden font-mono text-2xs text-muted lg:block">
                      {formatBytes(artifact.size_bytes)}
                    </span>
                    <span className="hidden font-mono text-2xs text-muted lg:block">
                      {new Date(artifact.created_at).toLocaleDateString()}
                    </span>
                    <button
                      onClick={() => onPreview(artifact)}
                      aria-label={`Preview ${artifact.filename}`}
                      className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-3 hover:text-content"
                    >
                      <Eye size={15} />
                    </button>
                  </motion.div>
                );
              })}
            </motion.div>

            {!artifactsLoading && !hasSources ? (
              <div className="flex min-h-32 flex-col items-center justify-center gap-1 text-center">
                <strong className="text-xs text-content-2">No sources yet</strong>
                <small className="text-2xs text-muted">
                  Files you upload will appear here with their real processing state.
                </small>
              </div>
            ) : null}
          </div>
        </Card>
      }
      rail={
        <>
          <Card className="p-4.5">
            <CardHeader
              icon={
                <SectionIcon tone="accent">
                  <Sparkles size={17} />
                </SectionIcon>
              }
              title="Launch readiness"
              subtitle="Live configuration checks"
            />
            <div className="mt-4 flex flex-col gap-3.5 px-1 pb-4">
              <ReadinessItem done={backendOnline} title="Platform API" detail={backendOnline ? "Connected" : "Unavailable"} />
              <ReadinessItem done title="Project context" detail={project.name} />
              <ReadinessItem
                done={hasSources}
                title="Source evidence"
                detail={hasSources ? `${artifacts.length} uploaded` : "Required"}
              />
              <ReadinessItem
                done={awsConnected}
                title="AWS intelligence"
                detail={awsConnected ? "Bedrock + S3 configured" : "Configuration required"}
              />
            </div>
            <Button
              variant="primary"
              size="lg"
              block
              disabled={!hasSources}
              loading={compilePending}
              icon={<WandSparkles size={17} />}
              trailing={<ArrowRight size={16} />}
              onClick={onCompile}
            >
              Compile workflow
            </Button>
            <p className="mt-3 mb-0 flex items-start gap-2 text-2xs text-faint">
              <Check size={13} className="mt-px shrink-0 text-success-fg" />
              This calls the configured AWS pipeline. It never fabricates a workflow.
            </p>
          </Card>

          <AnimatePresence>
            {compileQueuedId ? (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <Card className="border-success-border bg-success-bg p-4">
                  <div className="flex items-center gap-2 text-success-fg">
                    <Check size={17} />
                    <strong className="text-xs">Compilation queued</strong>
                  </div>
                  <p className="mt-2 mb-0 text-2xs text-muted">
                    Job <code className="rounded border border-line bg-surface-2 px-1 py-0.5 font-mono text-content">
                      {compileQueuedId.slice(0, 8)}
                    </code>{" "}
                    is waiting for the AWS worker.
                  </p>
                </Card>
              </motion.div>
            ) : null}
          </AnimatePresence>

          {latestCompilation ? (
            <CompilationProgress compilation={latestCompilation} onOpen={onOpenCompilation} />
          ) : null}

          <AnimatePresence>
            {compileBlockers.length > 0 ? (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <Card className="border-danger-border bg-danger-bg p-4">
                  <div className="flex items-center gap-2 text-danger-fg">
                    <CircleAlert size={17} />
                    <strong className="text-xs">Compilation blocked</strong>
                    <button
                      onClick={onDismissBlockers}
                      aria-label="Dismiss"
                      className="ml-auto grid size-6 place-items-center rounded-md hover:bg-surface-3"
                    >
                      <X size={14} />
                    </button>
                  </div>
                  <ul className="mt-2.5 mb-0 list-disc pl-5 text-2xs text-muted">
                    {compileBlockers.map((blocker) => (
                      <li key={blocker} className="leading-relaxed">{blocker}</li>
                    ))}
                  </ul>
                </Card>
              </motion.div>
            ) : null}
          </AnimatePresence>

          <Card className="p-4.5">
            <div className="flex items-start gap-3">
              <SectionIcon tone="accent">
                <FolderKanban size={18} />
              </SectionIcon>
              <div className="min-w-0">
                <span className="font-mono text-2xs font-[650] tracking-[0.1em] text-accent-fg uppercase">
                  Active project
                </span>
                <strong className="mt-1 block truncate text-sm font-[650] text-content">{project.name}</strong>
                <p className="mt-1.5 mb-0 text-2xs text-muted">
                  {project.description || "No description provided."}
                </p>
              </div>
            </div>
            <div className="mt-3.5 flex items-center justify-between border-t border-line pt-3 text-2xs text-muted">
              <Badge tone="success" dot className="capitalize">{project.status}</Badge>
              <span>Updated {new Date(project.updated_at).toLocaleDateString()}</span>
            </div>
          </Card>
        </>
      }
    />
  );
}

function ReadinessItem({ done, title, detail }: { done: boolean; title: string; detail: string }) {
  return (
    <div className="relative grid grid-cols-[30px_1fr] items-center gap-2.5">
      <span
        className={cn(
          "grid size-7.5 place-items-center rounded-[10px] border",
          done
            ? "border-success-border bg-success-bg text-success-fg"
            : "border-line bg-surface-2 text-faint",
        )}
      >
        {done ? <Check size={14} /> : <span className="size-1.5 rounded-full bg-current" />}
      </span>
      <span className="min-w-0">
        <strong className="block text-2xs font-semibold text-content">{title}</strong>
        <small className="mt-0.5 block truncate text-2xs text-muted">{detail}</small>
      </span>
    </div>
  );
}

function CompilationProgress({
  compilation,
  onOpen,
}: {
  compilation: CloudCompilation;
  onOpen: () => void;
}) {
  const fallback: Record<string, number> = {
    pending: 3,
    queued: 8,
    ingesting: 30,
    compiling: 72,
    succeeded: 100,
    failed: 100,
  };
  const progress = compilation.progress ?? fallback[compilation.status] ?? 0;
  const done = compilation.status === "succeeded";
  const failed = compilation.status === "failed";

  return (
    <Card className="p-4">
      <div className="grid grid-cols-[40px_1fr_auto] items-center gap-2.5">
        <SectionIcon tone={failed ? "danger" : done ? "success" : "accent"}>
          {done ? <Check size={17} /> : failed ? <CircleAlert size={17} /> : <Sparkles size={17} />}
        </SectionIcon>
        <span className="min-w-0">
          <small className="block font-mono text-2xs font-[650] tracking-[0.09em] text-accent-fg uppercase">
            Live compilation
          </small>
          <strong className="mt-1 block truncate text-xs capitalize text-content">
            {compilation.status.replaceAll("_", " ")}
          </strong>
        </span>
        <em className="font-mono text-xs font-[650] not-italic text-content-2">{progress}%</em>
      </div>

      <div className="mt-3.5 h-1.5 overflow-hidden rounded-full bg-surface-3">
        <motion.span
          className="bg-brand-gradient block h-full rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>

      {compilation.summary ? (
        <p className="mt-2.5 mb-0 text-2xs text-muted">{compilation.summary}</p>
      ) : null}
      {compilation.error_message ? (
        <p className="mt-2.5 mb-0 text-2xs text-danger-fg">{compilation.error_message}</p>
      ) : null}

      <Button variant="secondary" size="sm" block className="mt-3" onClick={onOpen} trailing={<ArrowRight size={13} />}>
        {done ? "Open compiled workflow" : "Inspect live evidence"}
      </Button>
    </Card>
  );
}

export function InlineError({ message }: { message: string }) {
  return (
    <div className="mt-2.5 flex items-center gap-2 rounded-lg border border-danger-border bg-danger-bg px-3 py-2.5 text-2xs text-danger-fg">
      <CircleAlert size={14} className="shrink-0" />
      {message}
    </div>
  );
}
