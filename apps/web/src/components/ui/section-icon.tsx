import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type IconTone =
  | "brand"
  | "accent"
  | "primary"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "neutral";

const TONES: Record<IconTone, string> = {
  brand: "bg-brand-gradient text-white shadow-brand",
  accent: "bg-accent-bg text-accent-fg border border-accent-border",
  primary: "bg-primary-500/15 text-primary-400 border border-primary-500/30",
  success: "bg-success-bg text-success-fg border border-success-border",
  warning: "bg-warning-bg text-warning-fg border border-warning-border",
  danger: "bg-danger-bg text-danger-fg border border-danger-border",
  info: "bg-info-bg text-info-fg border border-info-border",
  neutral: "bg-surface-3 text-muted border border-line",
};

const SIZES = {
  sm: "size-8 rounded-lg",
  md: "size-10 rounded-xl",
  lg: "size-12 rounded-2xl",
} as const;

export function SectionIcon({
  tone = "accent",
  size = "md",
  className,
  children,
}: {
  tone?: IconTone;
  size?: keyof typeof SIZES;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center",
        TONES[tone],
        SIZES[size],
        className,
      )}
    >
      {children}
    </span>
  );
}
