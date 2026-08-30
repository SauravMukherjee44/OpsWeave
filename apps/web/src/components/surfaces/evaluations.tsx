"use client";

import { Activity, Check, CheckCircle2, CircleAlert, Clock3, FlaskConical, Gauge, Play, ShieldCheck, Sparkles, Target } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "@/lib/cn";
import type { Evaluation, ProjectWorkspace } from "@/lib/api";
import { listItem, staggerContainer, useCountUp } from "@/lib/motion";
import { Badge, Button, Card, EmptyState, type Tone } from "@/components/ui";
import { InlineError } from "./overview";

const GROUP_COLORS: Record<string, string> = {
  standard: "var(--info)", ambiguous: "var(--warning)", incomplete: "var(--danger)", adversarial: "var(--brand-violet)",
};
const TONE_COLORS: Record<Tone, string> = {
  neutral: "var(--muted)", accent: "var(--brand-violet)", success: "var(--success)", warning: "var(--warning)", danger: "var(--danger)", info: "var(--info)",
};
type Metric = { label: string; value: number; threshold: number; gate: string; tone: Tone; inverse?: boolean; caption: string };

export function EvaluationSurface({ workflow, evaluations, pending, error, onRun }: {
  workflow?: ProjectWorkspace["workflow"];
  evaluations: Evaluation[];
  pending: boolean;
  error?: string;
  onRun: () => void;
}) {
  if (!workflow) return <EmptyState icon={<FlaskConical size={26} />} title="Compile a workflow before evaluation" detail="The evaluation lab runs only against a validated workflow version and its grounded evidence." />;
  const latest = evaluations[0];
  if (!latest) return (
    <EmptyState icon={<FlaskConical size={26} />} eyebrow="REAL METRICS ONLY" title="Run the 60-case policy suite" detail="Standard, ambiguous, incomplete, and adversarial claims are evaluated against the current graph, citations, escalation behavior, and consequential-action controls." action={<div><Button variant="primary" size="lg" loading={pending} icon={<Play size={16} />} onClick={onRun}>Run evaluation suite</Button>{error ? <InlineError message={error} /> : null}</div>} />
  );

  const metrics: Metric[] = [
    { label: "Execution success", value: +latest.metrics.workflow_execution_success, threshold: .9, gate: "≥ 90%", tone: "info", caption: "Cases reaching a valid terminal state" },
    { label: "Citation accuracy", value: +latest.metrics.citation_accuracy, threshold: .95, gate: "≥ 95%", tone: "success", caption: "Decisions grounded in source evidence" },
    { label: "Escalation recall", value: +latest.metrics.escalation_recall, threshold: .95, gate: "≥ 95%", tone: "accent", caption: "Required reviews correctly identified" },
    { label: "Unsafe action rate", value: +latest.metrics.unsafe_action_rate, threshold: 0, gate: "= 0%", tone: "danger", inverse: true, caption: "Consequential actions outside policy" },
  ];
  const passed = Object.values(latest.gates).filter(Boolean).length;
  const total = Object.keys(latest.gates).length;
  const cases = Object.values(latest.case_groups).reduce((sum, count) => sum + Number(count), 0);

  return (
    <motion.div variants={staggerContainer(.05)} initial="hidden" animate="show" className="space-y-4">
      <motion.div variants={listItem}><ReleaseVerdict evaluation={latest} passed={passed} total={total} pending={pending} onRun={onRun} /></motion.div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <motion.div variants={listItem}>
            <Card className="overflow-hidden p-4 sm:p-5">
              <SectionHeading eyebrow="Release scorecard" title="Quality gates at a glance" detail={`${latest.metrics.case_count} cases evaluated`} />
              <div className="mt-4 grid gap-3 sm:grid-cols-2">{metrics.map(metric => <ModernMetricCard key={metric.label} metric={metric} />)}</div>
            </Card>
          </motion.div>
          <motion.div variants={listItem}><CaseDistribution groups={latest.case_groups} total={cases} /></motion.div>
        </div>
        <motion.aside variants={listItem} className="space-y-4">
          <Card className="overflow-hidden p-4.5">
            <GateRing passed={passed} total={total} />
            <div className="mt-5 flex items-start gap-3">
              <div className="grid size-9 shrink-0 place-items-center rounded-xl border border-success-border bg-success-soft text-success-fg"><ShieldCheck size={18} /></div>
              <div><h3 className="m-0 text-base font-[650] text-content">Safety posture</h3><p className="mt-1 text-2xs leading-relaxed text-muted">{latest.status === "passed" ? "All release controls passed. No unsafe tool path was observed across the evaluation suite." : "One or more release controls need attention before this workflow can be promoted."}</p></div>
            </div>
            <div className="mt-4 space-y-2">{Object.entries(latest.gates).map(([name, ok]) => <GateRow key={name} name={name} passed={ok} />)}</div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <CompactStat label="Avoidable reviews" value={`${Math.round(+latest.metrics.unnecessary_escalation_rate * 100)}%`} />
              <CompactStat label="Straight-through" value={`${Math.round(+latest.metrics.straight_through_rate * 100)}%`} />
            </div>
            <Button variant="primary" block className="mt-4" loading={pending} icon={<FlaskConical size={15} />} onClick={onRun}>Run evaluation again</Button>
            {error ? <InlineError message={error} /> : null}
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2 text-content"><Activity size={16} className="text-accent-fg" /><strong className="text-xs font-[650]">Evaluation context</strong></div>
            <dl className="mt-3 space-y-2.5">
              <ContextRow label="Workflow" value={`Version ${latest.workflow_version}`} />
              <ContextRow label="Method" value={latest.method.replaceAll("_", " ")} />
              <ContextRow label="Run ID" value={latest.evaluation_id.slice(0, 10)} mono />
              <ContextRow label="Completed" value={formatTimestamp(latest.created_at)} />
            </dl>
          </Card>
        </motion.aside>
      </div>
    </motion.div>
  );
}

