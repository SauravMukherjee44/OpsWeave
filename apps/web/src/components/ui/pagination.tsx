"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

export function Pagination({
  page,
  pages,
  total,
  onPage,
}: {
  page: number;
  pages: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const first = Math.max(1, Math.min(page - 2, pages - 4));
  const windowed = Array.from({ length: Math.min(5, pages) }, (_, index) => index + first);

  return (
    <footer className="flex min-h-14 flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-2.5 text-2xs text-muted">
      <span>
        Page <strong className="text-content-2">{page}</strong> of {pages} · {total} records
      </span>
      <div className="flex gap-1.5">
        <PageButton disabled={page <= 1} onClick={() => onPage(page - 1)} label="Previous page">
          <ChevronLeft size={14} />
        </PageButton>
        {windowed.map((number) => (
          <PageButton key={number} active={number === page} onClick={() => onPage(number)}>
            {number}
          </PageButton>
        ))}
        <PageButton disabled={page >= pages} onClick={() => onPage(page + 1)} label="Next page">
          <ChevronRight size={14} />
        </PageButton>
      </div>
    </footer>
  );
}

function PageButton({
  active,
  disabled,
  label,
  onClick,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  label?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      className={cn(
        "grid h-8 min-w-8 place-items-center rounded-md border text-2xs transition-colors duration-150",
        active
          ? "bg-brand-gradient border-transparent font-[650] text-white"
          : "border-line bg-surface-2 text-muted hover:border-line-strong hover:text-content",
        "disabled:pointer-events-none disabled:opacity-35",
      )}
    >
      {children}
    </button>
  );
}
