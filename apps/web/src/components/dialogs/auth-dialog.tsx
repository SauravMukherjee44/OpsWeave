"use client";

import { ArrowRight, LogIn, ShieldCheck, UploadCloud, UserPlus, Users, X } from "lucide-react";
import { ShaderField } from "@/components/visuals/shader-field";
import { Eyebrow, IconButton } from "@/components/ui";
import { DialogShell } from "@/components/ui/dialog";

const BENEFITS = [
  { icon: <ShieldCheck size={15} />, label: "Isolated workspace" },
  { icon: <UploadCloud size={15} />, label: "Private source uploads" },
  { icon: <Users size={15} />, label: "Team collaboration" },
];

export function AuthDialog({ onClose }: { onClose: () => void }) {
  return (
    <DialogShell onClose={onClose} panelClassName="max-w-xl overflow-hidden p-8 text-center">
      <IconButton label="Close" size={32} onClick={onClose} className="absolute top-4 right-4 z-2">
        <X size={17} />
      </IconButton>

      <div className="pointer-events-none absolute inset-x-0 top-0 h-44 opacity-90" aria-hidden="true">
        <ShaderField variant="orb" speed={0.8} />
      </div>

      <div className="relative pt-32">
        <Eyebrow>YOUR PRIVATE OPERATIONS CLOUD</Eyebrow>
        <h2 className="mt-2 mb-2 text-3xl font-[650] tracking-[-0.04em] text-content">
          Build beyond the playground.
        </h2>
        <p className="mx-auto mb-0 max-w-md text-xs leading-relaxed text-muted">
          Sign in to create an isolated workspace, upload private sources, invite collaborators, and
          retain workflow history under your own tenant boundary.
        </p>

        <div className="my-5 grid grid-cols-3 gap-2">
          {BENEFITS.map((benefit) => (
            <span
              key={benefit.label}
              className="flex flex-col items-center gap-1.5 rounded-xl border border-line bg-surface-2 px-2 py-3 text-2xs text-content-2"
            >
              <span className="text-accent-fg">{benefit.icon}</span>
              {benefit.label}
            </span>
          ))}
        </div>

        <a
          href="/auth/signup"
          className="bg-brand-gradient shadow-brand flex h-11 items-center justify-center gap-2 rounded-xl text-xs font-bold text-white no-underline transition-[filter] hover:brightness-110"
        >
          <UserPlus size={16} />
          Create free account
          <ArrowRight size={15} />
        </a>
        <a
          href="/auth/login"
          className="mt-2 flex h-11 items-center justify-center gap-2 rounded-xl border border-line bg-surface-2 text-xs font-bold text-content no-underline transition-colors hover:border-line-strong"
        >
          <LogIn size={16} />
          Sign in to existing workspace
        </a>

        <small className="mt-3.5 block text-2xs text-faint">
          Authentication is handled by AWS Cognito. OpsWeave never receives your password.
        </small>
      </div>
    </DialogShell>
  );
}
