import type {
  CorrectionOverrides,
  DecisionOutcome,
  DecisionRequest,
  JobReviewDetail,
  ReviewLight,
} from "./api";
import type { CodeGroup } from "./i18n";
import type { FireplaceAnswer } from "./review";

/**
 * Rene regler for «Rett» paa godkjenningssiden (2d-2b), skilt ut saa de kan
 * testes uten React (node --test). Bare type-importer: api.ts kaster ved
 * import naar NEXT_PUBLIC_API_BASE mangler.
 *
 * Brukeren kan slaa paa kandidater (ustabile og avviste) og slaa av
 * godkjente (V-1 a). Tilstanden holdes paa `key`; body bygges fra `run` og
 * `id`, aldri ved aa tolke `key`.
 */

export type Lights = JobReviewDetail["lights"];

/** Bryterne i Rett-modus: key -> paa. */
export type Toggles = Readonly<Record<string, boolean>>;

/** Paa for approved/promoted, av for disabled/candidate (og ukjent). */
export function initialOn(light: ReviewLight): boolean {
  return light.state === "approved" || light.state === "promoted";
}

export function initialToggles(lights: Lights): Toggles {
  const toggles: Record<string, boolean> = {};
  for (const light of [...lights.approved, ...lights.unstable, ...lights.rejected]) {
    if (light.key !== null) toggles[light.key] = initialOn(light);
  }
  return toggles;
}

function isCandidateRun(run: number | null): run is 1 | 2 {
  return run === 1 || run === 2;
}

/**
 * Kan brukeren endre lyskilden? Krever editable, key og id. Kandidater maa
 * i tillegg ha run 1 eller 2, fordi backend adresserer dem med {run, id}.
 */
export function canToggle(light: ReviewLight, candidate: boolean): boolean {
  if (!light.editable || light.key === null || light.id === null) return false;
  return !candidate || isCandidateRun(light.run);
}

export function isOn(light: ReviewLight, toggles: Toggles): boolean {
  if (light.key !== null && Object.hasOwn(toggles, light.key)) return toggles[light.key];
  return initialOn(light);
}

/** Ny tilstand etter et trykk. Uendret objekt naar lyskilden er laast. */
export function setToggle(
  toggles: Toggles,
  light: ReviewLight,
  candidate: boolean,
  on: boolean
): Toggles {
  if (!canToggle(light, candidate) || light.key === null) return toggles;
  return { ...toggles, [light.key]: on };
}

/**
 * Hele avviket fra analysen (kontrakten 2d-2a §1): godkjente som er av gaar
 * i disable, kandidater som er paa gaar i promote. Laaste lyskilder tas
 * aldri med. Rekkefoelgen foelger listene.
 */
export function buildOverrides(lights: Lights, toggles: Toggles): CorrectionOverrides {
  const disable: string[] = [];
  for (const light of lights.approved) {
    if (canToggle(light, false) && light.id !== null && !isOn(light, toggles)) {
      disable.push(light.id);
    }
  }
  const promote: { run: number; id: string }[] = [];
  for (const light of [...lights.unstable, ...lights.rejected]) {
    if (
      canToggle(light, true) &&
      light.id !== null &&
      isCandidateRun(light.run) &&
      isOn(light, toggles)
    ) {
      promote.push({ run: light.run, id: light.id });
    }
  }
  return { promote, disable, add: [] };
}

/** Peisspoersmaalet i Rett-modus: bare naar jobben har peis (eller uenighet). */
export function correctionFireplaceShown(fireplace: JobReviewDetail["fireplace"]): boolean {
  return fireplace.present || fireplace.disagreement;
}

/** Forrige peissvar, som forhaandsvalg. */
export function previousFireplaceAnswer(fireplace: JobReviewDetail["fireplace"]): FireplaceAnswer {
  return fireplace.answer === "yes" || fireplace.answer === "no" ? fireplace.answer : null;
}

