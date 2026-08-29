"use client";

import { motion } from "motion/react";
import { cn } from "@/lib/cn";
import { listItem, useCountUp } from "@/lib/motion";
import type { Tone } from "./badge";

const BARS: Record<Tone, string> = {
  neutral: "bg-muted",
  accent: "bg-brand-violet",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
};

const VALUES: Record<Tone, string> = {
  neutral: "text-content",
  accent: "text-accent-fg",
  success: "text-success-fg",
  warning: "text-warning-fg",
  danger: "text-danger-fg",
  info: "text-info-fg",
};

/**
 * Percentage metric with an animated count-up and a proportional bar. Replaces
 * the previous static number plus decorative track.
 */
export function MetricCard({
  label,
  value,
  gate,
  tone = "accent",
  passing,
  className,
}: {
  label: string;
  /** Fraction between 0 and 1. */
  value: number;
  gate?: string;
  tone?: Tone;
  passing?: boolean;
  className?: string;
}) {
  const percent = useCountUp(Math.round(value * 100));

  return (
    <motion.article
      variants={listItem}
      className={cn(
        "rounded-xl border border-line bg-surface-2 p-4",
        passing === false && "border-danger-border",
        className,
      )}
    >
      <span className="block text-2xs text-muted">{label}</span>
      <strong className={cn("mt-2 block font-mono text-3xl font-[650] tabular-nums", VALUES[tone])}>
        {percent}%
      </strong>
      {gate ? <small className="mt-1 block text-2xs text-faint">Gate {gate}</small> : null}
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-3">
        <motion.i
          className={cn("block h-full rounded-full", BARS[tone])}
          initial={{ width: 0 }}
          animate={{ width: `${Math.max(2, value * 100)}%` }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
    </motion.article>
  );
}

export function StatTile({
  label,
  value,
  hint,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border border-line bg-surface p-3", className)}>
      <span className="block font-mono text-2xs tracking-[0.07em] text-faint uppercase">
        {label}
      </span>
      <strong className="mt-1.5 block text-sm font-[650] text-content">{value}</strong>
      {hint ? <small className="mt-1 block text-2xs text-muted">{hint}</small> : null}
    </div>
  );
}
