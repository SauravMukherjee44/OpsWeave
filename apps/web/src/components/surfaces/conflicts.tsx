"use client";

import { Check, FileWarning, ShieldCheck, WandSparkles } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "@/lib/cn";
import { listItem, staggerContainer } from "@/lib/motion";
import type { ProjectWorkspace } from "@/lib/api";
import { Badge, Button, Card, EmptyState, type Tone } from "@/components/ui";

const SEVERITY: Record<string, Tone> = {
  high: "danger",
  medium: "warning",
  low: "info",
};

export function ConflictRoom({
  workspace,
  pending,
  onResolve,
}: {
  workspace?: ProjectWorkspace;
  pending: boolean;
  onResolve: (conflictId: string, resolution: string) => void;
}) {
  if (!workspace?.conflicts.length) {
    return (
      <EmptyState
        icon={<FileWarning size={26} />}
        title="No source contradictions detected"
        detail="Conflicts appear here when independently grounded sources disagree on a rule, threshold, actor, or required action."
      />
    );
  }

  return (
    <motion.div
      variants={staggerContainer()}
      initial="hidden"
      animate="show"
      className="grid gap-4 xl:grid-cols-2"
    >
      {workspace.conflicts.map((conflict) => {
        const resolved = conflict.status !== "open";
        return (
          <motion.div key={conflict.conflict_id} variants={listItem}>
            <Card className={cn("h-full p-5", resolved && "border-success-border")}>
              <header className="flex items-center justify-between gap-3">
                <Badge tone={SEVERITY[conflict.severity] ?? "info"} mono className="uppercase">
                  {conflict.severity}
                </Badge>
                <Badge tone={resolved ? "success" : "neutral"} mono className="uppercase">
                  {conflict.status}
                </Badge>
              </header>

              <h2 className="mt-4 mb-2 text-xl font-[650] tracking-[-0.025em] text-content">
                {conflict.title}
              </h2>
              <p className="m-0 text-xs leading-relaxed text-muted">{conflict.description}</p>

              <div className="mt-4 border-t border-line pt-3.5">
                <small className="mb-2 block font-mono text-2xs font-[650] tracking-[0.08em] text-faint uppercase">
                  Contradictory evidence
                </small>
                <div className="flex flex-wrap gap-1.5">
                  {conflict.source_evidence_ids.map((citation) => (
                    <code
                      key={citation}
                      className="rounded border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-2xs text-accent-fg"
                    >
                      #{citation.slice(0, 12)}
                    </code>
                  ))}
                </div>
              </div>

              <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-accent-border bg-accent-bg p-3.5">
                <WandSparkles size={16} className="mt-px shrink-0 text-accent-fg" />
                <span className="min-w-0">
                  <small className="block font-mono text-2xs font-[650] tracking-[0.07em] text-accent-fg uppercase">
                    Recommended interpretation
                  </small>
                  <p className="mt-1.5 mb-0 text-2xs leading-relaxed text-content-2">
                    {conflict.recommended_resolution}
                  </p>
                </span>
              </div>

              {resolved ? (
                <div className="mt-3.5 flex items-center gap-2 rounded-lg bg-success-bg px-3 py-2.5 text-2xs text-success-fg">
                  <ShieldCheck size={15} className="shrink-0" />
                  {conflict.resolution}
                </div>
              ) : (
                <Button
                  variant="primary"
                  block
                  className="mt-3.5"
                  loading={pending}
                  icon={<Check size={15} />}
                  onClick={() => onResolve(conflict.conflict_id, conflict.recommended_resolution)}
                >
                  Accept and record resolution
                </Button>
              )}
            </Card>
          </motion.div>
        );
      })}
    </motion.div>
  );
}
