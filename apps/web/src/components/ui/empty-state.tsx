"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { fadeUp } from "@/lib/motion";
import { ShaderField } from "@/components/visuals/shader-field";
import { Card, Eyebrow } from "./card";

/**
 * Empty states are the most-viewed screens before a workflow is published, so
 * they carry the GPU treatment rather than a flat icon tile.
 */
export function EmptyState({
  icon,
  eyebrow = "LIVE DATA ONLY",
  title,
  detail,
  action,
  className,
}: {
  icon?: ReactNode;
  eyebrow?: string;
  title: ReactNode;
  detail?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("min-h-[420px] p-10", className)}>
      <motion.div
        variants={fadeUp}
        initial="hidden"
        animate="show"
        className="flex h-full min-h-[360px] flex-col items-center justify-center text-center"
      >
        <div className="relative mb-4 grid size-36 place-items-center">
          <div className="absolute inset-0">
            <ShaderField variant="orb" speed={0.7} />
          </div>
          {icon ? (
            <span className="relative z-1 text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.45)]">
              {icon}
            </span>
          ) : null}
        </div>
        <Eyebrow>{eyebrow}</Eyebrow>
        <h2 className="mt-2 mb-2 text-2xl font-[650] tracking-[-0.03em] text-content">{title}</h2>
        {detail ? (
          <p className="m-0 max-w-xl text-xs text-muted">{detail}</p>
        ) : null}
        {action ? <div className="mt-5">{action}</div> : null}
      </motion.div>
    </Card>
  );
}
