import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type Tone = "neutral" | "accent" | "success" | "warning" | "danger" | "info";

const TONES: Record<Tone, string> = {
  neutral: "bg-surface-3 text-muted border-transparent",
  accent: "bg-accent-bg text-accent-fg border-accent-border",
  success: "bg-success-bg text-success-fg border-success-border",
  warning: "bg-warning-bg text-warning-fg border-warning-border",
  danger: "bg-danger-bg text-danger-fg border-danger-border",
  info: "bg-info-bg text-info-fg border-info-border",
};

const DOTS: Record<Tone, string> = {
  neutral: "bg-muted",
  accent: "bg-brand-violet",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
};

export function Badge({
  tone = "neutral",
  dot,
  icon,
  mono,
  className,
  children,
}: {
  tone?: Tone;
  dot?: boolean;
  icon?: ReactNode;
  mono?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex w-max items-center gap-1.5 rounded-md border px-2 py-1 text-2xs font-[650]",
        mono && "font-mono",
        TONES[tone],
        className,
      )}
    >
      {dot ? <i className={cn("size-1.5 shrink-0 rounded-full", DOTS[tone])} /> : null}
      {icon}
      {children}
    </span>
  );
}

/** Maps backend lifecycle strings onto the semantic tone scale. */
export function statusTone(status: string): Tone {
  const value = status.toLowerCase();
  if (["succeeded", "processed", "published", "passed", "resolved", "approved", "stored"].includes(value)) return "success";
  if (["failed", "rejected", "failed_to_start", "invalid", "open"].includes(value)) return "danger";
  if (["running", "starting", "resuming", "pending", "queued", "ingesting", "compiling", "draft"].includes(value)) return "warning";
  return "neutral";
}

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Badge tone={statusTone(status)} dot className={cn("capitalize", className)}>
      {status.replaceAll("_", " ")}
    </Badge>
  );
}

export function CountChip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "rounded-md bg-surface-3 px-2 py-1 font-mono text-2xs text-muted",
        className,
      )}
    >
      {children}
    </span>
  );
}
