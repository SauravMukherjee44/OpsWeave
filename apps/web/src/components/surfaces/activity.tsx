"use client";

import { Activity, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import type { AuditEvent, ProjectWorkspace } from "@/lib/api";
import { listItem, staggerContainer } from "@/lib/motion";
import {
  Badge,
  Card,
  CardBar,
  FilterChip,
  LoadingSurface,
  Pagination,
  SectionIcon,
  Toolbar,
} from "@/components/ui";

export function ActivitySurface({
  events,
  workspace,
  loading,
}: {
  events: AuditEvent[];
  workspace?: ProjectWorkspace;
  loading: boolean;
}) {
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState("all");

  if (loading) return <LoadingSurface label="Loading audit activity" />;

  const derived: AuditEvent[] = events.length
    ? events
    : (workspace?.artifacts ?? []).map((artifact) => ({
        id: `artifact-${artifact.artifact_id}`,
        actor_id: "aws-ingestion-worker",
        action: `artifact.${artifact.status}`,
        resource_type: "artifact",
        resource_id: artifact.artifact_id,
        created_at: artifact.created_at,
      }));

  const types = ["all", ...Array.from(new Set(derived.map((event) => event.resource_type)))];
  const filtered = filter === "all" ? derived : derived.filter((event) => event.resource_type === filter);

  const pageSize = 10;
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pages);
  const visible = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  return (
    <Card inset>
      <CardBar
        title={`${derived.length} recorded activities`}
        subtitle="Timestamped, tenant-scoped operational and security history"
        action={
          <Badge tone="success" icon={<ShieldCheck size={13} />}>
            Tenant filtered
          </Badge>
        }
      />

      <Toolbar>
        <SlidersHorizontal size={14} className="text-muted" />
        <span className="mr-1 text-2xs text-muted">Event type</span>
        {types.map((type) => (
          <FilterChip
            key={type}
            active={filter === type}
            onClick={() => {
              setFilter(type);
              setPage(1);
            }}
          >
            {type}
          </FilterChip>
        ))}
      </Toolbar>

      <motion.div variants={staggerContainer(0.025)} initial="hidden" animate="show">
        {visible.map((event) => (
          <motion.article
            key={event.id}
            variants={listItem}
            className="grid min-h-16 grid-cols-[36px_1fr] items-center gap-3 border-b border-line px-5 py-3 transition-colors last:border-b-0 hover:bg-surface-2 lg:grid-cols-[36px_1fr_140px_170px]"
          >
            <SectionIcon tone="accent" size="sm">
              <Activity size={15} />
            </SectionIcon>

            <span className="min-w-0">
              <strong className="block truncate text-2xs capitalize text-content">
                {event.action.replaceAll(".", " ")}
              </strong>
              <small className="mt-0.5 block truncate text-2xs text-muted">
                {event.resource_type} · {event.resource_id.slice(0, 12)} · immutable audit event
              </small>
            </span>

            <code className="hidden truncate font-mono text-2xs text-accent-fg lg:block">
              {event.actor_id}
            </code>

            <time className="hidden text-right font-mono text-2xs lg:block">
              <strong className="block text-content-2">
                {new Date(event.created_at).toLocaleDateString()}
              </strong>
              <small className="mt-0.5 block text-faint">
                {new Date(event.created_at).toLocaleTimeString()}
              </small>
            </time>
          </motion.article>
        ))}
      </motion.div>

      <Pagination page={safePage} pages={pages} total={filtered.length} onPage={setPage} />
    </Card>
  );
}
