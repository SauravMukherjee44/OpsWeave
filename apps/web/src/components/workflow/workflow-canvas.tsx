"use client";

import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ShieldCheck, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import type { WorkflowRecord } from "@/lib/api";
import { IconButton } from "@/components/ui";
import { layoutNodes, NODE_HEIGHT, NODE_WIDTH } from "./layout";
import { metaFor } from "./node-types";
import { WorkflowGraphNode } from "./workflow-node";

const NODE_TYPES = { workflowNode: WorkflowGraphNode };

const FAILURE = "#f4544a";
const FLOW = "#b45cff";

export function WorkflowCanvas({ workflow }: { workflow: WorkflowRecord }) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const selectedNode = workflow.definition.nodes.find((node) => node.id === selectedNodeId);

  const nodes: Node[] = useMemo(() => {
    const positions = layoutNodes(workflow.definition.nodes, workflow.definition.edges);
    return workflow.definition.nodes.map((node) => ({
      id: node.id,
      type: "workflowNode",
      position: positions.get(node.id) ?? { x: 0, y: 0 },
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      data: { name: node.name, type: node.type },
    }));
  }, [workflow.definition.nodes, workflow.definition.edges]);

  const edges: Edge[] = useMemo(
    () =>
      workflow.definition.edges.map((edge, index) => {
        const failure = edge.on === "failure";
        const stroke = failure ? FAILURE : FLOW;
        return {
          id: `${edge.source}-${edge.target}-${index}`,
          source: edge.source,
          target: edge.target,
          type: "smoothstep",
          label: edge.condition || undefined,
          animated: !failure,
          markerEnd: { type: MarkerType.ArrowClosed, color: stroke, width: 16, height: 16 },
          style: { stroke, strokeWidth: 1.8, strokeDasharray: failure ? "5 4" : undefined },
          labelStyle: { fill: "var(--muted)", fontSize: 10, fontWeight: 600 },
          labelBgStyle: { fill: "var(--surface)", fillOpacity: 0.92 },
          labelBgPadding: [6, 3] as [number, number],
          labelBgBorderRadius: 6,
        };
      }),
    [workflow.definition.edges],
  );

  return (
    <div className="workflow-canvas" aria-label="Compiled workflow graph">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        fitView
        // Without a floor, a long linear graph fits by shrinking nodes until
        // their labels are unreadable; below this the user pans instead.
        fitViewOptions={{ padding: 0.16, minZoom: 0.62, maxZoom: 1.05 }}
        minZoom={0.25}
        maxZoom={1.8}
        nodesDraggable
        proOptions={{ hideAttribution: true }}
        onNodeClick={(_, node) => setSelectedNodeId(node.id)}
        onPaneClick={() => setSelectedNodeId(null)}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1.4} color="var(--grid)" />
        <MiniMap
          pannable
          zoomable
          maskColor="var(--minimap-mask)"
          nodeColor={(node) =>
            metaFor(
              workflow.definition.nodes.find((item) => item.id === node.id)?.type ?? "",
            ).color
          }
        />
        <Controls showInteractive={false} />
      </ReactFlow>

      <AnimatePresence>
        {selectedNode ? (
          <motion.aside
            className="node-inspector"
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 24 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
            <header>
              <span
                style={{
                  background: `color-mix(in srgb, ${metaFor(selectedNode.type).color} 18%, transparent)`,
                  border: `1px solid color-mix(in srgb, ${metaFor(selectedNode.type).color} 36%, transparent)`,
                  color: metaFor(selectedNode.type).color,
                }}
              >
                {(() => {
                  const Icon = metaFor(selectedNode.type).icon;
                  return <Icon size={17} />;
                })()}
              </span>
              <div>
                <small style={{ color: metaFor(selectedNode.type).color }}>
                  {metaFor(selectedNode.type).label.toUpperCase()} NODE
                </small>
                <strong>{selectedNode.name}</strong>
              </div>
              <IconButton label="Close node details" size={30} onClick={() => setSelectedNodeId(null)}>
                <X size={16} />
              </IconButton>
            </header>

            <section>
              <h4>
                <ShieldCheck size={14} />
                Governed configuration
              </h4>
              <p>
                Compiled settings are immutable in this workflow version and validated before runtime
                publication.
              </p>
              <pre>{JSON.stringify(selectedNode.config, null, 2)}</pre>
            </section>

            <footer>
              <span>Node ID</span>
              <code>{selectedNode.id}</code>
            </footer>
          </motion.aside>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
