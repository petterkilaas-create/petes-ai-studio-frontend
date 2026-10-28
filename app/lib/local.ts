import type {
  DecisionOutcome,
  DecisionRequest,
  JobReviewDetail,
  LocalEditNumber,
  LocalEditRequest,
  LocalInstruction,
} from "./api";
import { correctionResult, type CorrectionResult } from "./correction.ts";
import type { CodeGroup, UiKey } from "./i18n";
import { addBox, serializeMark, type ImagePoint, type Mark, type StudioState } from "./studio.ts";

/**
 * «Marker og beskriv», studio v2 (Dag 58). Kontrakten er backend
 * STUDIO_V2_BE (RAPPORT_STUDIO_V2_BE.md, valgene A1, B1, C1 og D1): `correct`
 * med `local: {edits: [...]}` (1–4) eller `local: {retry: k}`, og
 * `local.edits[]` med status per endring i review. Rene regler, saa de kan
 * testes med node --test. Bare type-importer fra api.ts (den kaster ved
 * import uten NEXT_PUBLIC_API_BASE).
 *
 * - Valget vises naar `correction.local_accepted` er sant (ingen eget
 *   frontend-flagg).
 * - Inntil 4 bokser, nummerert 1–4 i rekkefoelgen de ble tegnet. Hver boks
 *   har sin instruks og (ved Legg til) sin tekst.
 * - Bokser som overlapper, avvises her foer de sendes. Margen er den backend
 *   bruker foer claim (AVVIK 3): 7 % av kortsiden rundt hver boks, 10 % for
 *   Tenn. Ny boks sjekkes med 7 %; foer innsending sjekkes med instruksen.
 * - Ett resultat (ingen kandidater). Etter runden har hver endring ✓ eller
 *   en feilmelding, og «Prøv igjen» sender `retry` (teller som runde).
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
/** Hoeyst saa mange endringer per runde (backend `MAX_EDITS`). */
export const MAX_LOCAL_EDITS = 4;
/** Margen rundt boksen, i broek av kortsiden (backend: E utvides med 7 %, Tenn 10 %). */
export const EDIT_MARGIN = 0.07;
export const EDIT_MARGIN_LIGHT = 0.1;

export type LocalBox = Extract<Mark, { kind: "box" }>;

/** Instruksen og teksten for én boks (noekkelen er boksens id). */
export interface EditDraft {
  instruction: LocalInstruction | null;
  text: string;
}

export type EditDrafts = Readonly<Record<number, EditDraft>>;

export const EMPTY_DRAFT: EditDraft = { instruction: null, text: "" };

/** Kan «Marker og beskriv» velges? Bare naar review-svaret sier det. */
export function localShown(review: Pick<JobReviewDetail, "correction">): boolean {
  return review.correction.localAccepted === true;
}

/** Boksene paa lerretet i rekkefoelgen de ble tegnet (nummer 1, 2, …). */
export function localBoxes(studio: StudioState): LocalBox[] {
  return studio.marks.filter((m): m is LocalBox => m.kind === "box");
}

/** Nummeret (1–4) boksen har i lista; 0 naar den ikke finnes. */
export function boxNumber(studio: StudioState, id: number): number {
  return localBoxes(studio).findIndex((b) => b.id === id) + 1;
}

export function draftFor(drafts: EditDrafts, id: number): EditDraft {
  return drafts[id] ?? EMPTY_DRAFT;
}

/** Margen i x og y (broek av bredden og hoeyden) for en margin i broek av kortsiden. */
function margins(margin: number, aspect: number): { mx: number; my: number } {
  const a = Number.isFinite(aspect) && aspect > 0 ? aspect : 3 / 2;
  // Kortsiden er hoeyden naar bildet er liggende (a >= 1), ellers bredden.
  return a >= 1 ? { mx: margin / a, my: margin } : { mx: margin, my: margin * a };
}

export function editMargin(instruction: LocalInstruction | null): number {
  return instruction === "light" ? EDIT_MARGIN_LIGHT : EDIT_MARGIN;
}

/**
 * Overlapper boksene naar hver utvides med sin margin? Kanter som bare
 * beroerer hverandre, overlapper ikke.
 */
