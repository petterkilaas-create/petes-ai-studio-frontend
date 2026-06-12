"use client";

import type { ProcessStatus } from "../hooks/useProcessJob";

/**
 * Liten status-indikator (Idle/Uploading/Running/Done/Failed).
 * Visuelt moenster trukket ut av express-v2 sin status-boks i headeren.
 */
const LABELS: Record<ProcessStatus, string> = {
  idle: "Idle",
  uploading: "Uploading...",
  running: "Running...",
  done: "Done",
  failed: "Failed",
};

export interface StatusBadgeProps {
  status: ProcessStatus;
  /** Vises etter "Failed" naar status er failed. */
  error?: string | null;
}

export function StatusBadge({ status, error }: StatusBadgeProps) {
  const label =
    status === "failed" && error ? `Failed: ${error}` : LABELS[status];

  return (
    <div className="text-right border border-white/10 px-4 py-2 rounded-xl bg-white/5">
      <p className="text-[9px] text-slate-400 uppercase tracking-widest font-bold">
        Status
      </p>
      <p className="text-sm text-white font-black">{label}</p>
    </div>
  );
}
