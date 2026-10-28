import type {
  DecisionOutcome,
  DecisionRequest,
  JobReviewDetail,
  LocalCandidate,
  LocalInstruction,
} from "./api";
import { correctionResult, type CorrectionResult } from "./correction.ts";
import type { CodeGroup, UiKey } from "./i18n";
import { serializeMark, type Mark, type StudioState } from "./studio.ts";

/**
 * «Marker og beskriv» i Kveldsbilde (FE-3, Dag 58). Kontrakten er backend
 * BE-7b (`dag58-lokal`, 8512789): `correct` med `local`, og `choose` for aa
 * bytte kandidat. Rene regler, saa de kan testes med node --test. Bare
 * type-importer fra api.ts (den kaster ved import uten NEXT_PUBLIC_API_BASE).
 *
 * - Valget vises naar `correction.local_accepted` er sant (ingen eget
 *   frontend-flagg, Petter 28.10).
 * - Én boks (B1): en ny boks erstatter den forrige (keepOneBox).
 * - Fire instrukser; Legg til krever en tekst paa 1–200 tegn.
 * - To kandidater; kandidat 1 er valgt fra start, og «Bruk denne» sender
 *   `choose` (teller ikke som runde). Backend svarer 200 med en gang, ikke
 *   202 (AVVIK 2): siden henter review paa nytt.
 */

export const LOCAL_INSTRUCTIONS: readonly LocalInstruction[] = ["fire_out", "light", "remove", "add"];

export const LOCAL_INSTRUCTION_KEYS: Record<LocalInstruction, UiKey> = {
  fire_out: "local.fireOut",
  light: "local.light",
  remove: "local.remove",
  add: "local.add",
};

/** Hoeyst saa mange tegn i Legg til (backend `TEXT_MAX`). */
export const LOCAL_TEXT_MAX = 200;

export type LocalBox = Extract<Mark, { kind: "box" }>;

/** Kan «Marker og beskriv» velges? Bare naar review-svaret sier det. */
export function localShown(review: Pick<JobReviewDetail, "correction">): boolean {
  return review.correction.localAccepted === true;
}

/** Boksen paa lerretet, eller null. */
export function localBox(studio: StudioState): LocalBox | null {
  const boxes = studio.marks.filter((m): m is LocalBox => m.kind === "box");
  return boxes[boxes.length - 1] ?? null;
}

/**
 * Én boks (B1): har lerretet laget en boks til, staar bare den nyeste
 * igjen. «Angre» gaar da tilbake til den forrige boksen (den ligger i `past`).
 */
export function keepOneBox(studio: StudioState): StudioState {
  const box = localBox(studio);
  if (box === null || studio.marks.length === 1) return studio;
  return { ...studio, marks: [box] };
}

/** Teksten slik backend renser den: linjeskift og mellomrom samlet, uten mellomrom i endene. */
export function cleanLocalText(text: string): string {
  return text.split(/\s+/).filter((w) => w !== "").join(" ");
}

/** Hva som mangler foer «Lag 2 forslag» kan trykkes; null naar alt er klart. */
export type LocalMissing = "box" | "instruction" | "text" | "textTooLong" | null;

export function localMissing(opts: {
  studio: StudioState;
  instruction: LocalInstruction | null;
  text: string;
}): LocalMissing {
  if (localBox(opts.studio) === null) return "box";
  if (opts.instruction === null) return "instruction";
  if (opts.instruction === "add") {
    const text = cleanLocalText(opts.text);
    if (text === "") return "text";
    if (text.length > LOCAL_TEXT_MAX) return "textTooLong";
  }
  return null;
}

export const LOCAL_MISSING_KEYS: Record<Exclude<LocalMissing, null>, UiKey> = {
  box: "local.missingBox",
  instruction: "local.missingInstruction",
  text: "local.missingText",
  textTooLong: "local.missingTextTooLong",
};

/**
 * Body for «Marker og beskriv»: `correct` med én boks og instruksen, teksten
 * bare ved Legg til. Aldri overrides, choices eller peissvar (backend gir
 * 400 local_exclusive). null naar noe mangler (localMissing).
 */
export function buildLocalCorrection(
  review: Pick<JobReviewDetail, "version">,
  studio: StudioState,
  instruction: LocalInstruction | null,
  text: string
): DecisionRequest | null {
  const box = localBox(studio);
  if (box === null || instruction === null || localMissing({ studio, instruction, text }) !== null) return null;
  const shape = serializeMark(box);
  if (shape.shape !== "box") return null;
  const body: DecisionRequest = {
    action: "correct",
    local: { shape: { shape: "box", points: shape.points }, instruction },
  };
  if (instruction === "add") body.local!.text = cleanLocalText(text);
  if (review.version !== null) body.expected_version = review.version;
  return body;
}

/** Body for «Bruk denne» (A1). */
export function buildChoose(review: Pick<JobReviewDetail, "version">, candidate: 1 | 2): DecisionRequest {
  const body: DecisionRequest = { action: "choose", candidate };
  if (review.version !== null) body.expected_version = review.version;
  return body;
}

/** Kandidatene som vises under bildet, eller null uten lokal runde. */
export interface CandidatesView {
  candidates: LocalCandidate[];
  /** Kandidaten i bruk; uten `chosen` fra backend er det kandidat 1. */
  chosen: 1 | 2;
  /** «Bruk denne» kan trykkes (`choose` i allowed_actions). */
  canChoose: boolean;
}

