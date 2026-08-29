"use client";

import { Check, CircleAlert, Cloud, GitBranch, Waypoints } from "lucide-react";
import type { ProjectWorkspace } from "@/lib/api";
import { WorkflowCanvas } from "@/components/workflow/workflow-canvas";
import { NODE_META } from "@/components/workflow/node-types";
import {
  Badge,
  Button,
  Card,
  CardBar,
  EmptyState,
  SectionIcon,
  SplitLayout,
  StatList,
} from "@/components/ui";
import { InlineError } from "./overview";

export function WorkflowStudio({
  workspace,
  publishPending,
  publishError,
  onPublish,
}: {
  workspace?: ProjectWorkspace;
  publishPending: boolean;
  publishError?: string;
  onPublish: (workflowId: string) => void;
}) {
  const workflow = workspace?.workflow;

  if (!workflow) {
    return (
      <EmptyState
        icon={<Waypoints size={26} />}
        title="No workflow version compiled yet"
        detail="The studio opens after multimodal evidence, contradictions, and graph validation have completed successfully."
      />
    );
  }

  const published = workflow.status === "published";
  const nodeCounts = workflow.definition.nodes.reduce<Record<string, number>>((acc, node) => {
    acc[node.type] = (acc[node.type] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <SplitLayout
      railWidth={300}
      main={
        <Card inset>
          <CardBar
            title={workflow.definition.name}
            subtitle={`${published ? "Published" : "Draft"} version ${workflow.version} · ${
              workflow.compilation_method?.replaceAll("_", " ") ?? workflow.model_id
            }`}
            action={
              <Badge
                tone={workflow.validation.valid ? "success" : "danger"}
                icon={workflow.validation.valid ? <Check size={13} /> : <CircleAlert size={13} />}
              >
                {workflow.validation.valid ? "Graph valid" : "Validation issues"}
              </Badge>
            }
          />
          <WorkflowCanvas workflow={workflow} />

          <div className="flex flex-wrap gap-2 border-t border-line px-5 py-3.5">
            {Object.entries(nodeCounts).map(([type, count]) => {
              const meta = NODE_META[type];
              return (
                <span
                  key={type}
                  className="flex items-center gap-1.5 rounded-md border border-line bg-surface-2 px-2 py-1 text-2xs text-muted"
                >
                  <i
                    className="size-1.5 rounded-full"
                    style={{ background: meta?.color ?? "var(--muted)" }}
                  />
                  <span className="capitalize">{type.replaceAll("_", " ")}</span>
                  <em className="font-mono not-italic text-content-2">{count}</em>
                </span>
              );
            })}
          </div>
        </Card>
      }
      rail={
        <>
          <Card className="p-4.5">
            <SectionIcon tone="accent">
              <GitBranch size={17} />
            </SectionIcon>
            <h3 className="mt-3.5 mb-2 text-lg font-[650] tracking-[-0.02em] text-content">
              Compiled intent
            </h3>
            <p className="m-0 text-2xs leading-relaxed text-muted">{workflow.summary}</p>

            <StatList
              items={[
                { label: "Typed nodes", value: workflow.definition.nodes.length },
                { label: "Transitions", value: workflow.definition.edges.length },
                {
                  label: "Approval gates",
                  value: workflow.definition.nodes.filter((node) => node.type === "approval").length,
                },
              ]}
            />

            {published ? (
              <div className="mt-4 flex items-center justify-center gap-2 rounded-lg bg-success-bg py-2.5 text-2xs font-[650] text-success-fg">
                <Cloud size={14} />
                Live on Step Functions
              </div>
            ) : (
              <Button
                variant="primary"
                block
                className="mt-4"
                loading={publishPending}
                disabled={!workflow.validation.valid}
                icon={<Cloud size={15} />}
                onClick={() => onPublish(workflow.workflow_id)}
              >
                Publish to AWS runtime
              </Button>
            )}

            {publishError ? <InlineError message={publishError} /> : null}
          </Card>

          {workflow.clarification_questions.length ? (
            <Card className="p-4.5">
              <span className="font-mono text-2xs font-[650] tracking-[0.09em] text-accent-fg uppercase">
                Clarification queue
              </span>
              <h3 className="mt-1.5 mb-3.5 text-lg font-[650] tracking-[-0.02em] text-content">
                {workflow.clarification_questions.length} questions
              </h3>
              {workflow.clarification_questions.map((question, index) => (
                <p
                  key={`${index}-${question}`}
                  className="m-0 grid grid-cols-[24px_1fr] gap-2.5 border-t border-line py-3 text-2xs leading-relaxed text-muted"
                >
                  <span className="grid size-5.5 place-items-center rounded-md bg-accent-bg font-mono text-2xs font-[650] text-accent-fg">
                    {index + 1}
                  </span>
                  {question}
                </p>
              ))}
            </Card>
          ) : null}
        </>
      }
    />
  );
}
