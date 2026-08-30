"use client";

import { ArrowRight, BookOpen, Boxes, FileSearch, LifeBuoy, Search, ShieldCheck, Sparkles, Workflow, Zap } from "lucide-react";
import { useMemo, useState } from "react";
import type { Surface } from "@/lib/surfaces";
import { Badge, DialogHeader, DialogShell } from "@/components/ui";

const GUIDES: Array<{ title: string; detail: string; category: string; surface: Surface; icon: typeof BookOpen; tone: string }> = [
  { title: "Create your first project", detail: "Set up an isolated workspace for a new operational workflow.", category: "Getting started", surface: "projects", icon: Boxes, tone: "var(--brand-coral)" },
  { title: "Upload multimodal sources", detail: "Add PDFs, images, audio, video, spreadsheets, and OpenAPI files.", category: "Sources", surface: "sources", icon: FileSearch, tone: "var(--info)" },
  { title: "Understand evidence and conflicts", detail: "Trace extracted rules to their source and reconcile contradictions.", category: "Governance", surface: "evidence", icon: ShieldCheck, tone: "var(--success)" },
  { title: "Compile a governed workflow", detail: "Turn validated evidence into an inspectable, portable workflow graph.", category: "Workflow", surface: "workflow", icon: Workflow, tone: "var(--brand-violet)" },
  { title: "Run quality and safety gates", detail: "Evaluate execution, citation accuracy, escalation recall, and safety.", category: "Evaluation", surface: "evaluations", icon: Zap, tone: "var(--warning)" },
];

export function HelpCenter({ onClose, onNavigate }: { onClose: () => void; onNavigate: (surface: Surface) => void }) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle ? GUIDES.filter(item => `${item.title} ${item.detail} ${item.category}`.toLowerCase().includes(needle)) : GUIDES;
  }, [query]);

  const openGuide = (surface: Surface) => { onNavigate(surface); onClose(); };

  return (
    <DialogShell onClose={onClose} panelClassName="max-h-[88dvh] max-w-4xl overflow-hidden p-0">
      <div className="relative overflow-hidden border-b border-line px-5 pt-5 pb-6 sm:px-7 sm:pt-7">
        <div aria-hidden className="absolute inset-0 opacity-70" style={{ background: "radial-gradient(circle at 8% 0%,color-mix(in srgb,var(--brand-coral) 22%,transparent),transparent 40%),radial-gradient(circle at 88% 20%,color-mix(in srgb,var(--brand-violet) 22%,transparent),transparent 44%)" }} />
        <div className="relative">
          <DialogHeader icon={<div className="grid size-10 place-items-center rounded-xl bg-brand-gradient text-white shadow-brand"><LifeBuoy size={19} /></div>} title="How can we help?" description="Search the product guide or jump directly into a guided workflow." onClose={onClose} />
          <label className="flex h-12 items-center gap-3 rounded-xl border border-line bg-surface/90 px-4 shadow-e1 backdrop-blur focus-within:border-accent-border">
            <Search size={18} className="text-accent-fg" />
            <input value={query} onChange={event => setQuery(event.target.value)} autoFocus aria-label="Search help" placeholder="Search sources, workflows, evaluations…" className="min-w-0 flex-1 bg-transparent text-sm text-content outline-none placeholder:text-faint" />
            <kbd className="hidden rounded-md border border-line bg-surface-2 px-2 py-1 font-mono text-2xs text-faint sm:block">ESC</kbd>
          </label>
        </div>
      </div>

      <div className="max-h-[calc(88dvh-190px)] overflow-y-auto p-5 sm:p-7">
        {!query ? (
          <button onClick={() => openGuide("overview")} className="group mb-6 flex w-full items-center gap-4 overflow-hidden rounded-2xl border border-accent-border bg-brand-soft p-4 text-left transition-transform hover:-translate-y-0.5">
            <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-gradient text-white shadow-brand"><Sparkles size={20} /></div>
            <div className="min-w-0 flex-1"><Badge tone="accent" className="mb-1.5">Recommended</Badge><strong className="block text-sm text-content">Take the five-minute product tour</strong><span className="mt-1 block text-2xs text-muted">Follow evidence from upload through compilation, evaluation, and human review.</span></div>
            <ArrowRight size={18} className="shrink-0 text-accent-fg transition-transform group-hover:translate-x-1" />
          </button>
        ) : null}

        <div className="mb-3 flex items-center justify-between"><span className="font-mono text-2xs font-[650] tracking-[.1em] text-faint uppercase">{query ? "Search results" : "Browse guides"}</span><span className="text-2xs text-muted">{filtered.length} guides</span></div>
        <div className="grid gap-3 sm:grid-cols-2">
          {filtered.map(item => {
            const Icon = item.icon;
            return <button key={item.title} onClick={() => openGuide(item.surface)} className="group flex items-start gap-3 rounded-2xl border border-line bg-surface-2 p-4 text-left transition-all hover:-translate-y-0.5 hover:border-line-strong hover:bg-surface-3"><div className="grid size-9 shrink-0 place-items-center rounded-xl border border-line bg-surface" style={{ color: item.tone }}><Icon size={17} /></div><div className="min-w-0 flex-1"><span className="font-mono text-[9px] font-[700] tracking-wide text-faint uppercase">{item.category}</span><strong className="mt-1 block text-xs text-content">{item.title}</strong><p className="mt-1 text-2xs leading-relaxed text-muted">{item.detail}</p></div><ArrowRight size={14} className="mt-1 shrink-0 text-faint opacity-0 transition-all group-hover:translate-x-1 group-hover:opacity-100" /></button>;
          })}
        </div>
        {filtered.length === 0 ? <div className="rounded-2xl border border-dashed border-line p-10 text-center"><BookOpen size={24} className="mx-auto text-faint" /><strong className="mt-3 block text-sm text-content">No guide found</strong><span className="mt-1 block text-2xs text-muted">Try a shorter search such as “upload” or “workflow”.</span></div> : null}
      </div>
    </DialogShell>
  );
}
