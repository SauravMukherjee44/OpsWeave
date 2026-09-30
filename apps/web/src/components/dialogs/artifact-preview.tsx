"use client";

import { useQuery } from "@tanstack/react-query";
import { Eye, ShieldCheck, X } from "lucide-react";
import { motion } from "motion/react";
import { api, type Artifact } from "@/lib/api";
import { formatBytes } from "@/lib/surfaces";
import { fadeIn, scaleIn } from "@/lib/motion";
import { IconButton } from "@/components/ui";
import { SourceIcon } from "@/components/shared/source-glyph";

/**
 * Preview URLs are short-lived and tenant-authorized, so they cannot be routed
 * through the Next image optimizer — native elements are required here.
 */
function PreviewMedia({ artifact, url }: { artifact: Artifact; url: string }) {
  if (artifact.media_type.startsWith("image/")) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={`Preview of ${artifact.filename}`} />;
  }
  if (artifact.media_type.startsWith("audio/")) return <audio src={url} controls />;
  if (artifact.media_type.startsWith("video/")) return <video src={url} controls />;
  return <iframe src={url} title={`Preview of ${artifact.filename}`} />;
}

export function ArtifactPreview({
  artifact,
  onClose,
}: {
  artifact: Artifact;
  onClose: () => void;
}) {
  const preview = useQuery({
    queryKey: ["artifact-preview", artifact.id],
    queryFn: () => api.artifactPreview(artifact.id),
    staleTime: 4 * 60 * 1000,
  });
  const url = preview.data?.url;

  return (
    <motion.div
      variants={fadeIn}
      initial="hidden"
      animate="show"
      exit="exit"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="fixed inset-0 z-100 grid place-items-center bg-[var(--overlay)] p-4 backdrop-blur-md"
    >
      <motion.section
        variants={scaleIn}
        initial="hidden"
        animate="show"
        exit="exit"
        role="dialog"
        aria-modal="true"
        className="grid h-[min(820px,92vh)] w-[min(1180px,100%)] grid-rows-[70px_1fr_46px] overflow-hidden rounded-3xl border border-line bg-surface shadow-e3"
      >
        <header className="grid grid-cols-[40px_1fr_auto] items-center gap-3 border-b border-line px-4 sm:grid-cols-[40px_1fr_auto_auto]">
          <SourceIcon mediaType={artifact.media_type} />
          <span className="min-w-0">
            <strong className="block truncate text-xs font-semibold text-content">
              {artifact.filename}
            </strong>
            <small className="mt-0.5 block truncate text-2xs text-muted">
              {artifact.media_type} · {formatBytes(artifact.size_bytes)} · uploaded{" "}
              {new Date(artifact.created_at).toLocaleString()}
            </small>
          </span>
          <a
            href={url ?? api.artifactPreviewUrl(artifact.id)}
            target="_blank"
            rel="noreferrer"
            className="hidden h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-2xs text-accent-fg no-underline hover:border-line-strong sm:flex"
          >
            <Eye size={14} />
            Open original
          </a>
          <IconButton label="Close preview" size={34} onClick={onClose}>
            <X size={17} />
          </IconButton>
        </header>

        <div className="preview-stage">
          {preview.isPending ? (
            <div className="grid h-full place-items-center text-xs text-muted">Preparing secure preview…</div>
          ) : preview.isError || !url ? (
            <div className="grid h-full place-items-center px-6 text-center text-xs text-danger-fg">
              {preview.error?.message ?? "Preview is unavailable."}
            </div>
          ) : preview.data.content !== undefined ? (
            <div className="h-full overflow-auto bg-white p-5 text-left text-slate-900">
              <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-6">{preview.data.content}</pre>
              {preview.data.truncated ? <p className="mt-4 text-xs text-amber-700">Preview truncated at 512 KB. Open the original to inspect the complete file.</p> : null}
            </div>
          ) : (
            <PreviewMedia artifact={artifact} url={url} />
          )}
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-line px-4 text-2xs text-muted">
          <span className="flex items-center gap-1.5">
            <ShieldCheck size={13} className="text-success-fg" />
            Tenant-authorized preview · link expires automatically
          </span>
          <code className="hidden truncate font-mono text-2xs text-faint sm:block">
            SHA-256 {artifact.checksum_sha256.slice(0, 24)}…
          </code>
        </footer>
      </motion.section>
    </motion.div>
  );
}
