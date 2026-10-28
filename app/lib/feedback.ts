import type { JobReviewDetail, JobSummary } from "./api";
import type { UiKey } from "./i18n/index.ts";
import { checklistFor, type ChecklistId } from "./checklist.ts";
import { isRejectedByReviewer } from "./statusVariants.ts";

/**
 * Tilbakemelding fra megleren (Dag 58, Petter 28.10): 1–5 stjerner, raske
 * knapper per tjeneste og «Fortell oss mer» (høyst 500 tegn) etter «Godkjenn»
 * eller «Avvis», og stjernene i Historikk. Frivillig: ingenting her stopper
 * godkjenningen. Kontrakten er RAPPORT_FEEDBACK_BE.md (POST og GET
 * /v1/jobs/{id}/feedback, `feedback_rating` i GET /v1/jobs); backend godtar
 * bare kodene under. Hver innsending
 * er en ny rad, og den siste gjelder (valg 3A: Historikk sender knappene og
 * teksten fra forrige gang med de nye stjernene). Rene funksjoner; bare
 * type-import fra api.ts (den kaster ved import naar NEXT_PUBLIC_API_BASE mangler).
 */

export const FEEDBACK_TEXT_MAX = 500;

export type FeedbackRating = 1 | 2 | 3 | 4 | 5;

export const RATINGS: readonly FeedbackRating[] = [1, 2, 3, 4, 5];

export type FeedbackTag =
  | "sky"
  | "window_light"
  | "lamps"
  | "colours"
  | "added_removed"
  | "framing"
  | "furniture"
  | "style"
  | "fixtures_missing"
  | "light"
  | "trees_leaves"
  | "snow"
  | "added"
  | "other";

/**
 * Knappene per tjeneste, i rekkefoelgen Petter ga, og «Annet» sist for alle.
 * Klart vaer og ukjent oppskrift: bare «Annet» (valg 2A).
 */
export const FEEDBACK_TAGS: Readonly<Record<ChecklistId, readonly FeedbackTag[]>> = {
  kveldsbilde: ["sky", "window_light", "lamps", "colours", "added_removed", "framing", "other"],
  styling: ["furniture", "style", "fixtures_missing", "framing", "light", "other"],
  aarstider: ["trees_leaves", "snow", "sky", "added", "other"],
  blaa_himmel: ["other"],
};

const ONLY_OTHER: readonly FeedbackTag[] = ["other"];

/** Teksten paa knappen; samme kode har samme tekst i alle tjenester. */
export const TAG_KEYS: Readonly<Record<FeedbackTag, UiKey>> = {
  sky: "feedback.tag.sky",
  window_light: "feedback.tag.window_light",
  lamps: "feedback.tag.lamps",
  colours: "feedback.tag.colours",
  added_removed: "feedback.tag.added_removed",
  framing: "feedback.tag.framing",
  furniture: "feedback.tag.furniture",
  style: "feedback.tag.style",
  fixtures_missing: "feedback.tag.fixtures_missing",
  light: "feedback.tag.light",
  trees_leaves: "feedback.tag.trees_leaves",
  snow: "feedback.tag.snow",
  added: "feedback.tag.added",
  other: "feedback.tag.other",
};

/** Knappene for jobben, valgt paa oppskriften som sjekklista (checklistFor). */
export function feedbackTags(presetId: string | null | undefined): readonly FeedbackTag[] {
  const id = checklistFor(presetId);
  return id === null ? ONLY_OTHER : FEEDBACK_TAGS[id];
}

/** Legger til eller tar bort en knapp. Knapper tjenesten ikke har, legges aldri til. */
export function toggleTag(
  allowed: readonly FeedbackTag[],
  chosen: readonly FeedbackTag[],
  tag: FeedbackTag
): FeedbackTag[] {
  if (!allowed.includes(tag)) return [...chosen];
  const next = chosen.includes(tag) ? chosen.filter((t) => t !== tag) : [...chosen, tag];
  // Samme rekkefoelge som knappene, saa body ikke avhenger av klikkrekkefoelgen.
  return allowed.filter((t) => next.includes(t));
}

/** Lengden slik backend teller (tegn, ikke UTF-16), etter trim. */
export function feedbackLength(text: string): number {
  return [...text.trim()].length;
}

export function feedbackTooLong(text: string): boolean {
  return feedbackLength(text) > FEEDBACK_TEXT_MAX;
}

/** Body for POST /v1/jobs/{id}/feedback. Tomme felt sendes ikke. */
export interface FeedbackRequest {
  rating?: FeedbackRating;
  tags?: FeedbackTag[];
  text?: string;
  round?: number;
}

export interface FeedbackDraft {
  rating: FeedbackRating | null;
  tags: readonly FeedbackTag[];
  text: string;
}

export const EMPTY_DRAFT: FeedbackDraft = { rating: null, tags: [], text: "" };

/**
 * Body for innsendingen, eller null naar «Send» skal vaere av: ingenting
 * valgt eller skrevet (backend krever minst ett av de tre), eller for lang
 * tekst. Ingenting kuttes i stillhet.
 */