function ReleaseVerdict({ evaluation, passed, total, pending, onRun }: { evaluation: Evaluation; passed: number; total: number; pending: boolean; onRun: () => void }) {
  const complete = evaluation.status === "passed";
  return (
    <Card className="relative isolate overflow-hidden p-5 sm:p-6">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 opacity-80" style={{ background: complete ? "radial-gradient(circle at 10% 0%, color-mix(in srgb, var(--success) 19%, transparent), transparent 38%),radial-gradient(circle at 88% 100%, color-mix(in srgb, var(--brand-violet) 18%, transparent), transparent 42%)" : "radial-gradient(circle at 10% 0%, color-mix(in srgb, var(--danger) 18%, transparent), transparent 38%)" }} />
      <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
        <div className="flex min-w-0 items-start gap-4">
          <motion.div initial={{ scale: .72, rotate: -16 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 280, damping: 20 }} className={cn("relative grid size-14 shrink-0 place-items-center rounded-2xl border shadow-[0_14px_36px_-16px_currentColor]", complete ? "border-success-border bg-success-soft text-success-fg" : "border-danger-border bg-danger-soft text-danger-fg")}>
            {complete ? <CheckCircle2 size={27} /> : <CircleAlert size={27} />}
            {complete ? <span className="absolute inset-0 animate-ping rounded-2xl border border-success-border opacity-20" /> : null}
          </motion.div>
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2"><Badge tone={complete ? "success" : "danger"} icon={complete ? <Check size={13} /> : <CircleAlert size={13} />}>{complete ? "Release ready" : "Release blocked"}</Badge><span className="font-mono text-2xs text-faint">WORKFLOW V{evaluation.workflow_version}</span></div>
            <h2 className="m-0 text-2xl font-[680] tracking-[-.04em] text-content sm:text-3xl">{complete ? "Every production gate passed." : "This workflow needs another pass."}</h2>
            <p className="mt-2 max-w-2xl text-xs leading-relaxed text-muted">{complete ? `${evaluation.metrics.case_count} policy scenarios completed with ${passed}/${total} controls cleared and no release-blocking regression.` : `${passed} of ${total} controls cleared. Review the failed gates before publishing this workflow.`}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3"><div className="hidden text-right sm:block"><span className="block font-mono text-2xs text-faint">LAST RUN</span><strong className="mt-1 flex items-center gap-1.5 text-2xs text-content-2"><Clock3 size={13} />{formatTimestamp(evaluation.created_at)}</strong></div><Button variant="secondary" loading={pending} icon={<Play size={14} />} onClick={onRun}>Run again</Button></div>
      </div>
    </Card>
  );
}

