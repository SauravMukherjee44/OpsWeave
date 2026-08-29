"use client";

import { FolderKanban } from "lucide-react";
import {
  Button,
  DialogActions,
  DialogHeader,
  Field,
  Input,
  SectionIcon,
  Textarea,
} from "@/components/ui";
import { DialogShell } from "@/components/ui/dialog";
import { InlineError } from "@/components/surfaces/overview";

export function CreateProjectDialog({
  name,
  description,
  pending,
  error,
  onName,
  onDescription,
  onClose,
  onSubmit,
}: {
  name: string;
  description: string;
  pending: boolean;
  error?: string;
  onName: (value: string) => void;
  onDescription: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <DialogShell as="form" onClose={onClose} onSubmit={onSubmit}>
      <DialogHeader
        icon={
          <SectionIcon tone="brand">
            <FolderKanban size={18} />
          </SectionIcon>
        }
        title="Create a project"
        description="Projects isolate sources, workflow versions and audit history."
        onClose={onClose}
      />

      <Field label="Project name">
        <Input
          autoFocus
          value={name}
          onChange={(event) => onName(event.target.value)}
          minLength={3}
          maxLength={180}
          placeholder="Damaged shipment resolution"
          required
        />
      </Field>

      <Field label="Description" className="mt-4">
        <Textarea
          value={description}
          onChange={(event) => onDescription(event.target.value)}
          maxLength={2000}
          placeholder="Describe the operating process and intended outcome."
        />
      </Field>

      {error ? <InlineError message={error} /> : null}

      <DialogActions>
        <Button type="button" variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant="primary"
          loading={pending}
          disabled={name.trim().length < 3}
        >
          Create project
        </Button>
      </DialogActions>
    </DialogShell>
  );
}
