"use client";

import { ChevronDown } from "lucide-react";
import { motion } from "motion/react";
import { Eyebrow } from "@/components/ui";
import { fadeUp } from "@/lib/motion";

export function PageHeading({
  eyebrow,
  title,
  description,
  projectName,
}: {
  eyebrow: string;
  title: string;
  description: string;
  projectName?: string;
}) {
  return (
    <motion.section
      key={eyebrow}
      variants={fadeUp}
      initial="hidden"
      animate="show"
      className="mb-7 flex flex-col items-start justify-between gap-4 md:flex-row md:items-end"
    >
      <div className="min-w-0">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h1 className="mt-2 mb-2 max-w-3xl text-3xl font-[620] tracking-[-0.045em] text-content sm:text-4xl">
          {title}
        </h1>
        <p className="m-0 max-w-2xl text-sm text-muted">{description}</p>
      </div>

      {projectName ? (
        <button className="flex h-10 shrink-0 items-center gap-2 rounded-xl border border-line bg-surface px-3.5 text-xs text-content transition-colors hover:border-line-strong">
          <span className="bg-brand-gradient size-2.5 rounded-[3px]" />
          {projectName}
          <ChevronDown size={14} className="text-muted" />
        </button>
      ) : null}
    </motion.section>
  );
}
