import type { AdditionsLevel, BrightnessStep, DecisionAction, DecisionRequest, JobReviewDetail } from "./api";
import type { UiKey } from "./i18n";
import { panelShown } from "./presets.ts";

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

/**
 * Peisvalgene (2d-2d, Petter 28.09): to valg, verdiene er uendret mot
 * backend. Et tredje valg («som i originalen») er droppet etter probe.
 */
export const FIREPLACE_OPTIONS: readonly { value: "yes" | "no"; key: UiKey }[] = [
  { value: "yes", key: "action.fireplaceLit" },
  { value: "no", key: "action.fireplaceNotLit" },
];

/** Tekst for et lagret peissvar. */
export function fireplaceAnswerKey(answer: "yes" | "no"): UiKey {
  return answer === "yes" ? "action.fireplaceLit" : "action.fireplaceNotLit";
}

/** Samme grense som backend (REASON_MAX_LEN i api.ts). */
const REASON_MAX = 500;

export interface DecisionControls {
  approve: boolean;
  reject: boolean;
  continue: boolean;
  /** Vis peisspoersmaalet (Tent/Ikke tent). Bare sammen med continue. */
  fireplaceQuestion: boolean;
  /** «Send videre» kan trykkes: continue er lov, og peissvar finnes naar det kreves. */
  continueEnabled: boolean;
  /** Ingen handlinger er lov. */
  none: boolean;
}

/**
 * Peisspoersmaalet bare naar oppskriften har peispanelet (G3); uten
 * `reviewPanels` som foer. Uten panelet er «Send videre» som om
 * spoersmaalet ikke finnes.
 */
export function decisionControls(
  review: Pick<JobReviewDetail, "allowedActions" | "fireplace"> & Partial<Pick<JobReviewDetail, "reviewPanels">>,
  answer: FireplaceAnswer
): DecisionControls {
  const allowed = new Set<DecisionAction>(review.allowedActions);
  const canContinue = allowed.has("continue");
  const fireplaceQuestion =
    canContinue &&
    panelShown(review, "fireplace") &&
    (review.fireplace.present || review.fireplace.disagreement);
  return {
    approve: allowed.has("approve"),
    reject: allowed.has("reject"),
    continue: canContinue,
    fireplaceQuestion,
    continueEnabled: canContinue && (!fireplaceQuestion || answer !== null),
    none: allowed.size === 0,
  };
}

/**
 * Bildene er slettet (TG-NEW-117): `media_deleted_at` er satt. null og
 * undefined betyr det samme: ikke slettet. Knappene er da allerede borte,
 * fordi backend sender tom `allowed_actions`.
 */
export function mediaDeleted(review: Pick<JobReviewDetail, "mediaDeletedAt">): boolean {
  return review.mediaDeletedAt != null;
}

/** Lengde i tegn (kodepunkter), etter trimming, slik backend teller. */
export function reasonLength(text: string): number {
  return [...text.trim()].length;
}

export function reasonTooLong(text: string): boolean {
  return reasonLength(text) > REASON_MAX;
}

/**
 * Sendes `additions_acknowledged: true` (TG-NEW-199)? Bare ved approve, bare
 * ved `warning` og bare naar krysset er satt. Med andre handlinger gir
 * feltet 422.
 */
export function sendAcknowledged(action: DecisionAction, level: AdditionsLevel, acknowledged: boolean): boolean {
  return action === "approve" && level === "warning" && acknowledged;
}

/**
 * Body for POST …/decision. Begrunnelse sendes bare ved reject og bare
 * naar den ikke er tom; peissvar bare ved continue. `expected_version` er
 * versjonen i review-svaret siden viser (TG-NEW-130), utelatt uten version.
 * `brightness_step` bare ved approve og bare naar slideren vises
 * (TG-NEW-147); null gir samme body som foer. `additions_acknowledged`
 * bare ved approve naar kontrollen ga `warning` og krysset er satt
 * (TG-NEW-199); med andre handlinger gir feltet 422.
 */