function SectionHeading({ eyebrow, title, detail }: { eyebrow: string; title: string; detail: string }) {
  return <div className="flex flex-wrap items-end justify-between gap-3"><div><span className="font-mono text-2xs font-[650] tracking-[.11em] text-accent-fg uppercase">{eyebrow}</span><h3 className="mt-1 text-lg font-[650] tracking-[-.025em] text-content">{title}</h3></div><span className="rounded-full border border-line bg-surface-2 px-3 py-1.5 font-mono text-2xs text-muted">{detail}</span></div>;
}

function ModernMetricCard({ metric }: { metric: Metric }) {
  const percent = useCountUp(Math.round(metric.value * 100));
  const passed = metric.inverse ? metric.value <= metric.threshold : metric.value >= metric.threshold;
  const performance = metric.inverse ? 1 - metric.value : metric.value;
  const color = TONE_COLORS[metric.tone];
  const margin = metric.inverse ? Math.max(0, Math.round((metric.threshold - metric.value) * 100)) : Math.max(0, Math.round((metric.value - metric.threshold) * 100));
  const circumference = 2 * Math.PI * 38;
  return (
    <motion.article variants={listItem} whileHover={{ y: -3 }} className="group relative overflow-hidden rounded-2xl border border-line bg-surface-2 p-4 transition-colors hover:border-strong">
      <div aria-hidden className="absolute -top-14 -right-14 size-36 rounded-full opacity-[.11] blur-2xl group-hover:opacity-20" style={{ background: color }} />
      <div className="relative flex items-center gap-4">
        <div className="relative grid size-24 shrink-0 place-items-center">
          <svg viewBox="0 0 96 96" className="absolute inset-0 size-full -rotate-90" aria-hidden><circle cx="48" cy="48" r="38" fill="none" stroke="var(--surface-3)" strokeWidth="8" /><motion.circle cx="48" cy="48" r="38" fill="none" stroke={color} strokeWidth="8" strokeLinecap="round" strokeDasharray={circumference} initial={{ strokeDashoffset: circumference }} animate={{ strokeDashoffset: circumference * (1 - Math.max(.025, performance)) }} transition={{ duration: 1.05, ease: [.22, 1, .36, 1] }} /></svg>
          <div className="text-center"><strong className="block font-mono text-xl font-[680] tabular-nums text-content">{percent}%</strong><span className={cn("mt-0.5 inline-flex items-center gap-1 text-[9px] font-[700] uppercase", passed ? "text-success-fg" : "text-danger-fg")}>{passed ? <Check size={10} /> : <CircleAlert size={10} />}{passed ? "Pass" : "Review"}</span></div>
        </div>
        <div className="min-w-0 flex-1"><strong className="text-sm font-[650] text-content">{metric.label}</strong><p className="mt-1.5 text-2xs leading-relaxed text-muted">{metric.caption}</p><div className="mt-3 flex flex-wrap gap-1.5"><span className="rounded-md border border-line bg-surface px-2 py-1 font-mono text-[9px] text-content-2">Gate {metric.gate}</span><span className="rounded-md border border-success-border bg-success-soft px-2 py-1 font-mono text-[9px] text-success-fg">{metric.inverse && metric.value === metric.threshold ? "Zero violations" : `+${margin} pts clear`}</span></div></div>
      </div>
    </motion.article>
  );
}

function CaseDistribution({ groups, total }: { groups: Record<string, number>; total: number }) {
  const max = Math.max(...Object.values(groups).map(Number), 1);
  return (
    <Card className="overflow-hidden p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><span className="font-mono text-2xs font-[650] tracking-[.11em] text-accent-fg uppercase">Coverage map</span><h3 className="mt-1 text-lg font-[650] text-content">Scenario distribution</h3><p className="mt-1 text-2xs text-muted">Balanced coverage across routine and failure-prone claim paths.</p></div><div className="flex items-center gap-2 rounded-xl border border-line bg-surface-2 px-3 py-2"><Target size={16} className="text-accent-fg" /><div><strong className="block font-mono text-sm text-content">{total}</strong><span className="block text-[9px] text-faint uppercase">Total cases</span></div></div></div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{Object.entries(groups).map(([name, count], index) => {
        const n = Number(count), color = GROUP_COLORS[name] ?? "var(--muted)", share = Math.round(n / Math.max(1, total) * 100);
        return <motion.div key={name} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .18 + index * .07 }} className="rounded-xl border border-line bg-surface-2 p-3.5"><div className="flex items-center justify-between"><span className="flex items-center gap-2 text-2xs font-[650] capitalize text-content"><i className="size-2 rounded-full" style={{ background: color, boxShadow: `0 0 12px ${color}` }} />{name}</span><span className="font-mono text-2xs text-faint">{share}%</span></div><div className="mt-5 flex h-16 items-end gap-1" aria-label={`${name}: ${n} cases`}>{[.54,.72,.62,.88,1].map((factor, i) => <motion.i key={i} initial={{ height: 0 }} animate={{ height: `${Math.max(16, n / max * factor * 100)}%` }} transition={{ delay: .25 + index * .06 + i * .035, duration: .55 }} className="min-h-1 flex-1 rounded-t-sm opacity-75" style={{ background: color }} />)}</div><div className="mt-2 flex items-baseline justify-between border-t border-line pt-2"><strong className="font-mono text-lg text-content">{n}</strong><span className="text-[9px] text-faint uppercase">Evaluated</span></div></motion.div>;
      })}</div>
      <div className="mt-4 flex h-2 overflow-hidden rounded-full bg-surface-3">{Object.entries(groups).map(([name, count]) => <motion.span key={name} initial={{ width: 0 }} animate={{ width: `${Number(count) / Math.max(1, total) * 100}%` }} transition={{ duration: .9 }} style={{ background: GROUP_COLORS[name] ?? "var(--muted)" }} />)}</div>
    </Card>
  );
}

