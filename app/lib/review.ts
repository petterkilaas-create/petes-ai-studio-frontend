import type { AdditionsLevel, BrightnessStep, DecisionAction, DecisionRequest, JobReviewDetail } from "./api";
import type { UiKey } from "./i18n";
import { checklistFor } from "./checklist.ts";
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

// ---- Porten for megleren (Dag 56, P3a) -----------------------------------------
// Petter 27.10: megleren skal se hva som er funnet og hvilket valg hen har.
// Tekstene staar i ordlista (stop.* og note.*); de korte kodene i
// reasonCode/flagCode er bare for admin i «Detaljer». Ukjente koder gir en
// noeytral tekst, aldri en tom boks. Ingen tekst lover gratisbildet tilbake
// (det kommer med kvote-PR-en, P2).

/** Rekkefoelgen grunnene vises i. Koder utenfor lista er ukjente. */
export const STOP_REASON_ORDER = [
  "screenshot_overlay",
  "image_type_not_supported",
  "sky_missing",
  "sky_through_windows_only",
  "furnish_as_mismatch",
  "image_type_untested",
  "image_type_disagreement",
  "valid_runs_insufficient",
  "analysis_uncertain",
  "fireplace_disagreement",
  "fireplace_present",
] as const;

/** Rekkefoelgen merknadene vises i. Koder utenfor lista er ukjente. */
export const NOTE_ORDER = [
  "analysis_light_unconfirmed",
  "single_run",
  "analysis_sky_unclear",
  "sky_visibility_disagreement",
  "analysis_overexposed",
  "analysis_text_unreadable",
  "analysis_screenshot_overlay",
  "image_type_disagreement",
  "fireplace_disagreement",
  "analysis_other",
] as const;

type Service = "kveldsbilde" | "klart_vaer" | "styling" | null;

/** Tjenesten jobben hoerer til, med samme skille som sjekklista (checklistFor). */
function serviceOf(presetId: string | null): Service {
  switch (checklistFor(presetId)) {
    case "kveldsbilde":
      return "kveldsbilde";
    case "blaa_himmel":
      return "klart_vaer";
    case "styling":
      return "styling";
    default:
      return null;
  }
}

function has<T extends string>(list: readonly T[], code: string): code is T {
  return (list as readonly string[]).includes(code);
}

/** Bare egne koder i fast rekkefoelge, uten duplikater; `unknown` til slutt naar noe er ukjent. */
function ordered<T extends string>(codes: readonly string[], order: readonly T[]): { known: T[]; unknown: boolean } {
  return {
    known: order.filter((code) => codes.includes(code)),
    unknown: codes.some((code) => !has(order, code)),
  };
}

type StopReview = Pick<JobReviewDetail, "status" | "code" | "reasonCodes" | "allowedActions" | "presetId" | "imageType">;

/** Er jobben stoppet foer bildet ble laget (needs_review)? */
export function isStopped(review: Pick<JobReviewDetail, "status">): boolean {
  return review.status === "needs_review";
}

/** Peisstoppet: fortsett-knappen heter «Lag bildet», ikke «Lag likevel». */
export function isFireplaceStop(review: Pick<JobReviewDetail, "status" | "code">): boolean {
  return isStopped(review) && review.code === "fireplace_answer_missing";
}

function stopReasonKey(code: (typeof STOP_REASON_ORDER)[number], review: StopReview): UiKey | null {
  switch (code) {
    case "screenshot_overlay":
      return "stop.reason.screenshot_overlay";
    case "image_type_not_supported":
      return "stop.reason.image_type_not_supported";
    case "sky_missing":
      return "stop.reason.sky_missing";
    case "sky_through_windows_only":
      return "stop.reason.sky_through_windows_only";
    case "furnish_as_mismatch": {
      // Romtypen sendes ikke (AVVIK 1); retningen foelger av bildetypen.
      const type = review.imageType.value;
      if (type === "interior") return "stop.reason.furnish_as_mismatch.inside";
      if (type === "balcony_terrace" || type === "exterior_facade") return "stop.reason.furnish_as_mismatch.outside";
      return "stop.reason.furnish_as_mismatch";
    }
    case "image_type_untested":
      switch (serviceOf(review.presetId)) {
        case "kveldsbilde":
          return "stop.reason.image_type_untested.kveldsbilde";
        case "klart_vaer":
          return "stop.reason.image_type_untested.klart_vaer";
        case "styling":
          return "stop.reason.image_type_untested.styling";
        default:
          return null;
      }
    case "image_type_disagreement":
      return "stop.reason.image_type_disagreement";
    case "valid_runs_insufficient":
      return review.allowedActions.includes("continue")
        ? "stop.reason.valid_runs_insufficient.one"
        : "stop.reason.valid_runs_insufficient.none";
    case "analysis_uncertain":
      return "stop.reason.analysis_uncertain";
    case "fireplace_disagreement":
    case "fireplace_present":
      return "stop.reason.fireplace";
  }
}

/**
 * Grunnene i stoppboksen (needs_review), for alle roller: én tekst per
 * kode i STOP_REASON_ORDER, uten duplikater. Ukjent kode, ukjent tjeneste
 * eller ingen koder gir `stop.reason.unknown`. Ikke stoppet: tom liste.
 */
export function stopReasons(review: StopReview): UiKey[] {
  if (!isStopped(review)) return [];
  const { known, unknown } = ordered(review.reasonCodes, STOP_REASON_ORDER);
  const keys: UiKey[] = [];
  let neutral = unknown || known.length === 0;
  for (const code of known) {
    const key = stopReasonKey(code, review);
    if (key === null) neutral = true;
    else if (!keys.includes(key)) keys.push(key);
  }
  if (neutral) keys.push("stop.reason.unknown");
  return keys;
}

/**
 * Merknadene fra analysen (flag_codes) over sjekklista, for alle roller.
 * Lampene og «Korriger bildet» finnes bare i Kveldsbilde: lampeteksten
 * vises ikke for andre tjenester, og `single_run` faar da den generelle
 * teksten. Uenig bildetype er en merknad bare i styling. Ukjent kode:
 * `note.unknown`. Ingen koder: tom liste (ingen boks).
 */
export function analysisNotes(review: Pick<JobReviewDetail, "flagCodes" | "presetId">): UiKey[] {
  const service = serviceOf(review.presetId);
  const { known, unknown } = ordered(review.flagCodes, NOTE_ORDER);
  const keys: UiKey[] = [];
  const add = (key: UiKey | null) => {
    if (key !== null && !keys.includes(key)) keys.push(key);
  };
  for (const code of known) {
    switch (code) {
      case "analysis_light_unconfirmed":
        add(service === "kveldsbilde" ? "note.analysis_light_unconfirmed" : null);
        break;
      case "single_run":
        add(service === "kveldsbilde" ? "note.single_run.kveldsbilde" : "note.analysis_other");
        break;
      case "image_type_disagreement":
        add(service === "styling" ? "note.image_type_disagreement.styling" : "note.analysis_other");
        break;
      default:
        add(`note.${code}`);
    }
  }
  if (unknown) add("note.unknown");
  return keys;
}
