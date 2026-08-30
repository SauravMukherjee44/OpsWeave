"use client";

import { Bell, Check, CheckCheck, CircleAlert, Clock3, FlaskConical, Inbox, ShieldCheck, Sparkles, Workflow } from "lucide-react";
import { useMemo, useState } from "react";
import type { Approval, AuditEvent } from "@/lib/api";
import type { Surface } from "@/lib/surfaces";
import { cn } from "@/lib/cn";
import { Button, DialogHeader, DialogShell } from "@/components/ui";

type Notice = { id: string; title: string; detail: string; createdAt: string; surface: Surface; tone: string; icon: typeof Bell; unread: boolean };

export function NotificationCenter({ auditEvents, approvals, readIds, onRead, onReadAll, onClose, onNavigate }: {
  auditEvents: AuditEvent[];
  approvals: Approval[];
  readIds: Set<string>;
  onRead: (id: string) => void;
  onReadAll: (ids: string[]) => void;
  onClose: () => void;
  onNavigate: (surface: Surface) => void;
}) {
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const notices = useMemo(() => buildNotices(auditEvents, approvals, readIds), [auditEvents, approvals, readIds]);
  const shown = filter === "unread" ? notices.filter(item => item.unread) : notices;
  const unread = notices.filter(item => item.unread).length;
  const open = (notice: Notice) => { onRead(notice.id); onNavigate(notice.surface); onClose(); };

  return (
    <DialogShell onClose={onClose} className="place-items-stretch justify-items-end p-0" panelClassName="h-dvh max-h-dvh max-w-md rounded-none border-y-0 border-r-0 p-0">
      <div className="flex h-full flex-col overflow-hidden">
        <div className="relative overflow-hidden border-b border-line px-5 pt-5 pb-4">
          <div aria-hidden className="absolute inset-0 opacity-70" style={{ background: "radial-gradient(circle at 85% 0%,color-mix(in srgb,var(--brand-violet) 24%,transparent),transparent 50%),radial-gradient(circle at 10% 20%,color-mix(in srgb,var(--brand-coral) 16%,transparent),transparent 42%)" }} />
          <div className="relative"><DialogHeader icon={<div className="relative grid size-10 place-items-center rounded-xl bg-brand-gradient text-white shadow-brand"><Bell size={19} />{unread ? <i className="absolute -top-1 -right-1 grid min-w-4 place-items-center rounded-full bg-danger px-1 font-mono text-[8px] text-white ring-2 ring-[var(--surface)]">{unread}</i> : null}</div>} title="Notifications" description="Live workflow, approval, and workspace activity." onClose={onClose} />
            <div className="flex items-center gap-2"><button onClick={() => setFilter("all")} className={cn("rounded-lg px-3 py-1.5 text-2xs font-[650]", filter === "all" ? "bg-surface-3 text-content" : "text-muted hover:bg-surface-2")}>All <span className="ml-1 font-mono">{notices.length}</span></button><button onClick={() => setFilter("unread")} className={cn("rounded-lg px-3 py-1.5 text-2xs font-[650]", filter === "unread" ? "bg-surface-3 text-content" : "text-muted hover:bg-surface-2")}>Unread <span className="ml-1 font-mono">{unread}</span></button>{unread ? <button onClick={() => onReadAll(notices.map(item => item.id))} className="ml-auto flex items-center gap-1.5 text-2xs font-[650] text-accent-fg hover:text-content"><CheckCheck size={14} />Mark all read</button> : null}</div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {shown.length ? <div className="space-y-2">{shown.map(notice => { const Icon = notice.icon; return <button key={notice.id} onClick={() => open(notice)} className={cn("group relative flex w-full items-start gap-3 rounded-2xl border p-3.5 text-left transition-all hover:border-line-strong hover:bg-surface-3", notice.unread ? "border-accent-border bg-brand-soft" : "border-line bg-surface-2")}><div className="grid size-9 shrink-0 place-items-center rounded-xl border border-line bg-surface" style={{ color: notice.tone }}><Icon size={17} /></div><div className="min-w-0 flex-1"><div className="flex items-start gap-2"><strong className="min-w-0 flex-1 text-xs font-[650] text-content">{notice.title}</strong>{notice.unread ? <i className="mt-1 size-2 shrink-0 rounded-full bg-brand-violet shadow-[0_0_10px_var(--brand-violet)]" /> : null}</div><p className="mt-1 text-2xs leading-relaxed text-muted">{notice.detail}</p><span className="mt-2 flex items-center gap-1 font-mono text-[9px] text-faint"><Clock3 size={10} />{relativeTime(notice.createdAt)}</span></div></button>; })}</div> : <div className="grid h-full min-h-72 place-items-center text-center"><div><div className="mx-auto grid size-12 place-items-center rounded-2xl border border-line bg-surface-2 text-faint"><Inbox size={22} /></div><strong className="mt-3 block text-sm text-content">{filter === "unread" ? "You’re all caught up" : "No notifications yet"}</strong><span className="mt-1 block text-2xs text-muted">Workflow updates and approvals will appear here.</span></div></div>}
        </div>
        <div className="border-t border-line bg-surface-2 p-4"><Button variant="secondary" block icon={<Check size={14} />} onClick={() => { onNavigate("activity"); onClose(); }}>View complete activity log</Button></div>
      </div>
    </DialogShell>
  );
}

function buildNotices(events: AuditEvent[], approvals: Approval[], readIds: Set<string>): Notice[] {
  const approvalNotices: Notice[] = approvals.filter(item => item.status === "pending").map(item => ({ id: `approval-${item.approval_id}`, title: "Claim approval required", detail: `${item.claim.claim_id} is waiting for a human decision on a $${item.claim.claimed_amount_usd} claim.`, createdAt: item.created_at, surface: "operations", tone: "var(--warning)", icon: ShieldCheck, unread: !readIds.has(`approval-${item.approval_id}`) }));
  const eventNotices: Notice[] = events.slice(0, 30).map(event => {
    const action = event.action.replaceAll("_", " ").replaceAll(".", " ");
    const failed = /fail|block|reject/i.test(action);
    const evaluated = /evaluat/i.test(action);
    const workflow = /workflow|compil|publish/i.test(`${action} ${event.resource_type}`);
    return { id: `event-${event.id}`, title: titleCase(action), detail: `${titleCase(event.resource_type.replaceAll("_", " "))} · ${shortId(event.resource_id)}`, createdAt: event.created_at, surface: evaluated ? "evaluations" : workflow ? "workflow" : "activity", tone: failed ? "var(--danger)" : evaluated ? "var(--brand-violet)" : workflow ? "var(--info)" : "var(--success)", icon: failed ? CircleAlert : evaluated ? FlaskConical : workflow ? Workflow : Sparkles, unread: !readIds.has(`event-${event.id}`) };
  });
  return [...approvalNotices, ...eventNotices].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}
function titleCase(value: string) { return value.replace(/\b\w/g, character => character.toUpperCase()); }
function shortId(value: string) { return value.length > 16 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value; }
function relativeTime(value: string) { const seconds = Math.max(0, Math.floor((Date.now() - Date.parse(value)) / 1000)); if (seconds < 60) return "Just now"; if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`; if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`; return `${Math.floor(seconds / 86400)}d ago`; }
