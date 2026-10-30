import type { AssignmentImage, AssignmentResult } from "./assignments.ts";
import { resultLabel } from "./brett.ts";
import { t, type Locale, type UiKey } from "./i18n/index.ts";
import { ORDERS_PATH } from "./services.ts";

/**
 * Spilleren paa ordresiden (TG-NEW-277, FE-0; audit punkt 5 og 6): rekkefoelgen
 * paa resultatene, «Neste til godkjenning», fremdriften og piltastene i
 * bildestripa. Rene funksjoner uten React.
 */

/** Hvor spilleren staar: bildet, og resultatet (fanen) paa bildet, eller null for et bilde uten resultater. */
export interface PlayerPos {
  imageId: string;
  resultId: string | null;
}

/** Resultater som venter paa megleren: til kontroll, eller trenger svar. */
export function needsReviewer(result: AssignmentResult): boolean {
  return result.displayStatus === "to_review" || result.displayStatus === "needs_answer";
}

/** Alle plassene i rekkefoelge: bildene etter `position`, resultatene i rekkefoelgen fra backend. */
export function playerOrder(images: readonly AssignmentImage[]): PlayerPos[] {
  const out: PlayerPos[] = [];
  for (const image of images) {
    if (image.results.length === 0) out.push({ imageId: image.id, resultId: null });
    for (const r of image.results) out.push({ imageId: image.id, resultId: r.resultId });
  }
  return out;
}

function resultAt(images: readonly AssignmentImage[], pos: PlayerPos): AssignmentResult | null {
  const image = images.find((i) => i.id === pos.imageId);
  return image?.results.find((r) => r.resultId === pos.resultId) ?? null;
}

function samePos(a: PlayerPos, b: PlayerPos): boolean {
  return a.imageId === b.imageId && a.resultId === b.resultId;
}

/**
 * Neste resultat som venter paa megleren etter `cur`, rundt til starten
 * (skissen `findNext`). Gjeldende plass tas med til slutt, saa et resultat
 * som fortsatt venter, ikke hoppes over. null naar ingenting venter. Ukjent
 * `cur` (bildet er borte) leter fra starten.
 */
export function nextToReview(images: readonly AssignmentImage[], cur: PlayerPos | null): PlayerPos | null {
  const order = playerOrder(images);
  if (order.length === 0) return null;
  const at = cur === null ? -1 : order.findIndex((p) => samePos(p, cur));
  for (let step = 1; step <= order.length; step++) {
    const pos = order[(at + step + order.length) % order.length];
    const result = resultAt(images, pos);
    if (result !== null && needsReviewer(result)) return pos;
  }
  return null;
}

/**
 * Hvor spilleren starter: det foerste som venter paa megleren, ellers det
 * foerste resultatet, ellers det foerste bildet. null uten bilder.
 */
export function startPos(images: readonly AssignmentImage[]): PlayerPos | null {
  const order = playerOrder(images);
  return nextToReview(images, null) ?? order.find((p) => p.resultId !== null) ?? order[0] ?? null;
}

/**
 * Fremdriften: «6 av 9 gjennomgått · 1 behandles». Gjennomgått = godkjent
 * eller ikke brukt. Feilede og ikke startede resultater telles ikke med
 * (det er ingenting aa kontrollere).
 */
export interface Progress {
  reviewed: number;
  total: number;
  processing: number;
  waiting: number;
}

export function progress(results: readonly AssignmentResult[]): Progress {
  let reviewed = 0;
  let total = 0;
  let processing = 0;
  let waiting = 0;
  for (const r of results) {
    switch (r.displayStatus) {
      case "approved":
      case "not_used":
        reviewed++;
        total++;
        break;
      case "processing":
        processing++;
        total++;
        break;
      case "to_review":
      case "needs_answer":
        waiting++;
        total++;
        break;
      default:
        break;
    }
  }
  return { reviewed, total, processing, waiting };
}

/** Fremdriften for hele ordren. */
export function assignmentProgress(images: readonly AssignmentImage[]): Progress {
  return progress(images.flatMap((i) => i.results));
}

