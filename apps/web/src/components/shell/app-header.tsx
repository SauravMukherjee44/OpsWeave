"use client";

import { Bell, HelpCircle, LogIn, Menu, Moon, Plus, Search, Sun } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button, IconButton } from "@/components/ui";

export type Theme = "dark" | "light";

export function AppHeader({
  theme,
  isGuest,
  onToggleTheme,
  onCreate,
  onSignIn,
  onOpenNav,
  onOpenHelp,
  onOpenNotifications,
  unreadNotifications,
}: {
  theme: Theme;
  isGuest: boolean;
  onToggleTheme: () => void;
  onCreate: () => void;
  onSignIn: () => void;
  onOpenNav: () => void;
  onOpenHelp: () => void;
  onOpenNotifications: () => void;
  unreadNotifications: number;
}) {
  return (
    <header
      className={cn(
        "sticky top-0 z-30 flex h-17 items-center justify-between gap-4 px-4 sm:px-6",
        "border-b border-line bg-[color-mix(in_srgb,var(--bg)_82%,transparent)] backdrop-blur-xl",
      )}
    >
      <IconButton label="Open navigation" onClick={onOpenNav} className="lg:hidden">
        <Menu size={18} />
      </IconButton>

      <div className="hidden h-10 w-full max-w-lg items-center gap-2.5 rounded-xl border border-line bg-surface px-3 focus-within:border-[var(--brand-violet)] md:flex">
        <Search size={16} className="shrink-0 text-muted" />
        <input
          aria-label="Search"
          placeholder="Search projects, sources and workflows"
          className="min-w-0 flex-1 border-0 bg-transparent text-xs text-content outline-none placeholder:text-faint"
        />
        <kbd className="rounded-md border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-2xs text-faint">
          ⌘K
        </kbd>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <IconButton label="Help" onClick={onOpenHelp} className="hidden sm:grid">
          <HelpCircle size={18} />
        </IconButton>
        <IconButton label="Notifications" onClick={onOpenNotifications} className="hidden sm:grid">
          <Bell size={18} />
          {unreadNotifications ? (
            <i className="absolute top-1 right-0 grid min-w-4 place-items-center rounded-full bg-danger px-1 font-mono text-[8px] font-bold text-white ring-2 ring-[var(--bg)]">
              {unreadNotifications > 9 ? "9+" : unreadNotifications}
            </i>
          ) : null}
        </IconButton>

        <button
          onClick={onToggleTheme}
          aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          className="relative flex h-9 w-18 items-center justify-between rounded-full border border-line bg-surface px-2 text-muted"
        >
          <Sun size={15} className="relative z-1" />
          <Moon size={15} className="relative z-1" />
          <span
            className={cn(
              "absolute top-1 size-7 rounded-full bg-surface-3 shadow-e1 transition-[left] duration-200",
              theme === "dark" ? "left-[calc(100%-2rem)]" : "left-1",
            )}
          />
        </button>

        {isGuest ? (
          <Button variant="secondary" icon={<LogIn size={16} />} onClick={onSignIn}>
            <span className="hidden sm:inline">Sign in</span>
          </Button>
        ) : null}

        <Button variant="primary" icon={<Plus size={17} />} onClick={onCreate}>
          <span className="hidden sm:inline">New project</span>
        </Button>
      </div>
    </header>
  );
}
