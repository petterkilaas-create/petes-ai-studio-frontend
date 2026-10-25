/**
 * Zoom og utsnitt i lysboksen (D-5b1, D-5b2). Rene funksjoner uten import,
 * saa de kan testes med node --test.
 *
 * Utsnittet er skalaen (1 = hele bildet) og midtpunktet (cx, cy) i
 * bildekoordinater 0–1. Ved skala s vises 1/s av bildet i hver retning, og
 * midtpunktet holdes slik at utsnittet aldri gaar utenfor bildet. Punkter i
 * ruta (fx, fy) er ogsaa 0–1, fra oeverst til venstre.
 *
 * Taket er 200 % (Petter 25.10, §5 b): den merkede forhaandsvisningen er
 * 1600 px paa lengste side, saa KI-bildet blir uskarpt over det.
 */

export const ZOOM_MIN = 1;
export const ZOOM_MAX = 2;
export const ZOOM_STEP = 0.25;

export interface View {
  scale: number;
  cx: number;
  cy: number;
}

export const VIEW_START: View = { scale: ZOOM_MIN, cx: 0.5, cy: 0.5 };

/** Tall med fire desimaler, uten -0, saa CSS-verdiene blir korte og stabile. */
function round4(n: number): number {
  return Math.round(n * 1e4) / 1e4 + 0;
}

export function clampScale(scale: number): number {
  if (!Number.isFinite(scale)) return ZOOM_MIN;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, scale));
}

function clampCenter(c: number, scale: number): number {
  const half = 1 / (2 * scale);
  if (!Number.isFinite(c)) return 0.5;
  return Math.min(1 - half, Math.max(half, c));
}

/** Skalaen innenfor 100–200 % og utsnittet innenfor bildet. */
export function clampView(v: View): View {
  const scale = clampScale(v.scale);
  return { scale, cx: clampCenter(v.cx, scale), cy: clampCenter(v.cy, scale) };
}

/** Venstre og oevre kant av utsnittet i bildet (0–1). */
function origin(v: View): { left: number; top: number } {
  return { left: v.cx - 1 / (2 * v.scale), top: v.cy - 1 / (2 * v.scale) };
}

/** Zoom til `scale` med punktet (fx, fy) i ruta i ro. Uten punkt: midten av ruta. */
export function zoomAt(v: View, scale: number, fx = 0.5, fy = 0.5): View {
  const next = clampScale(scale);
  const { left, top } = origin(v);
  const px = left + fx / v.scale;
  const py = top + fy / v.scale;
  return clampView({ scale: next, cx: px - fx / next + 1 / (2 * next), cy: py - fy / next + 1 / (2 * next) });
}

/** «+» og «−»: neste trinn paa 25 % (fra en vilkaarlig skala etter to fingre). */
export function zoomStep(v: View, dir: 1 | -1): View {
  const k = v.scale / ZOOM_STEP;
  const steps = dir > 0 ? Math.floor(k + 1e-9) + 1 : Math.ceil(k - 1e-9) - 1;
  return zoomAt(v, steps * ZOOM_STEP);
}

/** Dra: bildet foelger pekeren. (dx, dy) er flyttet i broek av ruta. */
export function panBy(v: View, dx: number, dy: number): View {
  return clampView({ scale: v.scale, cx: v.cx - dx / v.scale, cy: v.cy - dy / v.scale });
}

/** Klikk eller dra i kartet: utsnittet sentreres paa punktet (u, w) i bildet. */
export function centerAt(v: View, u: number, w: number): View {
  return clampView({ scale: v.scale, cx: u, cy: w });
}

/** Rammen i kartet, i prosent av bildet. */
export function mapFrame(v: View): { left: number; top: number; width: number; height: number } {
  const { left, top } = origin(v);
  const size = round4(100 / v.scale);
  return { left: round4(left * 100), top: round4(top * 100), width: size, height: size };
}

/** CSS-transformen for innholdet i ruta (transform-origin oeverst til venstre). */
export function viewTransform(v: View): string {
  const { left, top } = origin(v);
  return `translate(${round4(-left * v.scale * 100)}%, ${round4(-top * v.scale * 100)}%) scale(${round4(v.scale)})`;
}

