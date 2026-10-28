import { clampView, type View } from "./zoom.ts";

/**
 * Lerretet i korreksjonsstudioet (FE-2, Dag 57). Rene funksjoner, saa de
 * kan testes med node --test. Ingen side bruker lerretet ennaa.
 *
 * Rammen er resultatbildet som vises (forhaandsvisningen, oppreist), aldri
 * originalen (audit FE, AVVIK 4). Alle punkter er 0–1 fra oeverst til
 * venstre (V6, Petter 27.10), saa samme broek gjelder resultatet i full
 * stoerrelse. Bredden paa et stroek er en broek av kortsiden i bildet, slik
 * backend regner effektomraadet (3 % av kortsiden).
 *
 * Én kjoering er én runde med inntil tre naaler (F1). Grensen ligger her,
 * saa lerretet aldri kan lage en fjerde.
 */

export interface ImagePoint {
  x: number;
  y: number;
}

export type Mark =
  | { kind: "pin"; id: number; at: ImagePoint }
  | { kind: "stroke"; id: number; points: ImagePoint[]; width: number }
  /** `from` er oeverst til venstre og `to` nederst til hoeyre. */
  | { kind: "box"; id: number; from: ImagePoint; to: ImagePoint };

export interface StudioState {
  marks: Mark[];
  /** Tidligere tilstander for «Angre», eldst foerst. */
  past: Mark[][];
  /** Tilstander for «Gjoer om», neste sist. */
  future: Mark[][];
  nextId: number;
}

export const STUDIO_START: StudioState = { marks: [], past: [], future: [], nextId: 1 };

/**
 * Fargen paa markeringene, fra designet (brett 8), paa lerretet og over
 * glideren etter runden (LocalEditBoxes). Det finnes ingen blaa token.
 */
export const MARK = "#2F5BD3";

export const MAX_PINS = 3;
/** Saa mange steg kan angres. */
export const HISTORY_MAX = 50;

export const STROKE_WIDTH_MIN = 0.005;
export const STROKE_WIDTH_MAX = 0.25;
export const STROKE_WIDTH_DEFAULT = 0.04;
/** Et nytt punkt i stroeket maa ligge minst saa langt fra det forrige. */
export const STROKE_STEP = 0.002;
/** En boks maa vaere minst saa bred og hoey. */
export const BOX_MIN = 0.005;

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/** Tall med fire desimaler, uten -0 (0,0001 er ca. 0,25 px paa 2496 px). */
function round4(n: number): number {
  return Math.round(n * 1e4) / 1e4 + 0;
}

/**
 * Fra punktet (fx, fy) i ruta (0–1) til punktet i bildet (0–1), med zoom og
 * panorering. Samme regning som i `zoomAt`. Punkter utenfor ruta legges paa
 * kanten. Tall som ikke er endelige: null.
 */
export function paneToImage(view: View, fx: number, fy: number): ImagePoint | null {
  if (!Number.isFinite(fx) || !Number.isFinite(fy)) return null;
  const v = clampView(view);
  const left = v.cx - 1 / (2 * v.scale);
  const top = v.cy - 1 / (2 * v.scale);
  return { x: clamp01(left + fx / v.scale), y: clamp01(top + fy / v.scale) };
}

/** Motsatt vei: hvor punktet i bildet staar i ruta (kan vaere utenfor 0–1). */
export function imageToPane(view: View, p: ImagePoint): ImagePoint {
  const v = clampView(view);
  const left = v.cx - 1 / (2 * v.scale);
  const top = v.cy - 1 / (2 * v.scale);
  return { x: (p.x - left) * v.scale, y: (p.y - top) * v.scale };
}

/** Er punktet i ruta (0–1)? Naaler utenfor utsnittet tegnes ikke. */
export function inPane(p: ImagePoint): boolean {
  return p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1;
}

export function clampWidth(width: number): number {
  if (!Number.isFinite(width)) return STROKE_WIDTH_DEFAULT;
  return Math.min(STROKE_WIDTH_MAX, Math.max(STROKE_WIDTH_MIN, width));
}

export function pinCount(marks: readonly Mark[]): number {
  return marks.filter((m) => m.kind === "pin").length;
}

export function canAddPin(studio: StudioState): boolean {
  return pinCount(studio.marks) < MAX_PINS;
}

/** Nummeret naalen har (1, 2 eller 3) i rekkefoelgen den ble satt. 0: ingen slik naal. */
export function pinNumber(marks: readonly Mark[], id: number): number {
  const pins = marks.filter((m) => m.kind === "pin");
  return pins.findIndex((m) => m.id === id) + 1;
}

/** Ny tilstand med «Angre» tilbake til den forrige. «Gjoer om» toemmes. */
function commit(studio: StudioState, marks: Mark[], used: number): StudioState {
  return {
    marks,
    past: [...studio.past, studio.marks].slice(-HISTORY_MAX),
    future: [],
    nextId: studio.nextId + used,
  };
}

/** Ny naal. Er det allerede tre, er tilstanden uendret. */
export function addPin(studio: StudioState, at: ImagePoint): StudioState {
  if (!canAddPin(studio)) return studio;
  const pin: Mark = { kind: "pin", id: studio.nextId, at: { x: clamp01(at.x), y: clamp01(at.y) } };
  return commit(studio, [...studio.marks, pin], 1);
}

/** Et stroek som tegnes. Det er ikke i historikken foer det er ferdig. */
export interface StrokeDraft {
  points: ImagePoint[];
  width: number;
}