export function buildFeedback(
  draft: FeedbackDraft,
  allowed: readonly FeedbackTag[],
  round: number | null
): FeedbackRequest | null {
  const text = draft.text.trim();
  if (feedbackTooLong(text)) return null;
  const tags = allowed.filter((t) => draft.tags.includes(t));
  if (draft.rating === null && tags.length === 0 && text === "") return null;
  const body: FeedbackRequest = {};
  if (draft.rating !== null) body.rating = draft.rating;
  if (tags.length > 0) body.tags = tags;
  if (text !== "") body.text = text;
  if (round !== null) body.round = round;
  return body;
}

/** Siste innsending fra GET /v1/jobs/{id}/feedback. */
export interface JobFeedback {
  rating: FeedbackRating | null;
  tags: FeedbackTag[];
  text: string;
  round: number | null;
}

const ALL_TAGS: ReadonlySet<string> = new Set(Object.keys(TAG_KEYS));

export function ratingOrNull(value: unknown): FeedbackRating | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 5
    ? (value as FeedbackRating)
    : null;
}

/**
 * Tolker svaret paa GET. null: ingen tilbakemelding (tomt svar, `null`, eller
 * en rad uten noe innhold). Ukjente knapper hoppes over.
 */
export function parseFeedback(body: unknown): JobFeedback | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
  const raw = body as Record<string, unknown>;
  const rating = ratingOrNull(raw.rating);
  const tags = Array.isArray(raw.tags)
    ? raw.tags.filter((t): t is FeedbackTag => typeof t === "string" && ALL_TAGS.has(t))
    : [];
  const text = typeof raw.text === "string" ? raw.text : "";
  const round = typeof raw.round === "number" && Number.isInteger(raw.round) && raw.round >= 0 ? raw.round : null;
  if (rating === null && tags.length === 0 && text === "") return null;
  return { rating, tags, text, round };
}

/**
 * Valg 3A: nye stjerner fra Historikk sendes med knappene, teksten og runden
 * fra forrige innsending, saa raden som gjelder er hel. Knapper tjenesten
 * ikke har (lenger), og for lang tekst, tas ikke med.
 */
export function changeRating(
  previous: JobFeedback | null,
  rating: FeedbackRating,
  allowed: readonly FeedbackTag[]
): FeedbackRequest {
  const body: FeedbackRequest = { rating };
  const tags = allowed.filter((t) => previous?.tags.includes(t));
  if (tags.length > 0) body.tags = tags;
  const text = previous?.text.trim() ?? "";
  if (text !== "" && !feedbackTooLong(text)) body.text = text;
  if (previous?.round != null) body.round = previous.round;
  return body;
}

export type FeedbackResult = { kind: "ok" } | { kind: "invalid"; code: string | null } | { kind: "error" };

type FeedbackReview = Pick<JobReviewDetail, "status" | "code" | "decisions" | "isOwner" | "mediaDeletedAt" | "images">;

/** Det finnes et bilde som kan vurderes (ikke «Ja, avbryt» i porten, ikke «Ikke laget»). */
function hasResult(review: FeedbackReview): boolean {
  return review.images.previewUrl !== null || (review.images.rounds?.length ?? 0) > 0;
}

/**
 * Kortet paa godkjenningssiden: "send" for eieren (backend godtar bare
 * eieren, ogsaa for admin), "read" for admin paa en annen brukers jobb (bare
 * lesing, som review; Petter 28.10), ellers null. Bare etter «Godkjenn»
 * (succeeded) eller «Avvis» (failed med reject som siste avgjoerelse), naar
 * et bilde ble laget og bildene ikke er slettet.
 */
export function feedbackMode(review: FeedbackReview): "send" | "read" | null {
  if (review.mediaDeletedAt != null) return null;
  if (review.code === "not_created" || !hasResult(review)) return null;
  const decided =
    review.status === "succeeded" || (review.status === "failed" && review.decisions.at(-1)?.action === "reject");
  if (!decided) return null;
  return review.isOwner ? "send" : "read";
}

/** Runden som vurderes: gjeldende runde i `images.rounds`, ellers null. */
export function feedbackRound(review: Pick<JobReviewDetail, "images">): number | null {
  return review.images.rounds?.find((r) => r.current)?.round ?? null;
}

/**
 * Stjernene i Historikk (valg 1A: `feedback_rating` i lista): paa jobber som
 * er godkjent eller avvist av megleren, og bare naar stjerner er gitt, ogsaa
 * etter at bildene er slettet (tilbakemeldingen lagres i 12 maaneder). Bare
 * eieren kan endre dem (`editable`); admin ser andres stjerner naar lista har dem.
 */
export function historyRating(
  job: Pick<JobSummary, "status" | "code" | "isOwner" | "feedbackRating">
): { rating: FeedbackRating; editable: boolean } | null {
  if (job.status !== "succeeded" && !isRejectedByReviewer(job)) return null;
  const rating = job.feedbackRating ?? null;
  return rating === null ? null : { rating, editable: job.isOwner };
}
