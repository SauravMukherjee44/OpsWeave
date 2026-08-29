import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { cn } from "@/lib/cn";

const CONTROL =
  "w-full rounded-lg border border-line bg-surface-2 text-content text-xs " +
  "placeholder:text-faint transition-colors duration-150 " +
  "hover:border-line-strong focus:border-[var(--brand-violet)] " +
  "disabled:opacity-60 read-only:text-muted";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(CONTROL, "h-10 px-3", className)} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn(CONTROL, "min-h-24 resize-y px-3 py-2.5", className)} />;
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn(CONTROL, "h-10 px-3 capitalize", className)} />;
}

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="block text-xs font-[650] text-content-2">{label}</span>
      {hint ? <span className="mt-1 block text-2xs text-muted">{hint}</span> : null}
      <span className="mt-2 block">{children}</span>
    </label>
  );
}

/** Settings-style row: description on the left, control on the right. */
export function SettingRow({
  label,
  hint,
  control,
}: {
  label: ReactNode;
  hint?: ReactNode;
  control: ReactNode;
}) {
  return (
    <label className="grid min-h-[76px] grid-cols-1 items-center gap-3 border-b border-line py-3 last:border-b-0 md:grid-cols-[minmax(210px,1fr)_minmax(220px,300px)] md:gap-5">
      <span>
        <span className="block text-xs font-[650] text-content">{label}</span>
        {hint ? <span className="mt-1 block text-2xs font-normal text-muted">{hint}</span> : null}
      </span>
      {control}
    </label>
  );
}

export function SearchInput({
  className,
  wrapperClassName,
  icon,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { wrapperClassName?: string; icon?: ReactNode }) {
  return (
    <div
      className={cn(
        "flex h-9 min-w-0 items-center gap-2 rounded-lg border border-line bg-surface px-3",
        "focus-within:border-[var(--brand-violet)]",
        wrapperClassName,
      )}
    >
      {icon}
      <input
        {...props}
        className={cn(
          "min-w-0 flex-1 border-0 bg-transparent text-xs text-content outline-none placeholder:text-faint",
          className,
        )}
      />
    </div>
  );
}
