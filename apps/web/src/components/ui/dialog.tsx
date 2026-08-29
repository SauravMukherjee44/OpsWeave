"use client";

import { X } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { fadeIn, scaleIn } from "@/lib/motion";
import { IconButton } from "./button";

export function DialogShell({
  onClose,
  className,
  panelClassName,
  as = "section",
  onSubmit,
  children,
}: {
  onClose: () => void;
  className?: string;
  panelClassName?: string;
  as?: "section" | "form";
  onSubmit?: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const Panel = as === "form" ? motion.form : motion.section;

  return (
    <motion.div
      variants={fadeIn}
      initial="hidden"
      animate="show"
      exit="exit"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className={cn(
        "fixed inset-0 z-100 grid place-items-center p-6",
        "bg-[var(--overlay)] backdrop-blur-md",
        className,
      )}
    >
      <Panel
        variants={scaleIn}
        initial="hidden"
        animate="show"
        exit="exit"
        role="dialog"
        aria-modal="true"
        onSubmit={
          as === "form"
            ? (event: React.FormEvent) => {
                event.preventDefault();
                onSubmit?.();
              }
            : undefined
        }
        className={cn(
          "relative w-full max-w-lg rounded-3xl border border-line bg-surface p-6 shadow-e3",
          panelClassName,
        )}
      >
        {children}
      </Panel>
    </motion.div>
  );
}

export function DialogHeader({
  icon,
  title,
  description,
  onClose,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="mb-5 flex items-start gap-3">
      {icon}
      <div className="min-w-0 flex-1">
        <h2 className="m-0 text-xl font-[650] tracking-[-0.03em] text-content">{title}</h2>
        {description ? (
          <p className="mt-1.5 mb-0 text-xs text-muted">{description}</p>
        ) : null}
      </div>
      <IconButton label="Close" size={32} onClick={onClose} type="button">
        <X size={17} />
      </IconButton>
    </div>
  );
}

export function DialogActions({ children }: { children: ReactNode }) {
  return <div className="mt-6 flex justify-end gap-2">{children}</div>;
}
