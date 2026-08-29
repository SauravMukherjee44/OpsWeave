"use client";

import { Check, CircleAlert, FlaskConical, Play, ShieldCheck } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "@/lib/cn";
import type { Evaluation, ProjectWorkspace } from "@/lib/api";
import { staggerContainer, useCountUp } from "@/lib/motion";
import {
  Badge,
  Button,
  Card,
  CardBar,
  EmptyState,
  MetricCard,
  SplitLayout,
  StatList,
  type Tone,
} from "@/components/ui";
import { InlineError } from "./overview";

const GROUP_COLORS: Record<string, string> = {
  standard: "var(--info)",
  ambiguous: "var(--warning)",
  incomplete: "var(--danger)",
  adversarial: "var(--brand-violet)",
};

export function EvaluationSurface({
  workflow,
  evaluations,
  pending,
  error,
  onRun,
}: {
  workflow?: ProjectWorkspace["workflow"];
  evaluations: Evaluation[];
  pending: boolean;
  error?: string;
  onRun: () => void;
}) {
  if (!workflow) {
    return (
      <EmptyState
        icon={<FlaskConical size={26} />}
        title="Compile a workflow before evaluation"
        detail="The evaluation lab runs only against a validated workflow version and its grounded evidence."
      />
    );
  }

  const latest = evaluations[0];

  if (!latest) {
    return (
      <EmptyState
        icon={<FlaskConical size={26} />}
        eyebrow="REAL METRICS ONLY"
        title="Run the 60-case policy suite"
        detail="Fifteen standard, ambiguous, incomplete, and adversarial claims are evaluated against the current graph, citations, escalation behavior, and consequential-action controls."
        action={
          <div>
            <Button variant="primary" size="lg" loading={pending} icon={<Play size={16} />} onClick={onRun}>
              Run evaluation suite
            </Button>
            {error ? <InlineError message={error} /> : null}
          </div>
        }
      />
    );
  }

  const metrics: { label: string; value: number; gate: string; tone: Tone }[] = [
    { label: "Execution success", value: Number(latest.metrics.workflow_execution_success), gate: "≥ 90%", tone: "info" },
    { label: "Citation accuracy", value: Number(latest.metrics.citation_accuracy), gate: "≥ 95%", tone: "success" },
    { label: "Escalation recall", value: Number(latest.metrics.escalation_recall), gate: "≥ 95%", tone: "accent" },
    { label: "Unsafe action rate", value: Number(latest.metrics.unsafe_action_rate), gate: "= 0%", tone: "danger" },
  ];

  const gatesPassed = Object.values(latest.gates).filter(Boolean).length;
  const gatesTotal = Object.keys(latest.gates).length;
  const totalCases = Object.values(latest.case_groups).reduce((sum, count) => sum + Number(count), 0);

  return (
    <SplitLayout
      railWidth={300}
      main={
        <Card inset>
          <CardBar
            title={`Workflow v${latest.workflow_version} evaluation`}
            subtitle={`${latest.metrics.case_count} labeled cases · ${latest.method.replaceAll("_", " ")}`}
            action={
              <Badge
                tone={latest.status === "passed" ? "success" : "danger"}
                icon={latest.status === "passed" ? <Check size={13} /> : <CircleAlert size={13} />}
                className="uppercase"
              >
                {latest.status}
              </Badge>
            }
          />

          <motion.div
            variants={staggerContainer(0.06)}
            initial="hidden"
            animate="show"
            className="grid gap-3 p-4 sm:grid-cols-2"
          >
            {metrics.map((metric) => (
              <MetricCard
                key={metric.label}
                label={metric.label}
                value={metric.value}
                gate={metric.gate}
                tone={metric.tone}
              />
            ))}
          </motion.div>

          <div className="border-t border-line px-4 py-4">
            <span className="mb-3 block font-mono text-2xs font-[650] tracking-[0.09em] text-faint uppercase">
              Case distribution
            </span>

            <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-surface-3">
              {Object.entries(latest.case_groups).map(([name, count]) => (
                <motion.span
                  key={name}
                  initial={{ width: 0 }}
                  animate={{ width: `${(Number(count) / Math.max(1, totalCases)) * 100}%` }}
                  transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                  style={{ background: GROUP_COLORS[name] ?? "var(--muted)" }}
                  title={`${name}: ${count}`}
                />
              ))}
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {Object.entries(latest.case_groups).map(([name, count]) => (
                <div
                  key={name}
                  className="flex items-center gap-2 rounded-lg border border-line bg-surface-2 px-2.5 py-2"
                >
                  <i
                    className="size-2 shrink-0 rounded-full"
                    style={{ background: GROUP_COLORS[name] ?? "var(--muted)" }}
                  />
                  <span className="min-w-0 flex-1">
                    <strong className="block truncate text-2xs capitalize text-content">{name}</strong>
                  </span>
                  <em className="font-mono text-2xs not-italic text-content-2">{count}</em>
                </div>
              ))}
            </div>
          </div>
        </Card>
      }
      rail={
        <Card className="p-4.5">
          <GateRing passed={gatesPassed} total={gatesTotal} />

          <h3 className="mt-4 mb-2 text-lg font-[650] tracking-[-0.02em] text-content">
            Safety posture
          </h3>
          <p className="m-0 text-2xs leading-relaxed text-muted">
            The published graph escalates every case, producing perfect required-escalation recall and
            zero unsafe tool paths, but a conservative straight-through rate.
          </p>

          <StatList
            items={[
              {
                label: "Unnecessary escalations",
                value: `${Math.round(Number(latest.metrics.unnecessary_escalation_rate) * 100)}%`,
              },
              {
                label: "Straight-through rate",
                value: `${Math.round(Number(latest.metrics.straight_through_rate) * 100)}%`,
              },
              { label: "Gates passed", value: `${gatesPassed}/${gatesTotal}` },
            ]}
          />

          <Button
            variant="primary"
            block
            className="mt-4"
            loading={pending}
            icon={<FlaskConical size={15} />}
            onClick={onRun}
          >
            Run again
          </Button>
          {error ? <InlineError message={error} /> : null}
        </Card>
      }
    />
  );
}

/**
 * Replaces the previous decorative "risk ocean" animation with a reading of the
 * one number that actually gates a release: how many safety gates passed.
 */
function GateRing({ passed, total }: { passed: number; total: number }) {
  const ratio = total ? passed / total : 0;
  const shown = useCountUp(passed);
  const complete = passed === total;
  const color = complete ? "var(--success)" : ratio >= 0.5 ? "var(--warning)" : "var(--danger)";

  return (
    <div className="relative flex h-40 items-center justify-center overflow-hidden rounded-2xl border border-line bg-surface-2">
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-40"
        style={{
          background: `radial-gradient(circle at 50% 60%, color-mix(in srgb, ${color} 26%, transparent), transparent 62%)`,
        }}
      />
      <div
        className="relative grid size-28 place-items-center rounded-full transition-all duration-500"
        style={{ background: `conic-gradient(${color} ${ratio * 360}deg, var(--surface-3) 0deg)` }}
      >
        <div className="grid size-22 place-items-center rounded-full bg-surface">
          <ShieldCheck size={18} className={cn("mb-1")} style={{ color }} />
          <strong className="font-mono text-lg font-[650] tabular-nums" style={{ color }}>
            {shown}/{total}
          </strong>
          <small className="text-2xs text-muted">gates passed</small>
        </div>
      </div>
    </div>
  );
}
