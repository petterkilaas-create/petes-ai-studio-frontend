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
 * med bildebytes; ellers brukes den merkede previewUrl direkte (Lekkasjen
 * L2). null gir plassholder.
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
      return {
        ...base,
        status: "done",
        imageUrl: result.imageBlob !== null ? toObjectUrl(result.imageBlob) : result.previewUrl,
      };
    case "awaiting_approval":
      return { ...base, status: "awaiting_approval", imageUrl: result.previewUrl };
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

/**
 * Hva Express viser i Output-ruten (Lekkasjen L2): bildet naar vi har en
 * URL, plassholder naar jobben er ferdig (done/awaiting_approval) uten
 * merket forhaandsvisning, ellers den tomme ruten. Tar bare den URL-en
 * terminalState ga, aldri et umerket felt.
 */
export type OutputView = { kind: "image"; url: string } | { kind: "placeholder" } | { kind: "empty" };

export function outputView(status: string, imageUrl: string | null): OutputView {
  if (imageUrl) return { kind: "image", url: imageUrl };
  if (status === "done" || status === "awaiting_approval") return { kind: "placeholder" };
  return { kind: "empty" };
}
