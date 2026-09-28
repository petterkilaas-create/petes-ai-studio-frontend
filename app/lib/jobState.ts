import type { JobResult, Rejection, Review } from "./api";

/**
 * Rene tilstandsregler for useJobStatus — skilt ut saa de kan testes uten
 * React (node --test). Kun type-importer fra api.ts: api.ts kaster ved
 * import naar NEXT_PUBLIC_API_BASE mangler.
 */
export type JobStatus =
  | "idle"
  | "pending"
  | "done"
  | "awaiting_approval"
  | "needs_review"
  | "rejected_by_reviewer"
  | "unknown"
  | "failed";

export interface TerminalJobState {
  status: Exclude<JobStatus, "idle" | "pending">;
  imageUrl: string | null;
  error: string | null;
  rejection: Rejection | null;
  review: Review | null;
  /** Meglerens begrunnelse ved rejected_by_reviewer (2d-1), ellers null. */
  reviewerReason: string | null;
  /** Raa status + HTTP-kode ved ukjent status, for liten debug-tekst. */
  unknownDetail: string | null;
}

/**
 * Terminal tilstand for et poll-resultat, eller null naar jobben fortsatt
 * kjoerer (pending — poll videre). `toObjectUrl` kalles kun for "done"
 * (bildebytes); awaiting_approval bruker den signerte URL-en direkte.
 */
export function terminalState(
  result: JobResult,
  toObjectUrl: (blob: Blob) => string
): TerminalJobState | null {
  const base = {
    imageUrl: null,
    error: null,
    rejection: null,
    review: null,
    reviewerReason: null,
    unknownDetail: null,
  };
  switch (result.kind) {
    case "pending":
      return null;
    case "done":
      return { ...base, status: "done", imageUrl: toObjectUrl(result.imageBlob) };
    case "awaiting_approval":
      return { ...base, status: "awaiting_approval", imageUrl: result.resultUrl };
    case "needs_review":
      return { ...base, status: "needs_review", review: result.review };
    case "rejected_by_reviewer":
      return { ...base, status: "rejected_by_reviewer", reviewerReason: result.reason };
    case "unknown":
      return {
        ...base,
        status: "unknown",
        unknownDetail: `status: ${result.status ?? "(mangler)"}, HTTP ${result.httpStatus}`,
      };
    case "failed":
      return result.rejection
        ? {
            ...base,
            status: "failed",
            rejection: result.rejection,
            error: result.rejection.message,
          }
        : { ...base, status: "failed", error: result.detail };
  }
}
