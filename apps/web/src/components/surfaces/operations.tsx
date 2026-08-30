"use client";

import { useQuery } from "@tanstack/react-query";
import { Activity, Check, Inbox, Play, WandSparkles, X } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { api, type Approval, type Execution, type ProjectWorkspace } from "@/lib/api";
import { listItem, staggerContainer } from "@/lib/motion";
import {
  Badge,
  Button,
  Card,
  CardBar,
  CardHeader,
  EmptyState,
  SectionIcon,
  Spinner,
  StatTile,
  StatusBadge,
  statusTone,
} from "@/components/ui";

export function OperationsSurface({
  projectId,
  workflow,
  approvals,
  executions,
  pending,
  onRun,
  onDecision,
}: {
  projectId: string;
  workflow?: ProjectWorkspace["workflow"];
  approvals: Approval[];
  executions: Execution[];
  pending: boolean;
  onRun: () => void;
  onDecision: (approvalId: string, decision: "approve" | "reject") => void;
}) {
  const [selectedExecutionId, setSelectedExecutionId] = useState<string | null>(null);
  const activeExecutionId = selectedExecutionId ?? executions[0]?.execution_id ?? null;

  const detail = useQuery({
    queryKey: ["execution-detail", projectId, activeExecutionId],
    queryFn: () => api.execution(projectId, activeExecutionId!),
    enabled: Boolean(activeExecutionId),
    refetchInterval: (query) => {
      const current = query.state.data;
      return current && ["starting", "running", "waiting_for_approval"].includes(current.status) ? 5_000 : false;
    },
  });

  if (!workflow || workflow.status !== "published") {
    return (
      <EmptyState
        icon={<Inbox size={26} />}
        title="Publish a workflow to activate operations"
        detail="The operations inbox becomes active only after a validated workflow version passes publication gates."
      />
    );
  }

  const pendingApprovals = approvals.filter((approval) => approval.status === "pending");

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <Card inset>
        <CardBar
          title={`${pendingApprovals.length} claims awaiting review`}
          subtitle="Callback-token executions paused inside AWS Step Functions"
          action={
            <Button
              variant="primary"
              size="sm"
              loading={pending}
              icon={<Play size={14} />}
              onClick={onRun}
            >
              Run live sample claim
            </Button>
          }
        />

        {pendingApprovals.length ? (
          <motion.div
            variants={staggerContainer()}
            initial="hidden"
            animate="show"
            className="flex flex-col gap-3 p-4"
          >
            {pendingApprovals.map((approval) => (
              <motion.article
                key={approval.approval_id}
                variants={listItem}
                className="rounded-2xl border border-line bg-surface-2 p-5"
              >
                <header className="flex items-center justify-between gap-3">
                  <span className="font-mono text-sm font-[650] text-accent-fg">
                    {approval.claim.claim_id}
                  </span>
                  <Badge tone="success" mono>
                    {Math.round(Number(approval.recommendation.confidence) * 100)}% confidence
                  </Badge>
                </header>

                <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                  <StatTile
                    label="Claim amount"
                    value={`$${Number(approval.claim.claimed_amount_usd).toFixed(2)}`}
                  />
                  <StatTile label="Order" value={approval.claim.order_id} />
                  <StatTile label="Shipment" value={approval.claim.shipment_id} />
                </div>

                <p className="my-3.5 text-2xs leading-relaxed text-muted">
                  {approval.claim.damage_description}
                </p>

                <div className="flex items-center gap-2.5 rounded-xl border border-accent-border bg-accent-bg p-3">
                  <WandSparkles size={16} className="shrink-0 text-accent-fg" />
                  <span className="min-w-0">
                    <small className="block font-mono text-2xs font-[650] tracking-[0.07em] text-accent-fg uppercase">
                      Agent recommendation
                    </small>
                    <strong className="mt-1 block text-2xs capitalize text-content-2">
                      Human review · {approval.recommendation.reason.replaceAll("_", " ")}
                    </strong>
                  </span>
                </div>

                <footer className="mt-4 flex justify-end gap-2">
                  <Button
                    variant="danger"
                    size="sm"
                    disabled={pending}
                    icon={<X size={14} />}
                    onClick={() => onDecision(approval.approval_id, "reject")}
                  >
                    Reject
                  </Button>
                  <Button
                    variant="success"
                    size="sm"
                    disabled={pending}
                    icon={<Check size={14} />}
                    onClick={() => onDecision(approval.approval_id, "approve")}
                  >
                    Approve refund
                  </Button>
                </footer>
              </motion.article>
            ))}
          </motion.div>
        ) : (
          <div className="flex min-h-40 flex-col items-center justify-center gap-1.5 p-8 text-center">
            <SectionIcon tone="success" size="lg">
              <Check size={20} />
            </SectionIcon>
            <strong className="mt-2 text-xs text-content">Review queue is clear</strong>
            <small className="text-2xs text-muted">
              Run a live sample claim to exercise the callback approval path.
            </small>
          </div>
        )}
      </Card>

      <Card className="p-4.5">
        <CardHeader
          icon={
            <SectionIcon tone="accent">
              <Activity size={17} />
            </SectionIcon>
          }
          title="Live executions"
          subtitle="Latest Step Functions state"
        />

        <div className="mt-3">
          {executions.map((execution) => {
            const active = activeExecutionId === execution.execution_id;
            return (
              <button
                key={execution.execution_id}
                onClick={() => setSelectedExecutionId(execution.execution_id)}
                className={cn(
                  "grid w-full grid-cols-[14px_1fr_auto] items-center gap-2.5 border-t border-line px-1.5 py-2.5 text-left transition-colors",
                  active && "rounded-lg border-transparent bg-surface-2",
                )}
              >
                <i
                  className={cn(
                    "size-2 rounded-full",
                    statusTone(execution.status) === "success" && "bg-success",
                    statusTone(execution.status) === "danger" && "bg-danger",
                    statusTone(execution.status) === "warning" && "bg-warning",
                    statusTone(execution.status) === "neutral" && "bg-muted",
                  )}
                />
                <span className="min-w-0">
                  <strong className="block truncate text-2xs font-semibold text-content">
                    {execution.claim.claim_id}
                  </strong>
                  <small className="mt-0.5 block truncate text-2xs capitalize text-muted">
                    {execution.current_node?.replaceAll("_", " ")} · v{execution.workflow_version}
                  </small>
                </span>
                <em className="font-mono text-2xs capitalize not-italic text-muted">
                  {execution.status.replaceAll("_", " ")}
                </em>
              </button>
            );
          })}
          {!executions.length ? (
            <p className="py-6 text-center text-2xs text-muted">No workflow executions yet.</p>
          ) : null}
        </div>
      </Card>

      {activeExecutionId ? (
        <Card inset className="xl:col-span-2">
          <CardBar
            title="Execution trace"
            subtitle={`${detail.data?.claim.claim_id ?? activeExecutionId} · authoritative AWS history`}
            action={
              detail.isLoading ? (
                <Spinner size={15} />
              ) : detail.data ? (
                <StatusBadge status={detail.data.status} />
              ) : null
            }
          />
          <div className="grid gap-x-7 px-5 py-3.5 lg:grid-cols-2">
            {detail.data?.trace.map((event) => (
              <article
                key={event.id}
                className="grid min-h-14 grid-cols-[12px_1fr_auto] items-center gap-2.5 border-b border-line"
              >
                <span
                  className={cn(
                    "size-2 rounded-full border-2",
                    event.type.includes("Succeeded")
                      ? "border-success bg-success"
                      : event.type.includes("Failed")
                        ? "border-danger bg-danger"
                        : "border-[var(--brand-violet)] bg-surface",
                  )}
                />
                <span className="min-w-0">
                  <strong className="block truncate text-2xs capitalize text-content">
                    {event.state_name ?? event.type.replaceAll(/([a-z])([A-Z])/g, "$1 $2")}
                  </strong>
                  <small className="mt-0.5 block truncate text-2xs text-muted">
                    {event.resource ?? event.type}
                  </small>
                </span>
                <time className="font-mono text-2xs text-faint">
                  {new Date(event.timestamp).toLocaleTimeString()}
                </time>
              </article>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