/**
 * Body for «Lag nytt bilde». Peissvaret er bare med naar spoersmaalet vises.
 * `expected_version` er versjonen i review-svaret (TG-NEW-130), utelatt uten version.
 */
export function buildCorrection(
  review: Pick<JobReviewDetail, "lights" | "version">,
  toggles: Toggles,
  fireplaceShown: boolean,
  answer: FireplaceAnswer
): DecisionRequest {
  const body: DecisionRequest = { action: "correct", overrides: buildOverrides(review.lights, toggles) };
  if (fireplaceShown && answer !== null) body.fireplace_fire = answer;
  if (review.version !== null) body.expected_version = review.version;
  return body;
}

/**
 * Bekreftelsen kreves naar minst én kandidat er slaatt paa. Hele avviket
 * sendes hver gang, saa det gjelder ogsaa kandidater fra forrige runde.
 */
export function needsConfirmation(overrides: CorrectionOverrides): boolean {
  return overrides.promote.length > 0;
}

/** «Lag nytt bilde» kan trykkes. Uendrede valg er lov (V-3: ny seed). */
export function canSubmitCorrection(opts: {
  overrides: CorrectionOverrides;
  confirmed: boolean;
  fireplaceShown: boolean;
  answer: FireplaceAnswer;
}): boolean {
  if (needsConfirmation(opts.overrides) && !opts.confirmed) return false;
  if (opts.fireplaceShown && opts.answer === null) return false;
  return true;
}

export interface CorrectionControls {
  /** Vis «Rett»: correct er lov, og det er runder igjen. */
  show: boolean;
  roundsLeft: number;
  roundFailed: boolean;
}

export function correctionControls(
  review: Pick<JobReviewDetail, "allowedActions" | "correction">
): CorrectionControls {
  const { roundsLeft, lastRoundFailed } = review.correction;
  return {
    show: review.allowedActions.includes("correct") && roundsLeft > 0,
    roundsLeft,
    roundFailed: lastRoundFailed,
  };
}

/** Melding som kode i en ordliste-gruppe. */
export interface CodeMessage {
  group: CodeGroup;
  code: string | null;
}

/**
 * Hva siden gjoer etter svaret paa «Lag nytt bilde»:
 * - poll (202): laas knappene, poll, hent review paa nytt.
 * - reload (409 status_changed, eller 200): last paa nytt med kort melding.
 * - limit (409 correction_limit): «Du har brukt rundene dine.», Rett forsvinner.
 * - blocked (409 original_missing/action_not_allowed): melding, knappene laases.
 * - retry (422, 503, annen feil): melding, valgene staar.
 */
export type CorrectionResult =
  | { kind: "poll" }
  | { kind: "reload"; message: CodeMessage | null }
  | { kind: "limit"; message: CodeMessage }
  | { kind: "blocked"; message: CodeMessage }
  | { kind: "retry"; message: CodeMessage }
  | { kind: "not_found" };

export function correctionResult(out: DecisionOutcome): CorrectionResult {
  switch (out.kind) {
    case "poll":
      return { kind: "poll" };
    case "updated":
      return { kind: "reload", message: null };
    case "status_changed":
      return { kind: "reload", message: { group: "decisionError", code: "status_changed" } };
    case "blocked":
      if (out.code === "correction_limit") {
        return { kind: "limit", message: { group: "decisionError", code: out.code } };
      }
      if (out.code === "invalid_decision") {
        return out.overrideCode !== null
          ? { kind: "retry", message: { group: "overrideCode", code: out.overrideCode } }
          : { kind: "retry", message: { group: "decisionError", code: out.code } };
      }
      return { kind: "blocked", message: { group: "decisionError", code: out.code } };
    case "unavailable":
      return { kind: "retry", message: { group: "decisionError", code: out.code } };
    case "not_found":
      return { kind: "not_found" };
    case "error":
      return { kind: "retry", message: { group: "decisionError", code: null } };
  }
}
