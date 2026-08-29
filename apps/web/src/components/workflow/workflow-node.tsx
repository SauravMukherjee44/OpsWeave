"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { memo } from "react";
import { cn } from "@/lib/cn";
import { metaFor } from "./node-types";
import { NODE_WIDTH } from "./layout";

export type WorkflowNodeData = {
  name: string;
  type: string;
  detail?: string;
  selected?: boolean;
};

/**
 * Custom React Flow node. Replaces the default node plus inline label, which
 * had no ports, no type glyph, and no selection affordance.
 */
function WorkflowGraphNodeImpl({ data, selected }: NodeProps) {
  const payload = data as unknown as WorkflowNodeData;
  const meta = metaFor(payload.type);
  const Icon = meta.icon;
  const isSource = payload.type === "trigger";
  const isSink = payload.type === "terminal";

  return (
    <div
      style={{ width: NODE_WIDTH, ["--node" as string]: meta.color }}
      className={cn(
        "group relative overflow-hidden rounded-xl border bg-surface text-left transition-shadow duration-200",
        selected
          ? "border-[var(--node)] shadow-[0_0_0_3px_color-mix(in_srgb,var(--node)_22%,transparent),var(--elevation-3)]"
          : "border-line shadow-e2 hover:shadow-e3",
      )}
    >
      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-0.5"
        style={{ background: "var(--node)" }}
      />
      <span
        aria-hidden="true"
        className="absolute inset-0 opacity-[0.06]"
        style={{ background: `linear-gradient(135deg, var(--node), transparent 62%)` }}
      />

      {!isSource ? (
        <Handle
          type="target"
          position={Position.Left}
          className="!size-2.5 !border-2 !border-[var(--surface)] !bg-[var(--node)]"
        />
      ) : null}

      <div className="relative flex items-center gap-3 px-3.5 py-3">
        <span
          className="grid size-9 shrink-0 place-items-center rounded-lg"
          style={{
            color: "var(--node)",
            background: "color-mix(in srgb, var(--node) 16%, transparent)",
            border: "1px solid color-mix(in srgb, var(--node) 32%, transparent)",
          }}
        >
          <Icon size={17} />
        </span>

        <span className="min-w-0 flex-1">
          <small
            className="block font-mono text-2xs font-[650] tracking-[0.09em] uppercase"
            style={{ color: "var(--node)" }}
          >
            {meta.label}
          </small>
          <strong className="mt-1 block truncate text-xs font-[650] text-content">
            {payload.name}
          </strong>
        </span>
      </div>

      {!isSink ? (
        <Handle
          type="source"
          position={Position.Right}
          className="!size-2.5 !border-2 !border-[var(--surface)] !bg-[var(--node)]"
        />
      ) : null}
    </div>
  );
}

export const WorkflowGraphNode = memo(WorkflowGraphNodeImpl);
