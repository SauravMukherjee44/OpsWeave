import {
  Bell,
  Bot,
  Clock,
  Database,
  Flag,
  Scale,
  ScanText,
  Shuffle,
  ShieldCheck,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";

export type NodeMeta = {
  icon: LucideIcon;
  color: string;
  label: string;
};

/**
 * One deliberate hue and glyph per DSL node type. Colors mirror the
 * `--color-node-*` tokens; they are duplicated as literals here because the
 * React Flow minimap and SVG markers need resolved values, not CSS variables.
 */
export const NODE_META: Record<string, NodeMeta> = {
  trigger: { icon: Zap, color: "#4d9dff", label: "Trigger" },
  extract: { icon: ScanText, color: "#8b5cf6", label: "Extract" },
  retrieve: { icon: Database, color: "#a855f7", label: "Retrieve" },
  rule: { icon: Scale, color: "#f5a524", label: "Rule" },
  agent: { icon: Bot, color: "#2fbf82", label: "Agent" },
  transform: { icon: Shuffle, color: "#14b8a6", label: "Transform" },
  tool: { icon: Wrench, color: "#ff8a3d", label: "Tool" },
  approval: { icon: ShieldCheck, color: "#f4544a", label: "Approval" },
  wait_for_event: { icon: Clock, color: "#94a3b8", label: "Wait" },
  notification: { icon: Bell, color: "#38d6da", label: "Notification" },
  terminal: { icon: Flag, color: "#2fbf82", label: "Terminal" },
};

export const FALLBACK_META: NodeMeta = { icon: Zap, color: "#94a3b8", label: "Node" };

export const metaFor = (type: string): NodeMeta => NODE_META[type] ?? FALLBACK_META;