/**
 * Skillet staar ved `screen` % av ruta. Originalen ligger i det zoomede
 * innholdet og klippes ved samme sted i bildet, i prosent av bildet.
 */
export function imageSplit(v: View, screen: number): number {
  const { left } = origin(v);
  const at = (left + screen / 100 / v.scale) * 100;
  return round4(Math.min(100, Math.max(0, at)));
}

/** Tastene for zoom: «+» (og «=»), «−» (og «-»), og 0 tilbakestiller. Andre taster: null. */
export function zoomKey(v: View, key: string): View | null {
  switch (key) {
    case "+":
    case "=":
      return zoomStep(v, 1);
    case "-":
    case "−":
      return zoomStep(v, -1);
    case "0":
      return VIEW_START;
    default:
      return null;
  }
}

const PAN_STEP = 0.1;

/** Piltastene flytter utsnittet en tidel av ruta (i kartet, og uten skillet). Andre taster: null. */
export function panKey(v: View, key: string): View | null {
  switch (key) {
    case "ArrowLeft":
      return panBy(v, PAN_STEP, 0);
    case "ArrowRight":
      return panBy(v, -PAN_STEP, 0);
    case "ArrowUp":
      return panBy(v, 0, PAN_STEP);
    case "ArrowDown":
      return panBy(v, 0, -PAN_STEP);
    default:
      return null;
  }
}

export interface Point {
  x: number;
  y: number;
}

export interface Pinch {
  /** Avstanden mellom fingrene i piksler. */
  d: number;
  /** Midtpunktet i ruta (0–1). */
  x: number;
  y: number;
}

/** To fingre i ruta: avstand og midtpunkt. */
export function pinchPoint(
  a: Point,
  b: Point,
  rect: { left: number; top: number; width: number; height: number }
): Pinch {
  const w = rect.width > 0 ? rect.width : 1;
  const h = rect.height > 0 ? rect.height : 1;
  return {
    d: Math.hypot(b.x - a.x, b.y - a.y),
    x: ((a.x + b.x) / 2 - rect.left) / w,
    y: ((a.y + b.y) / 2 - rect.top) / h,
  };
}

/**
 * To fingre: zoom med forholdet mellom avstandene rundt midtpunktet der
 * fingrene startet, og flytt med midtpunktet. Alltid fra utsnittet ved
 * start, saa feilen ikke hoper seg opp.
 */
export function pinchView(start: View, from: Pinch, to: Pinch): View {
  const ratio = from.d > 0 ? to.d / from.d : 1;
  const zoomed = zoomAt(start, start.scale * ratio, from.x, from.y);
  return panBy(zoomed, to.x - from.x, to.y - from.y);
}

export interface Tap {
  /** Tidspunktet i ms (event.timeStamp). */
  t: number;
  x: number;
  y: number;
}

const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_PX = 30;

/** Andre trykk innen 300 ms og 30 px fra det forrige: dobbelttrykk. */
export function isDoubleTap(prev: Tap | null, now: Tap): boolean {
  if (prev === null) return false;
  const dt = now.t - prev.t;
  return dt >= 0 && dt <= DOUBLE_TAP_MS && Math.hypot(now.x - prev.x, now.y - prev.y) <= DOUBLE_TAP_PX;
}

/** Stoerste rute med bildets sideforhold (bredde / hoeyde) innenfor w × h. */
export function fitBox(w: number, h: number, aspect: number): { width: number; height: number } {
  if (!(w > 0 && h > 0 && aspect > 0)) return { width: 0, height: 0 };
  return w / h > aspect
    ? { width: Math.floor(h * aspect), height: Math.floor(h) }
    : { width: Math.floor(w), height: Math.floor(w / aspect) };
}

/**
 * Side ved side: to ruter ved siden av hverandre (row) eller over
 * hverandre, det som gir stoerst bilde.
 */
export function sideLayout(
  w: number,
  h: number,
  aspect: number,
  gap: number
): { row: boolean; box: { width: number; height: number } } {
  const row = fitBox((w - gap) / 2, h, aspect);
  const column = fitBox(w, (h - gap) / 2, aspect);
  return row.width >= column.width ? { row: true, box: row } : { row: false, box: column };
}
