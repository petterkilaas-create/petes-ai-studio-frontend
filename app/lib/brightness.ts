import type {
  BrightnessStep,
  DecisionAction,
  DecisionOutcome,
  JobReviewDetail,
  ReviewBrightness,
  ReviewBrightnessStep,
} from "./api";
import type { CompareVariant } from "./compare.ts";
import { t, type Locale, type UiKey } from "./i18n/index.ts";

/**
 * Lysstyrke med fem trinn paa godkjenningssiden (TG-NEW-147). Rene
 * funksjoner, saa de kan testes med node --test; bare type-import fra
 * api.ts, som kaster ved import naar NEXT_PUBLIC_API_BASE mangler.
 *
 * Kontrakt: ~/dev/_handoff/KONTRAKT_LYSSTYRKE.md. Bildet til et trinn er
 * alltid trinnets `preview_url` fra backend, aldri et CSS-filter, saa det
 * megleren ser, er det hun laster ned. `null` gir plassholder, uten
 * tilbakefall til et annet felt. Frontend tolker aldri filnavn.
 */

export const BRIGHTNESS_MIN = -2;
export const BRIGHTNESS_MAX = 2;

/** Navnet paa trinnet kommer fra `step` og ordlista. Midttrinnet heter «Standard», ikke «Original». */
const STEP_KEYS: Record<BrightnessStep, UiKey> = {
  [-2]: "brightness.step.m2",
  [-1]: "brightness.step.m1",
  0: "brightness.step.0",
  1: "brightness.step.p1",
  2: "brightness.step.p2",
};

export function stepName(locale: Locale, step: BrightnessStep): string {
  return t(locale, STEP_KEYS[step]);
}

/**
 * Hva siden viser under bildet:
 * - none: ingen lysstyrke (`available: false`, ingen godkjenning, eller bare lesing). Siden som foer.
 * - control: slideren. `locked` naar en annen variant enn gjeldende runde er valgt.
 * - approved: det godkjente trinnet som tekst («Lysstyrke: Mørk»).
 */
export type BrightnessView =
  | { kind: "none" }
  | { kind: "control"; steps: ReviewBrightnessStep[]; defaultStep: BrightnessStep; locked: boolean }
  | { kind: "approved"; step: BrightnessStep };

export function brightnessView(
  review: Pick<JobReviewDetail, "status" | "allowedActions" | "brightness">,
  shown: Pick<CompareVariant, "current" | "raw"> | null
): BrightnessView {
  const b = review.brightness;
  if (!b.available) return { kind: "none" };
  if (review.status === "succeeded") {
    return b.approvedStep !== null ? { kind: "approved", step: b.approvedStep } : { kind: "none" };
  }
  if (
    review.status !== "awaiting_approval" ||
    !review.allowedActions.includes("approve") ||
    b.defaultStep === null ||
    b.steps.length === 0
  ) {
    return { kind: "none" };
  }
  const currentShown = shown !== null && shown.current && !shown.raw;
  return { kind: "control", steps: b.steps, defaultStep: b.defaultStep, locked: !currentShown };
}

/** Valgt trinn: brukerens valg, ellers `default_step`. Ny runde nullstiller valget (siden). */
export function selectedStep(
  view: Extract<BrightnessView, { kind: "control" }>,
  chosen: BrightnessStep | null
): BrightnessStep {
  return chosen ?? view.defaultStep;
}

/** Trinnets merkede forhaandsvisning, eller null (plassholder). Aldri et annet felt. */
export function brightnessResultUrl(brightness: Pick<ReviewBrightness, "steps">, step: BrightnessStep): string | null {
  return brightness.steps.find((s) => s.step === step)?.previewUrl ?? null;
}

/** Lenkene som forhaandslastes naar hovedbildet er lastet: de andre trinnene, uten null. */
export function preloadUrls(steps: ReviewBrightnessStep[], shownStep: BrightnessStep): string[] {
  return steps.flatMap((s) => (s.step !== shownStep && s.previewUrl !== null ? [s.previewUrl] : []));
}

/**
 * «Rått fra modellen» (bare admin) skjules naar lysstyrke finnes, fordi
 * Standard er det samme bildet (KONTRAKT_LYSSTYRKE, valg (a)). Petter 02.10:
 * alle rå varianter, ogsaa eldre runder.
 */
export function visibleVariants(
  variants: CompareVariant[],
  brightness: Pick<ReviewBrightness, "available">
): CompareVariant[] {
  return brightness.available ? variants.filter((v) => !v.raw) : variants;
}

/** Hvilken knapp som jobber: «Godkjenner …» bare mens et approve-kall pågår. */
export function isApproving(pending: DecisionAction | null): boolean {
  return pending === "approve";
}

/** Melding og videre gang naar backend sier nei (409, 422). */
export interface BlockedResult {
  message: { key: UiKey } | { group: "decisionError"; code: string | null };
  /** Ingen ny handling foer siden er lastet paa nytt. */
  block: boolean;
  /** Hent review paa nytt (jobben er endret). */
  refetch: boolean;
}

/** Trinnet kan ikke lages, men godkjenning paa `default_step` kan fortsatt gå. */
const STEP_RETRY_CODES: ReadonlySet<string> = new Set(["raw_missing", "raw_mismatch"]);

/**
 * KONTRAKT_LYSSTYRKE §3. 422 og trinn som ikke kan lages, laaser ikke
 * knappene, saa megleren kan velge et annet trinn. `brightness_unavailable`
 * henter siden paa nytt. Andre 409 laaser som foer.
 */
export function blockedResult(out: Extract<DecisionOutcome, { kind: "blocked" }>): BlockedResult {
  if (out.code === "invalid_decision" && out.fields.includes("brightness_step")) {
    return { message: { key: "brightness.invalid" }, block: false, refetch: false };
  }
  const message = { group: "decisionError" as const, code: out.code };
  if (out.code === "invalid_decision") return { message, block: false, refetch: false };
  if (out.code !== null && STEP_RETRY_CODES.has(out.code)) return { message, block: false, refetch: false };
  if (out.code === "brightness_unavailable") return { message, block: false, refetch: true };
  return { message, block: true, refetch: false };
}
