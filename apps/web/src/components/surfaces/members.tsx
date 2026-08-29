"use client";

import { LogIn, Plus, ShieldCheck, UserPlus, Users } from "lucide-react";
import { motion } from "motion/react";
import type { WorkspaceInfo } from "@/lib/api";
import { listItem, staggerContainer } from "@/lib/motion";
import {
  Badge,
  Button,
  Card,
  CardBar,
  EmptyState,
  LoadingSurface,
  SectionIcon,
} from "@/components/ui";

const DEMO_MEMBERS = [
  { initials: "SM", name: "Saurav Mukherjee", role: "Workspace owner" },
  { initials: "AK", name: "Ava Kim", role: "Operations reviewer" },
  { initials: "JR", name: "Jon Reyes", role: "Policy analyst" },
];

export function MembersSurface({
  info,
  loading,
  onSignIn,
}: {
  info?: WorkspaceInfo;
  loading: boolean;
  onSignIn: () => void;
}) {
  if (loading) return <LoadingSurface label="Loading workspace identity" />;

  if (!info) {
    return (
      <EmptyState
        icon={<Users size={26} />}
        title="Workspace identity unavailable"
        detail="The authenticated workspace endpoint could not be reached."
      />
    );
  }

  const guest = info.role === "demo guest";
  const members = guest
    ? DEMO_MEMBERS
    : [
        {
          initials: "OW",
          name: info.tenant_name.replace(" workspace", ""),
          role: "Workspace owner",
        },
      ];

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <Card inset>
        <CardBar
          title={guest ? "Demo team" : "Workspace members"}
          subtitle={
            guest
              ? "Representative roles in the guided logistics workspace"
              : "People with access to this isolated tenant"
          }
          action={<Badge tone={guest ? "warning" : "success"}>{guest ? "Public" : "Private"}</Badge>}
        />

        <motion.div variants={staggerContainer()} initial="hidden" animate="show" className="px-5">
          {members.map((member) => (
            <motion.article
              key={member.name}
              variants={listItem}
              className="grid grid-cols-[40px_1fr_auto] items-center gap-3 border-b border-line py-3.5 last:border-b-0"
            >
              <span className="bg-brand-gradient grid size-9.5 place-items-center rounded-xl font-mono text-2xs font-bold text-white">
                {member.initials}
              </span>
              <span className="min-w-0">
                <strong className="block truncate text-xs font-semibold text-content">
                  {member.name}
                </strong>
                <small className="mt-0.5 block truncate text-2xs text-muted">{member.role}</small>
              </span>
              <Badge tone="success" dot>Active</Badge>
            </motion.article>
          ))}
        </motion.div>

        <div className="flex items-start gap-3 border-t border-line px-5 py-4">
          <ShieldCheck size={17} className="mt-px shrink-0 text-accent-fg" />
          <span>
            <strong className="block text-xs text-content-2">Tenant boundary</strong>
            <small className="mt-1 block text-2xs leading-relaxed text-muted">
              Membership and roles are scoped to {info.tenant_name}. Cross-workspace access is denied.
            </small>
          </span>
        </div>
      </Card>

      <Card className="p-5">
        <SectionIcon tone="brand">
          <UserPlus size={18} />
        </SectionIcon>
        <h3 className="mt-3.5 mb-2 text-lg font-[650] tracking-[-0.02em] text-content">
          {guest ? "Build with your own team" : "Invite a collaborator"}
        </h3>
        <p className="m-0 text-2xs leading-relaxed text-muted">
          {guest
            ? "Create a private workspace, upload your operating knowledge and invite reviewers without exposing it to demo visitors."
            : "Invite operations, policy, and engineering collaborators to this workspace. Role-based invitations are delivered through Cognito."}
        </p>
        <Button
          variant={guest ? "primary" : "secondary"}
          block
          className="mt-4"
          icon={guest ? <LogIn size={15} /> : <Plus size={15} />}
          onClick={onSignIn}
        >
          {guest ? "Sign in or create account" : "Invite team member"}
        </Button>
      </Card>
    </div>
  );
}
