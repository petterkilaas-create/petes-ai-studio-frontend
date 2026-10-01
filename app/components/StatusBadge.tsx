"use client";

import type { ProcessStatus } from "../hooks/useProcessJob";
import { t, type UiKey } from "../lib/i18n";
import { useLocale } from "../lib/i18n/useLocale";
import { Pill, type PillTone } from "./ui/Pill";

/**
 * Liten status-indikator (Idle/Uploading/Running/Done/Failed, pluss
 * sluttstatusene fra 2c-2). Ordene kommer fra ordlista (D1, brief §7).
 */
const VARIANTS: Record<ProcessStatus, { key: UiKey; tone: PillTone; pulse?: boolean }> = {
  idle: { key: "status.idle", tone: "neutral" },
  uploading: { key: "status.uploading", tone: "neutral", pulse: true },
  running: { key: "status.running", tone: "neutral", pulse: true },
  done: { key: "status.done", tone: "green" },
  awaiting_approval: { key: "status.awaitingApproval", tone: "amber" },
  needs_review: { key: "status.awaitingApproval", tone: "amber" },
  rejected_by_reviewer: { key: "status.rejectedByYou", tone: "neutral" },
  unknown: { key: "status.unknown", tone: "neutral" },
  failed: { key: "status.failed", tone: "red" },
};

export interface StatusBadgeProps {
  status: ProcessStatus;
  /** Vises etter «Feilet» naar status er failed. */
  error?: string | null;
  /** «Godkjent» i stedet for «Ferdig» for kveldsbildet (som i Historikk). */
  service?: string | null;
}

export function StatusBadge({ status, error, service }: StatusBadgeProps) {
  const locale = useLocale();
  const v = VARIANTS[status];
  const key: UiKey = status === "done" && service === "scene_transform" ? "status.approved" : v.key;
  const label = status === "failed" && error ? `${t(locale, key)}: ${error}` : t(locale, key);

  return (
    <div className="flex flex-col items-start gap-1 md:items-end">
      <p className="text-[13px] text-ink-2">{t(locale, "status.label")}</p>
      <Pill tone={v.tone} pulse={v.pulse}>
        {label}
      </Pill>
    </div>
  );
}
