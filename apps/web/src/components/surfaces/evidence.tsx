"use client";

import { BookOpenCheck, CloudOff, Search, ShieldCheck, Sparkles } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { listItem, staggerContainer } from "@/lib/motion";
import type { ProjectWorkspace } from "@/lib/api";
import { SourceGlyph } from "@/components/shared/source-glyph";
import {
  Badge,
  Card,
  CardBar,
  EmptyState,
  LoadingSurface,
  Pagination,
  SearchInput,
  SectionIcon,
  Select,
  SplitLayout,
  StatList,
  Toolbar,
  type Tone,
} from "@/components/ui";

const KIND_TONES: Record<string, Tone> = {
  rule: "warning",
  constraint: "warning",
  action: "success",
  actor: "accent",
  source: "info",
};

export function EvidenceExplorer({
  workspace,
  loading,
}: {
  workspace?: ProjectWorkspace;
  loading: boolean;
}) {
  const [page, setPage] = useState(1);
  const [kind, setKind] = useState("all");
  const [query, setQuery] = useState("");

  if (loading) return <LoadingSurface label="Loading grounded evidence" />;

  if (!workspace?.cloud_connected) {
    return (
      <EmptyState
        icon={<CloudOff size={26} />}
        title="AWS evidence store is not connected"
        detail="Configure the OpsWeave DynamoDB application table to inspect live compilation output."
      />
    );
  }

  if (!workspace.evidence.length) {
    return (
      <EmptyState
        icon={<BookOpenCheck size={26} />}
        title="No compiled evidence yet"
        detail="Upload source material and start a compilation. Facts appear only after Bedrock extraction and citation validation complete."
      />
    );
  }

  const extracted = workspace.evidence.some((item) => item.stage === "extracted");
  const labelFor = (item: ProjectWorkspace["evidence"][number]) =>
    item.stage === "extracted" ? "source" : item.kind;

  const kinds = ["all", ...Array.from(new Set(workspace.evidence.map(labelFor)))];
  const filtered = workspace.evidence.filter(
    (item) =>
      (kind === "all" || labelFor(item) === kind) &&
      (!query || `${item.statement} ${item.filename ?? ""}`.toLowerCase().includes(query.toLowerCase())),
  );

  const pageSize = 12;
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pages);
  const visible = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  return (
    <SplitLayout
      railWidth={300}
      main={
        <Card inset>
          <CardBar
            title={`${workspace.evidence.length} grounded findings`}
            subtitle={
              extracted
                ? "Normalized directly from live AWS multimodal extraction"
                : "Produced by the latest evidence-bound compilation"
            }
            action={
              <Badge tone="success" icon={<ShieldCheck size={13} />}>
                Provenance required
              </Badge>
            }
          />

          <Toolbar>
            <SearchInput
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
              placeholder="Search statements or sources"
              icon={<Search size={14} className="text-muted" />}
              wrapperClassName="min-w-56 flex-1"
            />
            <Select
              value={kind}
              onChange={(event) => {
                setKind(event.target.value);
                setPage(1);
              }}
              className="h-9 w-auto"
            >
              {kinds.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </Select>
          </Toolbar>

          <motion.div variants={staggerContainer(0.025)} initial="hidden" animate="show">
            {visible.map((item) => {
              const label = labelFor(item);
              return (
                <motion.article
                  key={item.evidence_id}
                  variants={listItem}
                  className="grid grid-cols-[1fr_auto] gap-4 border-b border-line px-5 py-4 transition-colors last:border-b-0 hover:bg-surface-2 sm:grid-cols-[88px_1fr_auto]"
                >
                  <Badge tone={KIND_TONES[label] ?? "info"} mono className="h-max uppercase">
                    {label}
                  </Badge>

                  <div className="min-w-0">
                    <p className="m-0 text-xs leading-relaxed text-content-2">{item.statement}</p>

                    {item.filename ? (
                      <div className="mt-2 flex items-center gap-1.5 text-2xs text-muted">
                        <span className="text-accent-fg">
                          <SourceGlyph
                            size={13}
                            mediaType={
                              workspace.artifacts.find((a) => a.artifact_id === item.artifact_id)
                                ?.media_type ?? "text/plain"
                            }
                          />
                        </span>
                        <span className="truncate">
                          {item.filename}
                          {item.page ? ` · page ${item.page}` : ""}
                          {item.timestamp ? ` · ${item.timestamp}` : ""}
                        </span>
                      </div>
                    ) : null}

                    {item.source_evidence_ids.length ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {item.source_evidence_ids.map((citation) => (
                          <code
                            key={citation}
                            className="rounded border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-2xs text-accent-fg"
                          >
                            #{citation.slice(0, 10)}
                          </code>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <ConfidenceDial value={Number(item.confidence)} />
                </motion.article>
              );
            })}
          </motion.div>

          <Pagination page={safePage} pages={pages} total={filtered.length} onPage={setPage} />
        </Card>
      }
      rail={
        <Card className="p-4.5 xl:sticky xl:top-22">
          <SectionIcon tone="brand">
            <Sparkles size={18} />
          </SectionIcon>
          <h3 className="mt-3.5 mb-2 text-lg font-[650] tracking-[-0.02em] text-content">
            Evidence health
          </h3>
          <p className="m-0 text-2xs leading-relaxed text-muted">
            {extracted
              ? "Source extraction remains independently inspectable while the reasoning compiler is unavailable."
              : "Every process fact must cite extracted source evidence. Unsupported model output is rejected before a workflow version can be created."}
          </p>
          <StatList
            items={[
              { label: "Grounded findings", value: workspace.evidence.length },
              { label: "Visible results", value: filtered.length },
              { label: "Open conflicts", value: workspace.conflicts.filter((c) => c.status === "open").length },
              { label: "Workflow version", value: workspace.workflow ? `v${workspace.workflow.version}` : "—" },
            ]}
          />
        </Card>
      }
    />
  );
}

/** Compact radial gauge — reads faster than a bare percentage in a dense list. */
function ConfidenceDial({ value }: { value: number }) {
  const percent = Math.round(value * 100);
  const tone = percent >= 85 ? "var(--success)" : percent >= 65 ? "var(--warning)" : "var(--danger)";

  return (
    <div className="flex shrink-0 flex-col items-center justify-center">
      <div
        className="grid size-11 place-items-center rounded-full"
        style={{
          background: `conic-gradient(${tone} ${percent * 3.6}deg, var(--surface-3) 0deg)`,
        }}
      >
        <span className="grid size-8.5 place-items-center rounded-full bg-surface">
          <strong className={cn("font-mono text-2xs font-[650]")} style={{ color: tone }}>
            {percent}
          </strong>
        </span>
      </div>
      <small className="mt-1 text-2xs text-faint">confidence</small>
    </div>
  );
}
