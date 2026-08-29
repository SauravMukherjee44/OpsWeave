"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Toolbar({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 border-b border-line bg-surface-2/60 px-4 py-2.5",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function FilterChip({
  active,
  onClick,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "h-7 rounded-md border px-2.5 text-2xs capitalize transition-colors duration-150",
        active
          ? "border-accent-border bg-accent-bg text-accent-fg font-[650]"
          : "border-line bg-surface text-muted hover:border-line-strong hover:text-content",
      )}
    >
      {children}
    </button>
  );
}

/** Two-column surface layout: main content plus a sticky summary rail. */
export function SplitLayout({
  main,
  rail,
  railWidth = 320,
  className,
}: {
  main: ReactNode;
  rail: ReactNode;
  railWidth?: number;
  className?: string;
}) {
  return (
    <div
      className={cn("grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_var(--rail)]", className)}
      style={{ "--rail": `${railWidth}px` } as React.CSSProperties}
    >
      {main}
      <div className="grid gap-3.5 md:grid-cols-2 xl:grid-cols-1">{rail}</div>
    </div>
  );
}