/** Alt er gjennomgått, og ingenting behandles: «Gå til nedlasting». */
export function allReviewed(p: Progress): boolean {
  return p.total > 0 && p.reviewed === p.total;
}

/**
 * Piltastene i bildestripa (roving tabindex): ←/→ ett steg, Home/End til
 * endene, uten aa gaa rundt. null for andre taster (la nettleseren ta dem).
 */
export function stripKey(key: string, index: number, count: number): number | null {
  if (count <= 0) return null;
  const last = count - 1;
  const i = Math.min(Math.max(index, 0), last);
  switch (key) {
    case "ArrowLeft":
      return Math.max(i - 1, 0);
    case "ArrowRight":
      return Math.min(i + 1, last);
    case "Home":
      return 0;
    case "End":
      return last;
    default:
      return null;
  }
}

// --- ordresiden (FE-4) ------------------------------------------------------------

/** Parameterne i adressen: valgt bilde og resultat (`?bilde=&resultat=`). */
export const IMAGE_PARAM = "bilde";
export const RESULT_PARAM = "resultat";

/** Id-ene fra backend (`img_…`, uuid): bokstaver, tall, `_` og `-`. */
const ID = /^[A-Za-z0-9_-]{1,100}$/;

/** Id-en fra adressen, eller null naar den mangler eller ser feil ut. */
export function parsePlayerParam(value: string | string[] | undefined | null): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === "string" && ID.test(raw) ? raw : null;
}

/** Ordresiden, med bildet og resultatet naar de er valgt. */
export function playerHref(assignmentId: string, pos: PlayerPos | null = null): string {
  const path = `${ORDERS_PATH}/${encodeURIComponent(assignmentId)}`;
  if (pos === null) return path;
  const q = new URLSearchParams({ [IMAGE_PARAM]: pos.imageId });
  if (pos.resultId !== null) q.set(RESULT_PARAM, pos.resultId);
  return `${path}?${q.toString()}`;
}

/** Foerste plass paa et bilde: det som venter paa megleren, ellers det foerste resultatet, ellers bildet alene. */
export function imagePos(image: AssignmentImage): PlayerPos {
  const r = image.results.find(needsReviewer) ?? image.results[0];
  return { imageId: image.id, resultId: r?.resultId ?? null };
}

/**
 * Plassen fra adressen: bildet og resultatet naar begge finnes, bildet
 * alene naar resultatet mangler (eller ikke hoerer til bildet), resultatet
 * alene naar bildet mangler. Ukjente id-er gir startPos (lenken er gammel,
 * eller bildet er fjernet). null uten bilder.
 */
export function resolvePos(
  images: readonly AssignmentImage[],
  imageId: string | null,
  resultId: string | null
): PlayerPos | null {
  const image = imageId === null ? undefined : images.find((i) => i.id === imageId);
  if (image !== undefined) {
    const r = image.results.find((x) => x.resultId === resultId);
    return r !== undefined ? { imageId: image.id, resultId: r.resultId } : imagePos(image);
  }
  if (resultId !== null) {
    const owner = images.find((i) => i.results.some((r) => r.resultId === resultId));
    if (owner !== undefined) return { imageId: owner.id, resultId };
  }
  return startPos(images);
}

/** Bildet ved siden av (←/→ paa siden): foerste plass paa forrige eller neste bilde, uten aa gaa rundt. */
export function imageStep(images: readonly AssignmentImage[], cur: PlayerPos, delta: -1 | 1): PlayerPos | null {
  const i = images.findIndex((img) => img.id === cur.imageId);
  const next = i < 0 ? undefined : images[i + delta];
  return next === undefined ? null : imagePos(next);
}

/**
 * Hovedknappen paa Godkjenning (fremdriftslinja, Dag 59): neste plass
 * («Neste til godkjenning»), «Ingen flere nå, N behandles» eller «Gå til
 * nedlasting». Feilede resultater telles ikke (som i fremdriften). `none`
 * naar bare gjeldende venter, eller naar ordren ikke har noe aa godkjenne
 * («Ingen flere til godkjenning nå»).
 */
export type NextState =
  | { kind: "next"; pos: PlayerPos }
  | { kind: "waiting"; processing: number }
  | { kind: "all_reviewed" }
  | { kind: "none" };

