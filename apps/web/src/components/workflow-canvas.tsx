"use client";

import { Background, Controls, MarkerType, MiniMap, ReactFlow, type Edge, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { WorkflowRecord } from "@/lib/api";

const colors: Record<string, string> = {
  trigger: "#4285f4",
  extract: "#8b5cf6",
  retrieve: "#8b5cf6",
  rule: "#fbbc04",
  agent: "#00a67e",
  transform: "#00a67e",
  approval: "#ea4335",
  tool: "#f97316",
  notification: "#06b6d4",
  wait_for_event: "#64748b",
  terminal: "#34a853",
};

export function WorkflowCanvas({ workflow }: { workflow: WorkflowRecord }) {
  const nodes: Node[] = workflow.definition.nodes.map((node, index) => ({
    id: node.id,
    position: { x: 80 + (index % 3) * 280, y: 70 + Math.floor(index / 3) * 150 },
    data: { label: <div className="flow-node-label"><small>{node.type.replaceAll("_", " ")}</small><strong>{node.name}</strong></div> },
    style: {
      width: 210,
      padding: 0,
      overflow: "hidden",
      borderRadius: 14,
      border: `1px solid ${colors[node.type] ?? "#64748b"}66`,
      borderLeft: `4px solid ${colors[node.type] ?? "#64748b"}`,
      background: "var(--surface)",
      color: "var(--text)",
      boxShadow: "var(--shadow)",
    },
  }));
  const edges: Edge[] = workflow.definition.edges.map((edge, index) => ({
    id: `${edge.source}-${edge.target}-${index}`,
    source: edge.source,
    target: edge.target,
    label: edge.condition || undefined,
    animated: edge.on !== "failure",
    markerEnd: { type: MarkerType.ArrowClosed, color: edge.on === "failure" ? "#ea4335" : "#4285f4" },
    style: { stroke: edge.on === "failure" ? "#ea4335" : "#4285f4", strokeWidth: 1.6 },
    labelStyle: { fill: "var(--muted)", fontSize: 9 },
  }));

  return (
    <div className="workflow-canvas" aria-label="Compiled workflow graph">
      <ReactFlow nodes={nodes} edges={edges} fitView minZoom={0.35} maxZoom={1.6} nodesDraggable>
        <Background gap={22} size={1} color="var(--grid)" />
        <MiniMap nodeColor={(node) => colors[workflow.definition.nodes.find((item) => item.id === node.id)?.type ?? ""] ?? "#64748b"} maskColor="var(--minimap-mask)" />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
