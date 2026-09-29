"use client";

import { FolderKanban, Plus } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "@/lib/cn";
import { listItem, staggerContainer } from "@/lib/motion";
import type { Project } from "@/lib/api";
import { Badge, SectionIcon, type IconTone } from "@/components/ui";

const TONES: IconTone[] = ["accent", "primary", "success", "warning"];

export function ProjectsSurface({
  projects,
  selectedProjectId,
  onSelect,
  onCreate,
}: {
  projects: Project[];
  selectedProjectId: string | null;
  onSelect: (projectId: string) => void;
  onCreate: () => void;
}) {
  return (
    <motion.div
      variants={staggerContainer()}
      initial="hidden"
      animate="show"
      className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
    >
      <motion.button
        variants={listItem}
        onClick={onCreate}
        className={cn(
          "flex min-h-[236px] flex-col items-center justify-center rounded-2xl p-5 text-center",
          "border border-dashed border-line-accent bg-accent-bg/40",
          "transition-[transform,border-color,background] duration-150",
          "hover:-translate-y-1 hover:border-[var(--brand-violet)] hover:bg-accent-bg",
        )}
      >
        <span className="bg-brand-gradient shadow-brand mb-3.5 grid size-12 place-items-center rounded-2xl text-white">
          <Plus size={22} />
        </span>
        <strong className="text-xs font-[650] text-content">Create another project</strong>
        <small className="mt-1.5 text-2xs text-muted">Start a separate tenant-scoped process</small>
      </motion.button>

      {projects.map((project, index) => {
        const selected = project.id === selectedProjectId;
        return (
          <motion.button
            key={project.id}
            variants={listItem}
            onClick={() => onSelect(project.id)}
            className={cn(
              "bg-surface-gradient card-sheen relative flex min-h-[236px] flex-col rounded-2xl border p-5 text-left",
              "transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-1",
              selected
                ? "border-line-accent ring-3 ring-[color-mix(in_srgb,var(--brand-violet)_14%,transparent)]"
                : "border-line hover:border-line-strong",
            )}
          >
            <div className="flex items-start justify-between">
              <SectionIcon tone={TONES[index % TONES.length]} size="lg">
                <FolderKanban size={20} />
              </SectionIcon>
              <Badge tone="success" dot className="capitalize">{project.status}</Badge>
            </div>

            <strong className="mt-4 block text-lg font-[650] tracking-[-0.02em] text-content">
              {project.name}
            </strong>
            <p className="mt-1.5 mb-0 line-clamp-3 text-2xs text-muted">
              {project.description || "No project description."}
            </p>

            <footer className="mt-auto flex justify-between border-t border-line pt-3 font-mono text-2xs text-faint">
              <span>{project.artifact_count} sources</span>
              <span>Updated {new Date(project.updated_at).toLocaleDateString()}</span>
            </footer>
          </motion.button>
        );
      })}
    </motion.div>
  );
}