export function boxesOverlap(
  a: { from: ImagePoint; to: ImagePoint },
  b: { from: ImagePoint; to: ImagePoint },
  marginA: number,
  marginB: number,
  aspect: number
): boolean {
  const ma = margins(marginA, aspect);
  const mb = margins(marginB, aspect);
  const ax0 = a.from.x - ma.mx;
  const ax1 = a.to.x + ma.mx;
  const ay0 = a.from.y - ma.my;
  const ay1 = a.to.y + ma.my;
  const bx0 = b.from.x - mb.mx;
  const bx1 = b.to.x + mb.mx;
  const by0 = b.from.y - mb.my;
  const by1 = b.to.y + mb.my;
  return ax0 < bx1 && bx0 < ax1 && ay0 < by1 && by0 < ay1;
}

/** Hvorfor en ny boks ble avvist: for mange, eller den overlapper en annen. */
export type BoxRejection = "max" | "overlap";

export const BOX_REJECTION_KEYS: Record<BoxRejection, UiKey> = {
  max: "local.rejectMax",
  overlap: "local.rejectOverlap",
};

/**
 * Lerretet vil legge til en boks (`addBox`). Er det allerede 4, eller
 * overlapper den nye boksen en annen (med 7 % margin rundt begge), staar
 * tilstanden uendret, og siden viser hvorfor.
 */
export function addLocalBox(
  studio: StudioState,
  a: ImagePoint,
  b: ImagePoint,
  aspect: number
): { studio: StudioState; rejected: BoxRejection | null } {
  const next = addBox(studio, a, b);
  if (next === studio) return { studio, rejected: null };
  const boxes = localBoxes(next);
  if (boxes.length > MAX_LOCAL_EDITS) return { studio, rejected: "max" };
  const added = boxes[boxes.length - 1];
  if (boxes.slice(0, -1).some((o) => boxesOverlap(o, added, EDIT_MARGIN, EDIT_MARGIN, aspect))) {
    return { studio, rejected: "overlap" };
  }
  return { studio: next, rejected: null };
}

/** Det foerste paret (nummer a < b) som overlapper med margen for instruksen, eller null. */
export function overlappingPair(
  studio: StudioState,
  drafts: EditDrafts,
  aspect: number
): [number, number] | null {
  const boxes = localBoxes(studio);
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const mi = editMargin(draftFor(drafts, boxes[i].id).instruction);
      const mj = editMargin(draftFor(drafts, boxes[j].id).instruction);
      if (boxesOverlap(boxes[i], boxes[j], mi, mj, aspect)) return [i + 1, j + 1];
    }
  }
  return null;
}

/** Teksten slik backend renser den: linjeskift og mellomrom samlet, uten mellomrom i endene. */
export function cleanLocalText(text: string): string {
  return text.split(/\s+/).filter((w) => w !== "").join(" ");
}

/** Hva som mangler foer «Utfør endringene» kan trykkes; null naar alt er klart. `n` er boksens nummer. */
export type LocalMissing =
  | { kind: "box" }
  | { kind: "instruction"; n: number }
  | { kind: "text"; n: number }
  | { kind: "textTooLong"; n: number }
  | { kind: "overlap"; a: number; b: number }
  | null;

export const LOCAL_MISSING_KEYS: Record<Exclude<LocalMissing, null>["kind"], UiKey> = {
  box: "local.missingBox",
  instruction: "local.missingInstruction",
  text: "local.missingText",
  textTooLong: "local.missingTextTooLong",
  overlap: "local.missingOverlap",
};

/** Hva som mangler for én endring (uten boksen), eller null. */
export function draftMissing(draft: EditDraft): "instruction" | "text" | "textTooLong" | null {
  if (draft.instruction === null) return "instruction";
  if (draft.instruction === "add") {
    const text = cleanLocalText(draft.text);
    if (text === "") return "text";
    if (text.length > LOCAL_TEXT_MAX) return "textTooLong";
  }
  return null;
}

export function localMissing(opts: { studio: StudioState; drafts: EditDrafts; aspect: number }): LocalMissing {
  const boxes = localBoxes(opts.studio);
  if (boxes.length === 0) return { kind: "box" };
  for (const [i, box] of boxes.entries()) {
    const kind = draftMissing(draftFor(opts.drafts, box.id));
    if (kind !== null) return { kind, n: i + 1 };
  }
  const pair = overlappingPair(opts.studio, opts.drafts, opts.aspect);
  if (pair !== null) return { kind: "overlap", a: pair[0], b: pair[1] };
  return null;
}

