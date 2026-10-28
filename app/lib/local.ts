import type {
  AdditionsCheck,
  DecisionOutcome,
  DecisionRequest,
  JobReviewDetail,
  LocalEditNumber,
  LocalEditRequest,
  LocalInstruction,
  ReviewLocalInstruction,
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
 *   har sin tekst: hva som skal endres der (fritekst, Dag 58, FRITEKST_BE:
 *   `{shape, text}`, 1–500 tegn). Knappene Slukk, Tenn, Fjern dette og
 *   Legg til er borte (Petter 28.10).
 * - «Som i originalen» (ORIGINAL_BYGG, Dag 58): i stedet for teksten kan en
 *   boks hente tilbake det som var i originalbildet der (`{shape, mode:
 *   "original"}`, uten tekst). Backend limer det inn uten modellkall, foer
 *   fritekst-endringene i samme runde. Raden viser et utsnitt av originalen
 *   («Dette kommer tilbake»), og «Prøv igjen» tilbys ikke (A1).
 * - Bokser som overlapper, avvises her foer de sendes. Margen er den backend
 *   bruker foer claim for fritekst: 7 % av kortsiden rundt hver boks
 *   (`EDGE_MARGIN_PCT`). «Som i originalen» har 3 % i backend, men valget
 *   gjoeres etter at boksen er tegnet, saa 7 % gjelder for alle (strengere,
 *   aldri en avvisning backend ikke ville gitt).
 * - Ett resultat (ingen kandidater). Etter runden har hver endring meglerens
 *   tekst (`local.edits[].text`, bare til eieren), ✓ eller en feilmelding, og
 *   «Prøv igjen» sender `retry` (teller som runde).
 */

/** Navnene paa de gamle instruksene, for runder fra foer fritekst (review viser dem fortsatt). */
export const LOCAL_INSTRUCTION_KEYS: Record<LocalInstruction, UiKey> = {
  fire_out: "local.fireOut",
  light: "local.light",
  remove: "local.remove",
  add: "local.add",
};

/** Hoeyst saa mange tegn i teksten per boks (backend `TEXT_MAX_FREE`). */
export const LOCAL_TEXT_MAX = 500;
/** Hoeyst saa mange endringer per runde (backend `MAX_EDITS`). */
export const MAX_LOCAL_EDITS = 4;
/** Margen rundt boksen, i broek av kortsiden (backend `EDGE_MARGIN_PCT`: E er boksen + 7 %). */
export const EDIT_MARGIN = 0.07;

export type LocalBox = Extract<Mark, { kind: "box" }>;

/**
 * Hva som skal skje i én boks (noekkelen er boksens id): teksten (fritekst),
 * eller «Som i originalen» (`mode` "original"; mangler `mode`, er det
 * fritekst). Teksten staar naar megleren bytter, saa den er der igjen om
 * valget tas av.
 */
export interface EditDraft {
  text: string;
  mode?: "text" | "original";
}

export type EditDrafts = Readonly<Record<number, EditDraft>>;

export const EMPTY_DRAFT: EditDraft = { text: "" };

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

/**
 * Det foerste paret (nummer a < b) som overlapper med margen, eller null.
 * Angre og Gjoer om kan sette tilbake en boks ved siden av en ny.
 */
export function overlappingPair(studio: StudioState, aspect: number): [number, number] | null {
  const boxes = localBoxes(studio);
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      if (boxesOverlap(boxes[i], boxes[j], EDIT_MARGIN, EDIT_MARGIN, aspect)) return [i + 1, j + 1];
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
  | { kind: "text"; n: number }
  | { kind: "textTooLong"; n: number }
  | { kind: "overlap"; a: number; b: number }
  | null;

export const LOCAL_MISSING_KEYS: Record<Exclude<LocalMissing, null>["kind"], UiKey> = {
  box: "local.missingBox",
  text: "local.missingText",
  textTooLong: "local.missingTextTooLong",
  overlap: "local.missingOverlap",
};

/**
 * Hva som mangler for én endring (uten boksen), eller null. Som backend
 * (`check_edit`): teksten renses, og bare punktum og utropstegn er ingen tekst.
 * «Som i originalen» trenger ingen tekst.
 */
export function draftMissing(draft: EditDraft): "text" | "textTooLong" | null {
  if (draft.mode === "original") return null;
  const text = cleanLocalText(draft.text);
  if (text.replace(/[.!]+$/, "") === "") return "text";
  if (text.length > LOCAL_TEXT_MAX) return "textTooLong";
  return null;
}

export function localMissing(opts: { studio: StudioState; drafts: EditDrafts; aspect: number }): LocalMissing {
  const boxes = localBoxes(opts.studio);
  if (boxes.length === 0) return { kind: "box" };
  for (const [i, box] of boxes.entries()) {
    const kind = draftMissing(draftFor(opts.drafts, box.id));
    if (kind !== null) return { kind, n: i + 1 };
  }
  const pair = overlappingPair(opts.studio, opts.aspect);
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
 * rekkefoelgen 1–4, `{shape, text}` med den rensede teksten, eller
 * `{shape, mode: "original"}` uten tekst. Ingen instruks.
 * Aldri overrides, choices eller peissvar (backend gir 400 local_exclusive).
 * null naar noe mangler.
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
    if (shape.shape !== "box") return null;
    const points = { shape: "box" as const, points: shape.points };
    edits.push(
      draft.mode === "original"
        ? { shape: points, mode: "original" }
        : { shape: points, text: cleanLocalText(draft.text) }
    );
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

/**
 * Én rad i lista etter runden: nummer, instruks, meglerens tekst (null for
 * andre enn eieren, etter sletting og for gamle runder uten tekst), ✓ eller
 * koden, og om «Prøv igjen» kan trykkes.
 */
export interface EditResultRow {
  k: LocalEditNumber;
  instruction: ReviewLocalInstruction | null;
  text: string | null;
  ok: boolean;
  /** Koden naar endringen ikke ble gjort; null naar den er ok. */
  code: string | null;
  canRetry: boolean;
}

/**
 * Lista etter en lokal runde, eller null uten lokal runde. «Prøv igjen»
 * krever `correct` i allowed_actions og en runde igjen; fritekst og Legg til
 * uten tekst (`text_len` 0 eller mangler) kan ikke proeves igjen. Er teksten
 * toemt av slettejobben, staar lengden, og backend svarer 409 text_cleared.
 * «Som i originalen» kan ikke proeves igjen (A1: samme bilde hver gang;
 * backend gir 400 retry_invalid).
 */
export function editResults(
  review: Pick<JobReviewDetail, "local" | "allowedActions" | "status" | "correction">
): EditResultRow[] | null {
  const local = review.local ?? null;
  if (local === null || review.status !== "awaiting_approval") return null;
  const canCorrect = review.allowedActions.includes("correct") && review.correction.roundsLeft > 0;
  return local.edits.map((e) => {
    const ok = e.status === "ok";
    const needsText = e.instruction === "text" || e.instruction === "add";
    const textGone = needsText && !(typeof e.textLen === "number" && e.textLen > 0);
    return {
      k: e.k,
      instruction: e.instruction,
      text: e.text,
      ok,
      code: ok ? null : e.status,
      canRetry: canCorrect && e.instruction !== null && e.instruction !== "original" && !textGone,
    };
  });
}

/**
 * Overskriften for en rad etter runden: meglerens tekst, «Som i originalen»,
 * ellers navnet paa den gamle instruksen (runder fra foer fritekst), ellers
 * «Endring k».
 */
export function resultLabel(row: Pick<EditResultRow, "k" | "instruction" | "text">): {
  text: string | null;
  key: UiKey;
  vars: Record<string, number>;
} {
  if (row.text !== null) return { text: row.text, key: "local.editTitle", vars: { n: row.k } };
  if (row.instruction === "original") return { text: null, key: "local.original", vars: {} };
  if (row.instruction !== null && row.instruction !== "text") {
    return { text: null, key: LOCAL_INSTRUCTION_KEYS[row.instruction], vars: {} };
  }
  return { text: null, key: "local.editTitle", vars: { n: row.k } };
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
  // «Som i originalen» (ORIGINAL_BYGG): originalen mangler, kan ikke leses, eller ringen rundt boksen er tom.
  "original_missing",
  "original_invalid",
  "original_ring_empty",
];

/**
 * Kodene for «Som i originalen» som har egen tekst i lista (gruppen
 * `localOriginalError`): uten «Prøv igjen», som ikke tilbys (A1). Andre
 * koder faar teksten i `localEditError`.
 */
export const LOCAL_ORIGINAL_ERRORS: readonly string[] = [
  "align_inliers",
  "original_missing",
  "original_invalid",
  "original_ring_empty",
];

/** Teksten for koden paa en rad: egen tekst for «Som i originalen» naar den finnes. */
export function editErrorGroup(
  row: Pick<EditResultRow, "instruction" | "code">
): "localOriginalError" | "localEditError" {
  return row.instruction === "original" && row.code !== null && LOCAL_ORIGINAL_ERRORS.includes(row.code)
    ? "localOriginalError"
    : "localEditError";
}

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
  "original_missing",
  "original_invalid",
  "original_ring_empty",
];

export function roundFailedMessage(
  review: Pick<JobReviewDetail, "correction">
): { group: "localRoundError"; code: string } | { key: UiKey } {
  const code = review.correction.lastRoundError ?? null;
  if (code !== null && LOCAL_ROUND_ERRORS.includes(code)) return { group: "localRoundError", code };
  return { key: "correct.roundFailed" };
}

/** Hoeyst saa stort er utsnittet av originalen i raden, i px. */
export const ORIGINAL_CROP_MAX = { width: 160, height: 96 } as const;

/**
 * Utsnittet av originalen i raden for «Som i originalen» («Dette kommer
 * tilbake»): stoerrelsen i px (innenfor ORIGINAL_CROP_MAX, med boksens
 * sideforhold) og hvor originalen ligger, i prosent av utsnittet. Boksen er i
 * resultatets ramme; backend justerer originalen til den rammen, saa
 * utsnittet viser omtrent det som kommer tilbake. null for en boks uten flate.
 */
export function originalCrop(
  box: { from: ImagePoint; to: ImagePoint },
  aspect: number
): { width: number; height: number; img: { width: number; height: number; left: number; top: number } } | null {
  const a = Number.isFinite(aspect) && aspect > 0 ? aspect : 3 / 2;
  const bw = box.to.x - box.from.x;
  const bh = box.to.y - box.from.y;
  if (!(bw > 0 && bh > 0)) return null;
  // Utsnittet i enheter av bildehoeyden: bredden bw * a, hoeyden bh.
  const scale = Math.min(ORIGINAL_CROP_MAX.width / (bw * a), ORIGINAL_CROP_MAX.height / bh);
  return {
    width: Math.round(bw * a * scale),
    height: Math.round(bh * scale),
    img: {
      width: 100 / bw,
      height: 100 / bh,
      left: (-box.from.x / bw) * 100,
      top: (-box.from.y / bh) * 100,
    },
  };
}

function sameCheck(a: AdditionsCheck, b: AdditionsCheck): boolean {
  return a.level === b.level && JSON.stringify(a.items) === JSON.stringify(b.items);
}

/**
 * Versjonen kontrollen av tillegg gjelder, naar gjeldende versjon er laget med
 * lokale endringer og kontrollen fant noe (advarsel eller merknad); ellers
 * null. Siden viser da «Kontrollen gjelder versjon N. Sjekk selv at
 * rettingene ser riktige ut.» i stedet for varselet (Petter 28.10, 14.32).
 *
 * En lokal runde har kontrollen fra basen (backend C2), og kontrollen kjoeres
 * ikke paa nytt. Kontrollen er derfor fra den eldste runden i rekken bakover
 * fra gjeldende som har akkurat samme kontroll (flere lokale runder etter
 * hverandre). Uten `images.rounds`: forrige versjon. «Versjon n» er runde n − 1.
 */
export function checkedVersion(
  review: Pick<JobReviewDetail, "local" | "additionsCheck" | "status"> & {
    images: Pick<JobReviewDetail["images"], "rounds" | "previous">;
  }
): number | null {
  const local = review.local ?? null;
  const level = review.additionsCheck.level;
  if (local === null || review.status !== "awaiting_approval" || (level !== "warning" && level !== "note")) {
    return null;
  }
  const rounds = review.images.rounds ?? null;
  if (rounds !== null && rounds.length > 0) {
    const sorted = [...rounds].sort((a, b) => a.round - b.round);
    const found = sorted.findIndex((r) => r.current);
    const current = found >= 0 ? found : sorted.length - 1;
    let source = current;
    for (let i = current - 1; i >= 0; i--) {
      const check = sorted[i].additionsCheck;
      if (check === undefined || !sameCheck(check, review.additionsCheck)) break;
      source = i;
    }
    if (source < current) return sorted[source].round + 1;
  }
  const previous = review.images.previous?.round ?? null;
  return previous === null ? null : previous + 1;
}