export function nextState(images: readonly AssignmentImage[], cur: PlayerPos | null): NextState {
  const pos = nextToReview(images, cur);
  if (pos !== null && (cur === null || !samePos(pos, cur))) return { kind: "next", pos };
  if (pos !== null) return { kind: "none" };
  const p = assignmentProgress(images);
  if (p.processing > 0) return { kind: "waiting", processing: p.processing };
  return allReviewed(p) ? { kind: "all_reviewed" } : { kind: "none" };
}

/** Siden hopper videre etter «Godkjenn» og «Avvis» (skissen), ikke etter retting eller angring. */
export function jumpsAfter(action: string): action is "approve" | "reject" {
  return action === "approve" || action === "reject";
}

/** Hvor lenge meldingen «Godkjent: …» med «Angre» staar etter hoppet (Petter 30.10). */
export const UNDO_NOTICE_MS = 10_000;

/** Meldingen etter hoppet: «Godkjent: Stue · Kveldsbilde» eller «Avvist: …». */
export function undoNoticeKey(action: "approve" | "reject"): UiKey {
  return action === "approve" ? "player.undo.approved" : "player.undo.rejected";
}

/** Angreknappen og spoersmaalet i meldingen, som i ResultReview: «Angre godkjenning» eller «Angre». */
export function undoKeys(action: "approve" | "reject"): { button: UiKey; confirm: UiKey } {
  return action === "approve"
    ? { button: "reopen.approved", confirm: "reopen.confirmApproved" }
    : { button: "reopen.rejected", confirm: "reopen.confirmRejected" };
}

/** Rommet (eller «Bilde N») og tjenesten: «Stue · Kveldsbilde». */
export function posLabel(locale: Locale, images: readonly AssignmentImage[], pos: PlayerPos): string {
  const i = images.findIndex((img) => img.id === pos.imageId);
  if (i < 0) return "";
  const image = images[i];
  const room = image.room ?? t(locale, "player.imageN", { n: i + 1 });
  const r = image.results.find((x) => x.resultId === pos.resultId);
  return r === undefined ? room : `${room} · ${resultLabel(locale, r)}`;
}

/** Linja under miniatyren i stripa: «2 av 3 gjennomgått», eller «Original» uten resultater. */
export function stripStatus(locale: Locale, image: AssignmentImage): string {
  if (image.results.length === 0) return t(locale, "player.original");
  const p = progress(image.results);
  return t(locale, "player.progress", { reviewed: p.reviewed, total: p.total });
}

/** Fremdriften oeverst: «6 av 9 gjennomgått · 1 behandles» (delen med behandles bare naar noe behandles). */
export function progressText(locale: Locale, p: Progress): string {
  const parts = [t(locale, "player.progress", { reviewed: p.reviewed, total: p.total })];
  if (p.processing > 0) parts.push(t(locale, "player.processing", { n: p.processing }));
  return parts.join(" · ");
}

/**
 * ←/→ paa hele siden blar mellom bildene, men ikke naar fokus staar i et
 * tekstfelt, en meny, en glider eller paa lerretet (der flytter piltastene
 * bildet), i lysboksen (`modal`), og ikke med Ctrl, Alt eller Cmd. Stripa og
 * fanene har egne piltaster. Gir -1, 1 eller null.
 */
export function pageArrow(
  key: string,
  target: { tag: string; role: string | null; editable: boolean; modal: boolean },
  modifiers: { alt: boolean; ctrl: boolean; meta: boolean }
): -1 | 1 | null {
  if (key !== "ArrowLeft" && key !== "ArrowRight") return null;
  if (modifiers.alt || modifiers.ctrl || modifiers.meta || target.modal) return null;
  const tag = target.tag.toUpperCase();
  if (target.editable || tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return null;
  if (target.role !== null && SKIP_ROLES.has(target.role)) return null;
  return key === "ArrowLeft" ? -1 : 1;
}

const SKIP_ROLES: ReadonlySet<string> = new Set([
  "application",
  "slider",
  "tab",
  "tablist",
  "menu",
  "menuitem",
  "listbox",
  "option",
  "radio",
  "spinbutton",
  "textbox",
  "combobox",
]);
