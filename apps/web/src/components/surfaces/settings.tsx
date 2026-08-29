"use client";

import { useMutation } from "@tanstack/react-query";
import { Check, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { api, type WorkspaceInfo } from "@/lib/api";
import { formatBytes } from "@/lib/surfaces";
import {
  Badge,
  Button,
  Card,
  CardBar,
  Input,
  LoadingSurface,
  SectionIcon,
  Select,
  SettingRow,
  SplitLayout,
  StatList,
} from "@/components/ui";
import { InlineError } from "./overview";

export function SettingsSurface({
  info,
  healthOnline,
  awsConnected,
}: {
  info?: WorkspaceInfo;
  healthOnline: boolean;
  awsConnected: boolean;
}) {
  const [preferences, setPreferences] = useState({
    timezone: info?.preferences.timezone ?? "Asia/Kolkata",
    notifications: info?.preferences.notifications ?? "Failures and approvals",
    retention: info?.preferences.retention ?? "90 days",
    reviewThreshold: info?.preferences.review_threshold ?? "85%",
  });

  const savePreferences = useMutation({
    mutationFn: () =>
      api.updatePreferences({
        timezone: preferences.timezone,
        notifications: preferences.notifications,
        retention: preferences.retention,
        review_threshold: preferences.reviewThreshold,
      }),
  });

  if (!info) return <LoadingSurface label="Loading platform controls" />;

  const update = (key: keyof typeof preferences, value: string) => {
    setPreferences((current) => ({ ...current, [key]: value }));
    savePreferences.reset();
  };

  const guest = info.role === "demo guest";
  const healthy = healthOnline && awsConnected;

  return (
    <SplitLayout
      railWidth={300}
      main={
        <Card inset>
          <CardBar
            title="Workspace preferences"
            subtitle="Public, non-secret controls for this workspace"
            action={
              <Badge tone={healthy ? "success" : "warning"} dot>
                {healthy ? "Healthy" : "Attention"}
              </Badge>
            }
          />

          <div className="px-5 pb-5">
            <SettingRow
              label="Workspace name"
              hint="Shown to members and in audit exports"
              control={<Input value={info.tenant_name} readOnly />}
            />
            <SettingRow
              label="Timezone"
              hint="Controls timestamps in review and audit views"
              control={
                <Select value={preferences.timezone} onChange={(e) => update("timezone", e.target.value)}>
                  <option>Asia/Kolkata</option>
                  <option>UTC</option>
                  <option>America/New_York</option>
                  <option>Europe/London</option>
                </Select>
              }
            />
            <SettingRow
              label="Notifications"
              hint="Select which operational events need attention"
              control={
                <Select
                  value={preferences.notifications}
                  onChange={(e) => update("notifications", e.target.value)}
                >
                  <option>Failures and approvals</option>
                  <option>All workflow events</option>
                  <option>Critical only</option>
                </Select>
              }
            />
            <SettingRow
              label="Audit retention"
              hint="Retention policy for exported workspace activity"
              control={
                <Select value={preferences.retention} onChange={(e) => update("retention", e.target.value)}>
                  <option>30 days</option>
                  <option>90 days</option>
                  <option>1 year</option>
                </Select>
              }
            />
            <SettingRow
              label="Human-review threshold"
              hint="Agent confidence below this value enters review"
              control={
                <Select
                  value={preferences.reviewThreshold}
                  onChange={(e) => update("reviewThreshold", e.target.value)}
                >
                  <option>75%</option>
                  <option>85%</option>
                  <option>95%</option>
                </Select>
              }
            />

            <Button
              variant="primary"
              className="mt-4"
              disabled={guest}
              loading={savePreferences.isPending}
              icon={<Check size={15} />}
              onClick={() => savePreferences.mutate()}
            >
              {guest
                ? "Sign in to save"
                : savePreferences.isSuccess
                  ? "Preferences saved"
                  : "Save preferences"}
            </Button>

            {savePreferences.isError ? <InlineError message={savePreferences.error.message} /> : null}
          </div>
        </Card>
      }
      rail={
        <Card className="bg-brand-soft p-5">
          <SectionIcon tone="brand">
            <ShieldCheck size={18} />
          </SectionIcon>
          <h3 className="mt-3.5 mb-2 text-lg font-[650] tracking-[-0.02em] text-content">
            Public security posture
          </h3>
          <p className="m-0 text-2xs leading-relaxed text-muted">
            Workspace controls are tenant-scoped. Credentials and operational configuration remain
            protected by the service boundary.
          </p>
          <StatList
            items={[
              { label: "Rate limiting", value: info.rate_limiting ? "Session + IP" : "Unavailable" },
              { label: "Upload limit", value: formatBytes(info.max_upload_bytes) },
              { label: "Data boundary", value: "Tenant isolated" },
            ]}
          />
        </Card>
      }
    />
  );
}