/** Teksten for det som mangler, med nummeret paa boksen. */
export function missingText(missing: Exclude<LocalMissing, null>): { key: UiKey; vars: Record<string, number> } {
  switch (missing.kind) {
    case "box":
      return { key: LOCAL_MISSING_KEYS.box, vars: {} };
    case "overlap":
      return { key: LOCAL_MISSING_KEYS.overlap, vars: { a: missing.a, b: missing.b } };
    default:
      return { key: LOCAL_MISSING_KEYS[missing.kind], vars: { n: missing.n } };
  }
}

/**
 * Body for «Utfør endringene»: `correct` med én endring per boks i
 * rekkefoelgen 1–4, teksten bare ved Legg til. Aldri overrides, choices eller
 * peissvar (backend gir 400 local_exclusive). null naar noe mangler.
 */
export function buildLocalCorrection(
  review: Pick<JobReviewDetail, "version">,
  studio: StudioState,
  drafts: EditDrafts,
  aspect: number
): DecisionRequest | null {
  if (localMissing({ studio, drafts, aspect }) !== null) return null;
  const edits: LocalEditRequest[] = [];
  for (const box of localBoxes(studio)) {
    const draft = draftFor(drafts, box.id);
    const shape = serializeMark(box);
    if (shape.shape !== "box" || draft.instruction === null) return null;
    const edit: LocalEditRequest = { shape: { shape: "box", points: shape.points }, instruction: draft.instruction };
    if (draft.instruction === "add") edit.text = cleanLocalText(draft.text);
    edits.push(edit);
  }
  const body: DecisionRequest = { action: "correct", local: { edits } };
  if (review.version !== null) body.expected_version = review.version;
  return body;
}

/** Body for «Prøv igjen» paa endring k: `correct` med `local: {retry: k}`. */
export function buildRetry(review: Pick<JobReviewDetail, "version">, k: LocalEditNumber): DecisionRequest {
  const body: DecisionRequest = { action: "correct", local: { retry: k } };
  if (review.version !== null) body.expected_version = review.version;
  return body;
}

/**
 * «Runder igjen: X av 3 · bare de markerte områdene endres». Taket er
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

/** Én rad i lista etter runden: nummer, instruks, ✓ eller koden, og om «Prøv igjen» kan trykkes. */
export interface EditResultRow {
  k: LocalEditNumber;
  instruction: LocalInstruction | null;
  ok: boolean;
  /** Koden naar endringen ikke ble gjort; null naar den er ok. */
  code: string | null;
  canRetry: boolean;
}

/**
 * Lista etter en lokal runde, eller null uten lokal runde. «Prøv igjen»
 * krever `correct` i allowed_actions og en runde igjen; Legg til uten tekst
 * (teksten er slettet, `text_len` 0 eller mangler) kan ikke proeves igjen.
 */
export function editResults(
  review: Pick<JobReviewDetail, "local" | "allowedActions" | "status" | "correction">
): EditResultRow[] | null {
  const local = review.local ?? null;
  if (local === null || review.status !== "awaiting_approval") return null;
  const canCorrect = review.allowedActions.includes("correct") && review.correction.roundsLeft > 0;
  return local.edits.map((e) => {
    const ok = e.status === "ok";
    const textGone = e.instruction === "add" && !(typeof e.textLen === "number" && e.textLen > 0);
    return {
      k: e.k,
      instruction: e.instruction,
      ok,
      code: ok ? null : e.status,
      canRetry: canCorrect && e.instruction !== null && !textGone,
    };
  });
}

/**
 * Sammenligningen etter en lokal runde (D1): forrige versjon mot ny, med
 * boksene. null uten lokal runde eller uten forhaandsvisning av forrige
 * versjon (da er glideren som foer, mot originalen).
 */
export interface LocalCompare {
  previousUrl: string;
  boxes: { k: LocalEditNumber; ok: boolean; from: ImagePoint; to: ImagePoint }[];
}