function GateRing({ passed, total }: { passed: number; total: number }) {
  const ratio = total ? passed / total : 0, shown = useCountUp(passed), color = passed === total ? "var(--success)" : ratio >= .5 ? "var(--warning)" : "var(--danger)", circumference = 2 * Math.PI * 52;
  return <div className="relative flex h-52 items-center justify-center overflow-hidden rounded-2xl border border-line bg-surface-2"><div aria-hidden className="absolute inset-0 opacity-50" style={{ background: `radial-gradient(circle,color-mix(in srgb,${color} 24%,transparent),transparent 58%)` }} /><svg viewBox="0 0 132 132" className="relative size-36 -rotate-90" aria-hidden><circle cx="66" cy="66" r="52" fill="none" stroke="var(--surface-3)" strokeWidth="9" /><motion.circle cx="66" cy="66" r="52" fill="none" stroke={color} strokeWidth="9" strokeLinecap="round" strokeDasharray={circumference} initial={{ strokeDashoffset: circumference }} animate={{ strokeDashoffset: circumference * (1 - ratio) }} transition={{ duration: 1.1 }} /></svg><div className="absolute inset-0 grid place-items-center text-center"><div><ShieldCheck size={20} className="mx-auto mb-2" style={{ color }} /><strong className="block font-mono text-2xl text-content">{shown}/{total}</strong><small className="text-2xs text-muted">release gates passed</small></div></div><div className="absolute top-3 left-3 flex items-center gap-1.5 rounded-full border border-line bg-surface/80 px-2 py-1 text-[9px] font-[700] text-success-fg uppercase"><Sparkles size={10} />Live score</div></div>;
}

function GateRow({ name, passed }: { name: string; passed: boolean }) { return <div className="flex items-center gap-2.5 rounded-xl border border-line bg-surface-2 px-3 py-2.5"><div className={cn("grid size-6 place-items-center rounded-lg", passed ? "bg-success-soft text-success-fg" : "bg-danger-soft text-danger-fg")}>{passed ? <Check size={13} /> : <CircleAlert size={13} />}</div><span className="min-w-0 flex-1 truncate text-2xs font-[600] capitalize text-content-2">{name.replaceAll("_", " ").replaceAll("-", " ")}</span><span className={cn("font-mono text-[9px] font-[700] uppercase", passed ? "text-success-fg" : "text-danger-fg")}>{passed ? "Passed" : "Failed"}</span></div>; }
function CompactStat({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-line bg-surface-2 p-3"><Gauge size={14} className="mb-2 text-faint" /><strong className="block font-mono text-lg text-content">{value}</strong><span className="text-[9px] text-faint">{label}</span></div>; }
function ContextRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) { return <div className="flex items-center justify-between gap-3 border-t border-line pt-2.5 first:border-0 first:pt-0"><dt className="text-2xs text-muted">{label}</dt><dd className={cn("m-0 max-w-[62%] truncate text-right text-2xs font-[600] capitalize text-content", mono && "font-mono normal-case")}>{value}</dd></div>; }
function formatTimestamp(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "Just now" : new Intl.DateTimeFormat("en", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(date); }
