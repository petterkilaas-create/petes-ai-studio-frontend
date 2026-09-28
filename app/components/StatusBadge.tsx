"use client";

import type { ProcessStatus } from "../hooks/useProcessJob";
import { t } from "../lib/i18n";
import { useLocale } from "../lib/i18n/useLocale";

/**
 * Liten status-indikator (Idle/Uploading/Running/Done/Failed, pluss
 * sluttstatusene fra 2c-2).
 * Visuelt moenster trukket ut av express-v2 sin status-boks i headeren.
 */
const LABELS: Record<ProcessStatus, string> = {
  idle: "Idle",
  uploading: "Uploading...",
  running: "Running...",
  done: "Done",
  awaiting_approval: "Til kontroll",
  needs_review: "Til gjennomgang",
  // Ny tekst (2d-1) gaar via ordlista; se label under.
  rejected_by_reviewer: "Avvist av deg",
  unknown: "Ukjent status",
  failed: "Failed",
};

export interface StatusBadgeProps {
  status: ProcessStatus;
  /** Vises etter "Failed" naar status er failed. */
  error?: string | null;
}

export function StatusBadge({ status, error }: StatusBadgeProps) {
  const locale = useLocale();
  const label =
    status === "failed" && error
      ? `Failed: ${error}`
      : status === "rejected_by_reviewer"
        ? t(locale, "status.rejectedByYou")
        : LABELS[status];

  return (
    <div className="text-right border border-white/10 px-4 py-2 rounded-xl bg-white/5">
      <p className="text-[9px] text-slate-400 uppercase tracking-widest font-bold">
        Status
      </p>
      <p className="text-sm text-white font-black">{label}</p>
    </div>
  );
}