export function startStroke(at: ImagePoint, width: number): StrokeDraft {
  return { points: [{ x: clamp01(at.x), y: clamp01(at.y) }], width: clampWidth(width) };
}

/** Legger til punktet hvis det er langt nok fra det forrige; ellers samme utkast. */
export function extendStroke(draft: StrokeDraft, at: ImagePoint): StrokeDraft {
  const p = { x: clamp01(at.x), y: clamp01(at.y) };
  const last = draft.points[draft.points.length - 1];
  if (last !== undefined && Math.hypot(p.x - last.x, p.y - last.y) < STROKE_STEP) return draft;
  return { points: [...draft.points, p], width: draft.width };
}

/** Ferdig stroek. Ett punkt er en prikk med stroekets bredde. */
export function addStroke(studio: StudioState, draft: StrokeDraft): StudioState {
  if (draft.points.length === 0) return studio;
  const stroke: Mark = { kind: "stroke", id: studio.nextId, points: draft.points, width: clampWidth(draft.width) };
  return commit(studio, [...studio.marks, stroke], 1);
}

/** Boksen mellom to hjoerner, uansett hvilken vei det ble dratt. */
export function boxFrom(a: ImagePoint, b: ImagePoint): { from: ImagePoint; to: ImagePoint } {
  const ax = clamp01(a.x);
  const ay = clamp01(a.y);
  const bx = clamp01(b.x);
  const by = clamp01(b.y);
  return {
    from: { x: Math.min(ax, bx), y: Math.min(ay, by) },
    to: { x: Math.max(ax, bx), y: Math.max(ay, by) },
  };
}

/** Ny boks. For smaa bokser (et klikk uten aa dra) gir uendret tilstand. */
export function addBox(studio: StudioState, a: ImagePoint, b: ImagePoint): StudioState {
  const { from, to } = boxFrom(a, b);
  if (to.x - from.x < BOX_MIN || to.y - from.y < BOX_MIN) return studio;
  return commit(studio, [...studio.marks, { kind: "box", id: studio.nextId, from, to }], 1);
}

/** Fjerner markeringen. Ukjent id: uendret. */
export function removeMark(studio: StudioState, id: number): StudioState {
  if (!studio.marks.some((m) => m.id === id)) return studio;
  return commit(
    studio,
    studio.marks.filter((m) => m.id !== id),
    0
  );
}

export function canUndo(studio: StudioState): boolean {
  return studio.past.length > 0;
}

export function canRedo(studio: StudioState): boolean {
  return studio.future.length > 0;
}

export function undo(studio: StudioState): StudioState {
  const prev = studio.past[studio.past.length - 1];
  if (prev === undefined) return studio;
  return {
    marks: prev,
    past: studio.past.slice(0, -1),
    future: [...studio.future, studio.marks],
    nextId: studio.nextId,
  };
}

export function redo(studio: StudioState): StudioState {
  const next = studio.future[studio.future.length - 1];
  if (next === undefined) return studio;
  return {
    marks: next,
    past: [...studio.past, studio.marks],
    future: studio.future.slice(0, -1),
    nextId: studio.nextId,
  };
}

export type StudioKey = "undo" | "redo" | "cancel";

/**
 * Tastene paa lerretet: Ctrl- eller Cmd-Z angrer, med Shift (eller Ctrl-Y)
 * gjoer om, og Esc avbryter det som tegnes. Andre taster: null.
 */
export function studioKey(key: string, mod: boolean, shift: boolean): StudioKey | null {
  if (key === "Escape") return mod || shift ? null : "cancel";
  if (!mod) return null;
  const k = key.toLowerCase();
  if (k === "z") return shift ? "redo" : "undo";
  if (k === "y" && !shift) return "redo";
  return null;
}

/** Det som sendes til backend: formen og punktene i 0–1, og bredden for stroek. */
export type Shape =
  | { shape: "point"; points: [number, number][] }
  | { shape: "stroke"; points: [number, number][]; width: number }
  | { shape: "box"; points: [number, number][] };

function pair(p: ImagePoint): [number, number] {
  return [round4(clamp01(p.x)), round4(clamp01(p.y))];
}

export function serializeMark(mark: Mark): Shape {
  switch (mark.kind) {
    case "pin":
      return { shape: "point", points: [pair(mark.at)] };
    case "stroke":
      return { shape: "stroke", points: mark.points.map(pair), width: round4(clampWidth(mark.width)) };
    case "box":
      return { shape: "box", points: [pair(mark.from), pair(mark.to)] };
  }
}

export function serializeMarks(marks: readonly Mark[]): Shape[] {
  return marks.map(serializeMark);
}

/**
 * Rammen i SVG-en: bildets sideforhold med kortsiden 1, saa bredden paa et
 * stroek kan brukes rett som `stroke-width`.
 */
export function svgFrame(aspect: number): { width: number; height: number } {
  if (!(aspect > 0) || !Number.isFinite(aspect)) return { width: 1, height: 1 };
  return aspect >= 1 ? { width: aspect, height: 1 } : { width: 1, height: 1 / aspect };
}

/** Stien for et stroek i SVG-rammen. Ett punkt blir en linje med lengde 0 (en prikk med runde ender). */
export function strokePath(points: readonly ImagePoint[], frame: { width: number; height: number }): string {
  if (points.length === 0) return "";
  const xy = (p: ImagePoint) => `${round4(p.x * frame.width)} ${round4(p.y * frame.height)}`;
  const [first, ...rest] = points;
  if (rest.length === 0) return `M${xy(first)}L${xy(first)}`;
  return `M${xy(first)}` + rest.map((p) => `L${xy(p)}`).join("");
}
