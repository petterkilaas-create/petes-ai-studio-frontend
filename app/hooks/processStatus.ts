import type { JobStatus } from "../lib/jobState";

/**
 * Samlet status for useProcessJob. Rene regler, skilt ut saa de kan
 * testes uten React (node --test).
 */
export type ProcessStatus =
  | "idle"
  | "uploading"
  | "running"
  | "done"
  | "awaiting_approval"
  | "needs_review"
  | "unknown"
  | "failed";

export function deriveProcessStatus(input: {
  isSubmitting: boolean;
  submitError: string | null;
  syncResultUrl: string | null;
  jobId: string | null;
  jobStatus: JobStatus;
}): ProcessStatus {
  const { isSubmitting, submitError, syncResultUrl, jobId, jobStatus } = input;
  if (isSubmitting) return "uploading";
  if (submitError) return "failed";
  if (syncResultUrl) return "done";
  if (!jobId) return "idle";
  switch (jobStatus) {
    case "failed":
    case "done":
    case "awaiting_approval":
    case "needs_review":
    case "unknown":
      return jobStatus;
    default:
      return "running";
  }
}

/** Kun opplasting og polling teller som "jobber" — alle sluttstatuser er false. */
export function isProcessingStatus(status: ProcessStatus): boolean {
  return status === "uploading" || status === "running";
}
