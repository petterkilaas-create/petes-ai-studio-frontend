import type { JobResult, Rejection, Review } from "./api";
import { POLL_TRANSIENT_DELAYS_MS, TransientError } from "./retry.ts";

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
}

/**
 * Terminal tilstand for et poll-resultat, eller null naar jobben fortsatt
 * kjoerer (pending — poll videre). Bildet er alltid den merkede previewUrl
 * (Lekkasjen L2/L4); null gir plassholder.
 */
export function terminalState(result: JobResult): TerminalJobState | null {
  const base = {
    imageUrl: null,
    error: null,
    rejection: null,
    review: null,
    reviewerReason: null,
  };
  switch (result.kind) {
    case "pending":
      return null;
    case "done":
      return { ...base, status: "done", imageUrl: result.previewUrl };
    case "awaiting_approval":
      return { ...base, status: "awaiting_approval", imageUrl: result.previewUrl };
    case "needs_review":
      return { ...base, status: "needs_review", review: result.review };
    case "rejected_by_reviewer":
      return { ...base, status: "rejected_by_reviewer", reviewerReason: result.reason };
    case "unknown":
      return { ...base, status: "unknown" };
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

export const POLL_INTERVAL_MS = 2000;

// Transient nettverksfeil dreper ikke loopen umiddelbart: vi proever paa
// nytt med eksponentiell backoff (2 s, 4 s) og gir foerst opp ved tredje
// paafoelgende feil. Et vellykket poll nullstiller telleren.
export const MAX_CONSECUTIVE_ERRORS = 3;
export const BACKOFF_BASE_MS = 2000;

/** Utfallet av ett pollJob-kall: et svar, eller et kastet unntak (f.eks. 500). */
export type PollOutcome = { ok: true; result: JobResult } | { ok: false; error: unknown };

/**
 * Hva useJobStatus gjoer etter ett kall: sluttstatus (stopp), vent og poll
 * igjen, eller gi opp etter for mange feil paa rad.
 */
export type PollStep =
  | { kind: "terminal"; state: TerminalJobState }
  | { kind: "wait"; delayMs: number; consecutiveErrors: number }
  | { kind: "gave_up"; error: string };

/** Et kastet unntak som kan gaa over av seg selv (kaldstart, TG-NEW-134). */
export function isTransientPollError(outcome: PollOutcome): boolean {
  return !outcome.ok && outcome.error instanceof TransientError;
}

/**
 * Regelen for neste steg i pollingen, skilt ut fra hooken saa den kan
 * testes. Et svar (ogsaa failed, TG-NEW-156) stopper eller fortsetter etter
 * svaret selv; bare et kastet unntak gir nye forsoek.
 */
export function afterPoll(outcome: PollOutcome, consecutiveErrors: number): PollStep {
  if (outcome.ok) {
    // Alt unntatt pending er terminalt (ogsaa ukjent status).
    const state = terminalState(outcome.result);
    if (state !== null) return { kind: "terminal", state };
    // pending — backend kan styre tempoet via Retry-After.
    const retryAfterMs = outcome.result.kind === "pending" ? outcome.result.retryAfterMs : undefined;
    return { kind: "wait", delayMs: retryAfterMs ?? POLL_INTERVAL_MS, consecutiveErrors: 0 };
  }
  const errors = consecutiveErrors + 1;
  // Kaldstart (TG-NEW-134): nettverksfeil og 502, 503 og 504 faar pausene
  // 2, 4, 6 og 8 s (20 s) foer pollingen gir opp. Andre feil som foer.
  if (isTransientPollError(outcome)) {
    if (errors <= POLL_TRANSIENT_DELAYS_MS.length) {
      return { kind: "wait", delayMs: POLL_TRANSIENT_DELAYS_MS[errors - 1], consecutiveErrors: errors };
    }
  } else if (errors < MAX_CONSECUTIVE_ERRORS) {
    // 1. feil -> vent 2 s, 2. feil -> vent 4 s.
    return { kind: "wait", delayMs: BACKOFF_BASE_MS * 2 ** (errors - 1), consecutiveErrors: errors };
  }
  const { error } = outcome;
  return { kind: "gave_up", error: error instanceof Error ? error.message : String(error) };
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
