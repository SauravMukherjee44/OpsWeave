"use client";

import { ChevronDown, LogIn, MoreHorizontal, X } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "@/lib/cn";
import { NAV_GROUPS, type CountKey, type Surface } from "@/lib/surfaces";
import { BrandMark } from "./brand-mark";

export function SideNav({
  surface,
  counts,
  workspaceName,
  isGuest,
  onSelect,
  onSignIn,
  open,
  onClose,
}: {
  surface: Surface;
  counts: Record<CountKey, number>;
  workspaceName: string;
  isGuest: boolean;
  onSelect: (surface: Surface) => void;
  onSignIn: () => void;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <>
      {open ? (
        <button
          aria-label="Close navigation"
          onClick={onClose}
          className="fixed inset-0 z-40 bg-[var(--overlay)] backdrop-blur-sm lg:hidden"
        />
      ) : null}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[248px] shrink-0 flex-col",
          "border-r border-line bg-[var(--nav)] px-3.5 pt-5 pb-3.5 backdrop-blur-xl",
          "transition-transform duration-200 lg:sticky lg:top-0 lg:h-dvh lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-10 items-center justify-between gap-3 px-2.5">
          <span className="flex items-center gap-3">
            <BrandMark size={30} />
            <span className="text-lg font-[650] tracking-[-0.04em] text-content">OpsWeave</span>
          </span>
          <button
            aria-label="Close navigation"
            onClick={onClose}
            className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-2 lg:hidden"
          >
            <X size={17} />
          </button>
        </div>

        <button
          className={cn(
            "mt-5 mb-5 grid w-full grid-cols-[34px_1fr_auto] items-center gap-2.5 rounded-xl",
            "border border-line bg-surface p-2.5 text-left transition-colors duration-150",
            "hover:border-line-strong hover:bg-surface-2",
          )}
        >
          <span className="bg-brand-gradient shadow-brand grid size-8.5 place-items-center rounded-[10px] font-mono text-2xs font-[650] text-white">
            OW
          </span>
          <span className="min-w-0">
            <strong className="block truncate text-xs font-semibold text-content">
              {isGuest ? "Demo workspace" : workspaceName}
            </strong>
            <small className="mt-0.5 block truncate text-2xs text-muted">
              {isGuest ? "Public playground" : "Private workspace"}
            </small>
          </span>
          <ChevronDown size={15} className="text-muted" />
        </button>

        <nav aria-label="Primary" className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="flex flex-col gap-0.5">
              <p className="mx-3 mt-3.5 mb-1.5 font-mono text-2xs font-[650] tracking-[0.09em] text-faint uppercase">
                {group.label}
              </p>
              {group.items.map((item) => {
                const active = surface === item.id;
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    onClick={() => onSelect(item.id)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "relative flex h-10 w-full items-center gap-3 rounded-[10px] px-3 text-left",
                      "transition-colors duration-150",
                      active
                        ? "bg-accent-bg text-content"
                        : "text-muted hover:bg-surface-2 hover:text-content-2",
                    )}
                  >
                    {active ? (
                      <motion.span
                        layoutId="nav-active"
                        className="bg-brand-gradient absolute -left-3.5 h-5 w-[3px] rounded-r"
                        transition={{ type: "spring", stiffness: 400, damping: 34 }}
                      />
                    ) : null}
                    <Icon size={17} className={cn("shrink-0", active && "text-accent-fg")} />
                    <span className="flex-1 truncate text-xs">{item.label}</span>
                    {item.count ? (
                      <em className="min-w-6 rounded-lg bg-surface-3 px-1.5 py-0.5 text-center font-mono text-2xs not-italic text-muted">
                        {counts[item.count as CountKey]}
                      </em>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="mt-4 shrink-0">
          {isGuest ? (
            <button
              onClick={onSignIn}
              className="grid w-full grid-cols-[32px_1fr_auto] items-center gap-2.5 rounded-xl px-2 py-2 text-left hover:bg-surface-2"
            >
              <span className="bg-brand-gradient grid size-8 place-items-center rounded-full font-mono text-2xs font-[650] text-white">
                G
              </span>
              <span className="min-w-0">
                <strong className="block truncate text-2xs font-semibold text-content">Guest explorer</strong>
                <small className="block truncate text-2xs text-muted">Sign in for a private workspace</small>
              </span>
              <LogIn size={16} className="text-muted" />
            </button>
          ) : (
            <a
              href="/auth/logout"
              className="grid w-full grid-cols-[32px_1fr_auto] items-center gap-2.5 rounded-xl px-2 py-2 text-left no-underline hover:bg-surface-2"
            >
              <span className="bg-brand-gradient grid size-8 place-items-center rounded-full font-mono text-2xs font-[650] text-white">
                OW
              </span>
              <span className="min-w-0">
                <strong className="block truncate text-2xs font-semibold text-content">{workspaceName}</strong>
                <small className="block truncate text-2xs text-muted">Workspace owner</small>
              </span>
              <MoreHorizontal size={16} className="text-muted" />
            </a>
          )}
        </div>
      </aside>
    </>
  );
}
