import type { DecisionAction, DecisionRequest, JobReviewDetail } from "./api";
import type { UiKey } from "./i18n";

/**
 * Rene regler for godkjenningssiden (2d-1), skilt ut saa de kan testes uten
 * React (node --test). Bare type-importer: api.ts kaster ved import naar
 * NEXT_PUBLIC_API_BASE mangler.
 *
 * Knappene styres av `allowed_actions` fra backend (Petter 28.09), aldri av
 * egen statuslogikk her. 2d-1a gir approve/reject; continue kommer i 2d-1b
 * og vises da uten ny frontend-endring.
 */

export type FireplaceAnswer = "yes" | "no" | null;

/** Samme grense som backend (REASON_MAX_LEN i api.ts). */
const REASON_MAX = 500;

export interface DecisionControls {
  approve: boolean;
  reject: boolean;
  continue: boolean;
  /** Vis peisspoersmaalet (Ja/Nei). Bare sammen med continue. */
  fireplaceQuestion: boolean;
  /** «Send videre» kan trykkes: continue er lov, og peissvar finnes naar det kreves. */
  continueEnabled: boolean;
  /** Ingen handlinger er lov. */
  none: boolean;
}

export function decisionControls(
  review: Pick<JobReviewDetail, "allowedActions" | "fireplace">,
  answer: FireplaceAnswer
): DecisionControls {
  const allowed = new Set<DecisionAction>(review.allowedActions);
  const canContinue = allowed.has("continue");
  const fireplaceQuestion =
    canContinue && (review.fireplace.present || review.fireplace.disagreement);
  return {
    approve: allowed.has("approve"),
    reject: allowed.has("reject"),
    continue: canContinue,
    fireplaceQuestion,
    continueEnabled: canContinue && (!fireplaceQuestion || answer !== null),
    none: allowed.size === 0,
  };
}

/** Lengde i tegn (kodepunkter), etter trimming, slik backend teller. */
export function reasonLength(text: string): number {
  return [...text.trim()].length;
}

export function reasonTooLong(text: string): boolean {
  return reasonLength(text) > REASON_MAX;
}

/**
 * Body for POST …/decision. Begrunnelse sendes bare ved reject og bare
 * naar den ikke er tom; peissvar bare ved continue.
 */
export function buildDecision(
  action: DecisionAction,
  reason: string,
  answer: FireplaceAnswer
): DecisionRequest {
  const body: DecisionRequest = { action };
  const trimmed = reason.trim();
  if (action === "reject" && trimmed !== "") body.reason = trimmed;
  if (action === "continue" && answer !== null) body.fireplace_fire = answer;
  return body;
}

/**
 * Jobben kjoerer (f.eks. etter «Send videre» i en annen fane): siden poller
 * da med useJobStatus og henter review paa nytt naar den er ferdig.
 */
export function shouldPoll(status: string): boolean {
  return status === "queued" || status === "running";
}

export type ImageVariant = "lifted" | "raw";

/** Resultatbildet for valgt variant. Rått faller tilbake til løftet. */
export function resultImageUrl(
  images: JobReviewDetail["images"],
  variant: ImageVariant
): string | null {
  if (variant === "raw" && images.rawUrl) return images.rawUrl;
  return images.resultUrl ?? images.rawUrl;
}

/** Bryteren løftet/rått vises bare naar begge bildene finnes. */
export function hasVariantToggle(images: JobReviewDetail["images"]): boolean {
  return images.resultUrl !== null && images.rawUrl !== null;
}

/**
 * Linje for en jobb som ikke venter paa megleren (etter en avgjoerelse),
 * eller null naar den venter (awaiting_approval/needs_review).
 */
export function outcome(
  review: Pick<JobReviewDetail, "status" | "decisions">
): { key: UiKey; reason: string | null } | null {
  switch (review.status) {
    case "awaiting_approval":
    case "needs_review":
      return null;
    case "succeeded":
      return { key: "review.statusSucceeded", reason: null };
    case "queued":
    case "running":
      return { key: "review.statusRunning", reason: null };
    case "failed": {
      const last = review.decisions.at(-1);
      if (last?.action === "reject") {
        return { key: "review.statusRejected", reason: last.reason };
      }
      return { key: "review.statusOther", reason: null };
    }
    default:
      return { key: "review.statusOther", reason: null };
  }
}