export function buildDecision(
  action: DecisionAction,
  reason: string,
  answer: FireplaceAnswer,
  review: Pick<JobReviewDetail, "version"> & Partial<Pick<JobReviewDetail, "additionsCheck">>,
  brightnessStep: BrightnessStep | null = null,
  acknowledged = false
): DecisionRequest {
  const body: DecisionRequest = { action };
  const trimmed = reason.trim();
  if (action === "reject" && trimmed !== "") body.reason = trimmed;
  if (action === "continue" && answer !== null) body.fireplace_fire = answer;
  if (review.version !== null) body.expected_version = review.version;
  if (action === "approve" && brightnessStep !== null) body.brightness_step = brightnessStep;
  if (sendAcknowledged(action, review.additionsCheck?.level ?? "unchecked", acknowledged)) {
    body.additions_acknowledged = true;
  }
  return body;
}

/**
 * Jobben kjoerer (f.eks. etter «Send videre» i en annen fane): siden poller
 * da med useJobStatus og henter review paa nytt naar den er ferdig.
 */
export function shouldPoll(status: string): boolean {
  return status === "queued" || status === "running";
}

export type ImageVariant = "lifted" | "raw" | "previous";

/**
 * Lekkasjen L2: de eneste bildefeltene bildevalget faar se. Bare de
 * merkede forhaandsvisningene (og originalen) finnes, saa et umerket bilde
 * kan ikke velges her. JobReviewDetail["images"] passer inn som den er.
 */
export interface ReviewPreviews {
  previewUrl: string | null;
  rawPreviewUrl: string | null;
  previous: { previewUrl: string | null } | null;
}

/**
 * Den merkede forhaandsvisningen for valgt variant, eller null (plassholder).
 * Aldri tilbakefall til en annen variant eller til de gamle feltene.
 */
export function resultImageUrl(images: ReviewPreviews, variant: ImageVariant): string | null {
  if (variant === "previous") return images.previous?.previewUrl ?? null;
  if (variant === "raw") return images.rawPreviewUrl;
  return images.previewUrl;
}

/**
 * Knappene i bildebryteren for jobber uten `rounds`: «Rått» bare for admin
 * og bare naar rawPreviewUrl finnes (D2a: begge kreves, saa en lenke alene
 * aldri viser rått for megler), og «Forrige runde» naar det finnes en
 * forrige runde (bildet kan da vise plassholder). Tom liste = ingen bryter.
 */
export function variantOptions(images: ReviewPreviews, isAdmin: boolean): ImageVariant[] {
  const options: ImageVariant[] =
    isAdmin && images.rawPreviewUrl !== null ? ["lifted", "raw"] : ["lifted"];
  if (images.previous !== null) options.push("previous");
  return options.length > 1 ? options : [];
}

/**
 * Linje for en jobb som ikke venter paa megleren (etter en avgjoerelse),
 * eller null naar den venter (awaiting_approval/needs_review).
 */
export function outcome(
  review: Pick<JobReviewDetail, "status" | "decisions"> & Partial<Pick<JobReviewDetail, "isOwner">>
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
        // TG-NEW-127: paa en annen brukers jobb var det eieren som avviste.
        const key = review.isOwner === false ? "review.statusRejectedByOwner" : "review.statusRejected";
        return { key, reason: last.reason };
      }
      return { key: "review.statusOther", reason: null };
    }
    default:
      return { key: "review.statusOther", reason: null };
  }
}

/** TG-NEW-219: grunnene megleren ser ved stopp i port 1, i denne rekkefølgen. */
export const MEGLER_REASON_CODES = ["image_type_not_supported", "sky_missing", "sky_through_windows_only"] as const;

/**
 * Grunnen megleren ser over knappene (TG-NEW-219, Petter 19.10): den foerste
 * koden fra MEGLER_REASON_CODES som finnes i `reasonCodes`, bare ved stopp i
 * port 1 (needs_review + gate_review). Ellers null. Andre grunner er bare
 * for admin (DetailsPanel). `includes` paa lista, ikke `in` paa et objekt.
 */
export function meglerReason(review: Pick<JobReviewDetail, "status" | "code" | "reasonCodes">): string | null {
  if (review.status !== "needs_review" || review.code !== "gate_review") return null;
  return MEGLER_REASON_CODES.find((code) => review.reasonCodes.includes(code)) ?? null;
}
