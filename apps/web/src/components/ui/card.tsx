import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Card({
  className,
  inset,
  ...props
}: HTMLAttributes<HTMLDivElement> & { inset?: boolean }) {
  return (
    <div
      {...props}
      className={cn(
        "bg-surface-gradient card-sheen rounded-2xl border border-line",
        inset && "overflow-hidden",
        className,
      )}
    />
  );
}

/**
 * Header used at the top of a card body. `CardBar` is the bordered variant that
 * sits flush against a table or list below it.
 */
export function CardHeader({
  icon,
  title,
  subtitle,
  action,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-4", className)}>
      <div className="flex min-w-0 items-center gap-3">
        {icon}
        <div className="min-w-0">
          <strong className="block truncate text-sm font-[650] text-content">{title}</strong>
          {subtitle ? (
            <span className="mt-0.5 block truncate text-2xs text-muted">{subtitle}</span>
          ) : null}
        </div>
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </div>
  );
}

export function CardBar({
  icon,
  title,
  subtitle,
  action,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <CardHeader
      icon={icon}
      title={title}
      subtitle={subtitle}
      action={action}
      className={cn("min-h-[68px] border-b border-line px-5 py-3.5", className)}
    />
  );
}

export function Eyebrow({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <span
      className={cn(
        "font-mono text-2xs font-[650] tracking-[0.12em] text-accent-fg uppercase",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Key/value rows used in every right-hand summary rail. */
export function StatList({
  items,
  className,
}: {
  items: { label: ReactNode; value: ReactNode }[];
  className?: string;
}) {
  return (
    <dl className={cn("mt-4", className)}>
      {items.map((item, index) => (
        <div
          key={index}
          className="flex items-center justify-between border-t border-line py-2.5"
        >
          <dt className="text-2xs text-muted">{item.label}</dt>
          <dd className="m-0 font-mono text-2xs font-[650] text-content">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
