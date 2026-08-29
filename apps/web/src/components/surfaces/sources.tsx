"use client";

import { Blocks, Eye, UploadCloud } from "lucide-react";
import { motion } from "motion/react";
import { formatBytes } from "@/lib/surfaces";
import { listItem, staggerContainer } from "@/lib/motion";
import { mediaGroup, SourceIcon } from "@/components/shared/source-glyph";
import type { Artifact, ProjectWorkspace } from "@/lib/api";
import {
  Button,
  Card,
  CardBar,
  SectionIcon,
  SplitLayout,
  StatusBadge,
} from "@/components/ui";

export function SourcesSurface({
  artifacts,
  cloudArtifacts,
  pending,
  onUpload,
  onPreview,
}: {
  artifacts: Artifact[];
  cloudArtifacts: ProjectWorkspace["artifacts"];
  pending: boolean;
  onUpload: () => void;
  onPreview: (artifact: Artifact) => void;
}) {
  const cloud = new Map(cloudArtifacts.map((artifact) => [artifact.artifact_id, artifact]));
  const groups = artifacts.reduce<Record<string, number>>((acc, artifact) => {
    const group = mediaGroup(artifact.media_type);
    acc[group] = (acc[group] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <SplitLayout
      railWidth={288}
      main={
        <Card inset>
          <CardBar
            title={`${artifacts.length} governed sources`}
            subtitle="Checksummed originals with immutable processing provenance"
            action={
              <Button
                variant="primary"
                size="sm"
                loading={pending}
                icon={<UploadCloud size={14} />}
                onClick={onUpload}
              >
                Upload sources
              </Button>
            }
          />

          <motion.div
            variants={staggerContainer()}
            initial="hidden"
            animate="show"
            className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3"
          >
            {artifacts.map((artifact) => {
              const remote = cloud.get(artifact.id);
              const status = remote?.status ?? artifact.status;
              return (
                <motion.button
                  key={artifact.id}
                  variants={listItem}
                  onClick={() => onPreview(artifact)}
                  className="min-w-0 rounded-xl border border-line bg-surface-2 p-4 text-left transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-1 hover:border-line-accent hover:shadow-e2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <SourceIcon mediaType={artifact.media_type} />
                    <StatusBadge status={status} />
                  </div>

                  <strong className="mt-4 block truncate text-xs font-[650] text-content" title={artifact.filename}>
                    {artifact.filename}
                  </strong>
                  <small className="mt-1 block truncate text-2xs text-muted">{artifact.media_type}</small>

                  <dl className="mt-3.5">
                    <Row label="Size" value={formatBytes(artifact.size_bytes)} />
                    <Row label="Evidence" value={String(remote?.evidence_count ?? "—")} />
                    <Row label="SHA-256" value={`${artifact.checksum_sha256.slice(0, 10)}…`} />
                  </dl>

                  <span className="mt-3 flex items-center gap-1.5 border-t border-line pt-3 text-2xs font-[650] text-accent-fg">
                    <Eye size={13} /> Preview source
                  </span>
                </motion.button>
              );
            })}
          </motion.div>
        </Card>
      }
      rail={
        <Card className="p-4.5">
          <SectionIcon tone="brand">
            <Blocks size={18} />
          </SectionIcon>
          <h3 className="mt-3.5 mb-2 text-lg font-[650] tracking-[-0.02em] text-content">
            Modality coverage
          </h3>
          <p className="m-0 text-2xs text-muted">
            Binary media routes through Bedrock Data Automation. Text and structured formats use
            deterministic normalization before entering the same evidence store.
          </p>
          <dl className="mt-4">
            {Object.entries(groups).map(([name, count]) => (
              <Row key={name} label={name} value={String(count)} />
            ))}
          </dl>
        </Card>
      }
    />
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-t border-line py-2">
      <dt className="font-mono text-2xs text-muted">{label}</dt>
      <dd className="m-0 max-w-[60%] truncate font-mono text-2xs text-content-2">{value}</dd>
    </div>
  );
}
