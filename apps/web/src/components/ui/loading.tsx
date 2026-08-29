import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/cn";
import { Card } from "./card";

export function Spinner({ size = 18, className }: { size?: number; className?: string }) {
  return <LoaderCircle size={size} className={cn("spin shrink-0", className)} />;
}

export function LoadingSurface({ label }: { label: string }) {
  return (
    <Card className="flex min-h-[420px] items-center justify-center gap-3 text-xs text-muted">
      <Spinner size={20} />
      {label}
    </Card>
  );
}

export function InlineLoading({ label }: { label: string }) {
  return (
    <div className="flex min-h-32 items-center justify-center gap-2.5 text-xs text-muted">
      <Spinner size={16} />
      {label}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-lg bg-surface-3",
        className,
      )}
    />
  );
}

export function SkeletonRows({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-2.5", className)}>
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-14 w-full" />
      ))}
    </div>
  );
}