export function candidatesView(
  review: Pick<JobReviewDetail, "local" | "allowedActions" | "status">
): CandidatesView | null {
  const local = review.local ?? null;
  if (local === null || review.status !== "awaiting_approval") return null;
  return {
    candidates: local.candidates,
    chosen: local.chosen ?? 1,
    canChoose: review.allowedActions.includes("choose") && local.candidates.length >= 2,
  };
}

/**
 * «2 forslag · bare det markerte endres · runder igjen: X av 3». Taket er
 * `correction.max_rounds` fra backend; mangler det, staar bare antallet igjen.
 */
export function localInfo(review: Pick<JobReviewDetail, "correction">): {
  key: UiKey;
  vars: { n: number; max?: number };
} {
  const { roundsLeft, maxRounds } = review.correction;
  return typeof maxRounds === "number" && maxRounds > 0
    ? { key: "local.info", vars: { n: roundsLeft, max: maxRounds } }
    : { key: "local.infoNoMax", vars: { n: roundsLeft } };
}

/**
 * Kodene fra backend som har egen tekst for «Marker og beskriv» (gruppen
 * `localError`). `raw_missing` og `raw_mismatch` har en annen tekst i
 * lysstyrken, saa de slaas opp her foerst.
 */
export const LOCAL_ERROR_TEXT_CODES: readonly string[] = [
  "local_not_accepted",
  "local_exclusive",
  "local_not_supported",
  "shape_not_supported",
  "shape_invalid",
  "instruction_invalid",
  "text_required",
  "text_too_long",
  "text_not_accepted",
  "raw_missing",
  "raw_mismatch",
  "candidate_invalid",
  "candidate_already_chosen",
  "candidate_missing",
  "choose_failed",
];

/** 400 for den lokale body-en: boksen og teksten staar, saa megleren kan rette og proeve igjen. */
const LOCAL_RETRY: ReadonlySet<string> = new Set([
  "shape_not_supported",
  "shape_invalid",
  "instruction_invalid",
  "text_required",
  "text_too_long",
  "text_not_accepted",
]);

function withLocalGroup(code: string | null, fallback: CodeGroup): { group: CodeGroup; code: string | null } {
  return { group: code !== null && LOCAL_ERROR_TEXT_CODES.includes(code) ? "localError" : fallback, code };
}

/**
 * Hva siden gjoer etter svaret paa «Lag 2 forslag»: som «Lag nytt bilde»
 * (correctionResult), men 400 for formen og teksten gir `retry` (markeringen
 * staar), og kodene med egen tekst slaas opp i `localError`.
 */
export function localResult(out: DecisionOutcome): CorrectionResult {
  if (out.kind === "blocked" && out.code !== null && LOCAL_RETRY.has(out.code)) {
    return { kind: "retry", message: withLocalGroup(out.code, "decisionError") };
  }
  const result = correctionResult(out);
  if (result.kind === "retry" || result.kind === "blocked" || result.kind === "limit") {
    return { ...result, message: withLocalGroup(result.message.code, result.message.group) };
  }
  return result;
}

/**
 * Hva siden gjoer etter «Bruk denne» (200 med en gang):
 * - reload: 200, eller 409 status_changed/candidate_already_chosen; hent review paa nytt.
 * - message: 400/409/503 med melding (f.eks. candidate_missing, choose_failed).
 * - not_found: 404.
 */
export type ChooseResult =
  | { kind: "reload"; message: { group: CodeGroup; code: string | null } | null }
  | { kind: "message"; message: { group: CodeGroup; code: string | null }; refetch: boolean }
  | { kind: "not_found" };

export function chooseResult(out: DecisionOutcome): ChooseResult {
  switch (out.kind) {
    case "updated":
    case "poll":
      return { kind: "reload", message: null };
    case "status_changed":
      return { kind: "reload", message: { group: "decisionError", code: "status_changed" } };
    case "blocked":
      if (out.code === "candidate_already_chosen") {
        return { kind: "reload", message: withLocalGroup(out.code, "decisionError") };
      }
      return { kind: "message", message: withLocalGroup(out.code, "decisionError"), refetch: true };
    case "unavailable":
      return { kind: "message", message: withLocalGroup(out.code, "decisionError"), refetch: false };
    case "not_found":
      return { kind: "not_found" };
    case "error":
      return { kind: "message", message: { group: "decisionError", code: null }, refetch: false };
  }
}

/**
 * Meldingen naar siste retterunde feilet: den norske teksten for koden i
 * `correction.last_round_error` (f.eks. «Markér et mindre område.»), ellers
 * samme melding som foer.
 */
export const LOCAL_ROUND_ERRORS: readonly string[] = ["mask_empty", "effect_too_large", "no_candidate"];

export function roundFailedMessage(
  review: Pick<JobReviewDetail, "correction">
): { group: "localRoundError"; code: string } | { key: UiKey } {
  const code = review.correction.lastRoundError ?? null;
  if (code !== null && LOCAL_ROUND_ERRORS.includes(code)) return { group: "localRoundError", code };
  return { key: "correct.roundFailed" };
}
