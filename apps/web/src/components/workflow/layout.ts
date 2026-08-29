import type { WorkflowEdge, WorkflowNode } from "@/lib/api";

export const NODE_WIDTH = 232;
export const NODE_HEIGHT = 78;

const COLUMN_GAP = 96;
const ROW_GAP = 34;

/**
 * Layered left-to-right placement. The previous canvas used a fixed
 * `index % 3` grid, which drew edges backwards and crossed them as soon as a
 * graph branched. Here each node sits one column right of its deepest
 * predecessor, so edges always flow forward.
 */
export function layoutNodes(nodes: WorkflowNode[], edges: WorkflowEdge[]) {
  const incoming = new Map<string, string[]>();
  const outgoing = new Map<string, string[]>();

  for (const node of nodes) {
    incoming.set(node.id, []);
    outgoing.set(node.id, []);
  }
  for (const edge of edges) {
    if (!incoming.has(edge.target) || !outgoing.has(edge.source)) continue;
    incoming.get(edge.target)!.push(edge.source);
    outgoing.get(edge.source)!.push(edge.target);
  }

  const depth = new Map<string, number>();
  const roots = nodes.filter((node) => (incoming.get(node.id) ?? []).length === 0);
  const queue: { id: string; level: number }[] = (roots.length ? roots : nodes.slice(0, 1)).map(
    (node) => ({ id: node.id, level: 0 }),
  );

  // Breadth-first with a visit cap so cyclic definitions cannot spin forever.
  let guard = nodes.length * nodes.length + nodes.length;
  while (queue.length && guard-- > 0) {
    const { id, level } = queue.shift()!;
    if ((depth.get(id) ?? -1) >= level) continue;
    depth.set(id, level);
    for (const next of outgoing.get(id) ?? []) {
      queue.push({ id: next, level: level + 1 });
    }
  }

  // Nodes unreachable from any root still need a column.
  for (const node of nodes) {
    if (!depth.has(node.id)) depth.set(node.id, 0);
  }

  const columns = new Map<number, string[]>();
  for (const node of nodes) {
    const level = depth.get(node.id)!;
    if (!columns.has(level)) columns.set(level, []);
    columns.get(level)!.push(node.id);
  }

  const tallest = Math.max(...Array.from(columns.values(), (column) => column.length), 1);
  const canvasHeight = tallest * (NODE_HEIGHT + ROW_GAP);

  const position = new Map<string, { x: number; y: number }>();
  for (const [level, ids] of columns) {
    const columnHeight = ids.length * (NODE_HEIGHT + ROW_GAP);
    const offset = (canvasHeight - columnHeight) / 2;
    ids.forEach((id, index) => {
      position.set(id, {
        x: 40 + level * (NODE_WIDTH + COLUMN_GAP),
        y: 40 + offset + index * (NODE_HEIGHT + ROW_GAP),
      });
    });
  }

  return position;
}