export function localCompare(review: Pick<JobReviewDetail, "local" | "images" | "status">): LocalCompare | null {
  const local = review.local ?? null;
  const previousUrl = review.images.previous?.previewUrl ?? null;
  if (local === null || previousUrl === null || review.status !== "awaiting_approval") return null;
  const boxes = local.edits.flatMap((e) =>
    e.box === null ? [] : [{ k: e.k, ok: e.status === "ok", from: e.box.from, to: e.box.to }]
  );
  return { previousUrl, boxes };
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
  "local_invalid",
  "shape_not_supported",
  "shape_invalid",
  "instruction_invalid",
  "text_required",
  "text_too_long",
  "text_not_accepted",
  "edits_count",
  "edits_overlap",
  "retry_invalid",
  "retry_source_missing",
  "text_cleared",
  "raw_missing",
  "raw_mismatch",
];

/** 400 for den lokale body-en: boksene og tekstene staar, saa megleren kan rette og proeve igjen. */
const LOCAL_RETRY: ReadonlySet<string> = new Set([
  "shape_not_supported",
  "shape_invalid",
  "instruction_invalid",
  "text_required",
  "text_too_long",
  "text_not_accepted",
  "edits_count",
  "edits_overlap",
  // 409 ved «Prøv igjen»: de andre endringene staar, og megleren kan markere paa nytt.
  "text_cleared",
  "retry_source_missing",
]);

/** «Prøv igjen» paa en endring som ikke finnes i gjeldende runde: siden viser en eldre runde. */
const LOCAL_RELOAD: ReadonlySet<string> = new Set(["retry_invalid"]);

function withLocalGroup(code: string | null, fallback: CodeGroup): { group: CodeGroup; code: string | null } {
  return { group: code !== null && LOCAL_ERROR_TEXT_CODES.includes(code) ? "localError" : fallback, code };
}

/**
 * Hva siden gjoer etter svaret paa «Utfør endringene» og «Prøv igjen»: som
 * «Lag nytt bilde» (correctionResult), men 400 for boksene og teksten gir
 * `retry` (markeringen staar), `retry_invalid` henter review paa nytt, og
 * kodene med egen tekst slaas opp i `localError`.
 */
export function localResult(out: DecisionOutcome): CorrectionResult {
  if (out.kind === "blocked" && out.code !== null && LOCAL_RETRY.has(out.code)) {
    return { kind: "retry", message: withLocalGroup(out.code, "decisionError") };
  }
  if (out.kind === "blocked" && out.code !== null && LOCAL_RELOAD.has(out.code)) {
    return { kind: "reload", message: withLocalGroup(out.code, "decisionError") };
  }
  const result = correctionResult(out);
  if (result.kind === "retry" || result.kind === "blocked" || result.kind === "limit") {
    return { ...result, message: withLocalGroup(result.message.code, result.message.group) };
  }
  return result;
}

/**
 * Kodene per endring i lista etter runden (gruppen `localEditError`). Ukjente
 * koder faar den generiske teksten for gruppen.
 */
export const LOCAL_EDIT_ERRORS: readonly string[] = [
  "mask_empty",
  "sam_failed",
  "effect_too_large",
  "effect_outside_crop",
  "align_inliers",
  "align_scale",
  "align_residual",
  "model_failed",
  "answer_invalid",
  "edits_overlap",
  "retry_source_missing",
];

/**
 * Meldingen naar siste retterunde feilet (alle endringene feilet): den
 * norske teksten for koden i `correction.last_round_error`, ellers samme
 * melding som foer. Backend (local_round.run_edits) gir den felles koden naar
 * alle endringene feilet likt, ellers `no_edit`; `no_candidate` er fra FE-3.
 */
export const LOCAL_ROUND_ERRORS: readonly string[] = [
  "mask_empty",
  "sam_failed",
  "effect_too_large",
  "effect_outside_crop",
  "align_inliers",
  "align_scale",
  "align_residual",
  "model_failed",
  "answer_invalid",
  "edits_overlap",
  "no_edit",
  "no_candidate",
];

export function roundFailedMessage(
  review: Pick<JobReviewDetail, "correction">
): { group: "localRoundError"; code: string } | { key: UiKey } {
  const code = review.correction.lastRoundError ?? null;
  if (code !== null && LOCAL_ROUND_ERRORS.includes(code)) return { group: "localRoundError", code };
  return { key: "correct.roundFailed" };
}
