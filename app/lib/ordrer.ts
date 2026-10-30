import { MAX_IMAGES_PER_ASSIGNMENT, type AssignmentImage, type AssignmentSummary } from "./assignments.ts";
import { t, type Locale, type UiKey } from "./i18n/index.ts";
import { ORDERS_PATH } from "./services.ts";
import { retryable, type UploadRow } from "./uploadQueue.ts";

/**
 * Reglene for sidene under /ordrer (TG-NEW-277, FE-2): stiene, lista, skjemaet
 * for ny ordre og bildene (opplasting, rom, flytt og fjern). Rene funksjoner
 * uten React og uten api.ts, saa de testes med node --test. Kallene ligger i
 * assignments.ts, koeen i uploadQueue.ts.
 */

/** `/ordrer/ny`: adresse og oppdragsnummer. */
export const NEW_ORDER_PATH = `${ORDERS_PATH}/ny`;

/** Bildene i ordren. Ordresiden (`/ordrer/[id]`) kommer i FE-4; til da gaar lista hit. */
export function orderImagesHref(id: string): string {
  return `${ORDERS_PATH}/${encodeURIComponent(id)}/bilder`;
}

/** Ordrer per side i lista («Vis flere» henter neste med cursor). */
export const ORDERS_PAGE_SIZE = 20;

/** Lengdene backend godtar (#270, services/assignments.py). */
export const ADDRESS_MAX = 200;
export const ASSIGNMENT_NO_MAX = 40;
export const ROOM_MAX = 40;

// --- lista ---------------------------------------------------------------------

export function imageCountText(locale: Locale, n: number): string {
  return n === 1 ? t(locale, "orders.imageCountOne") : t(locale, "orders.imageCount", { n });
}

/** Linja under adressen: oppdragsnummeret (naar det finnes) og antall bilder. */
export function orderMeta(locale: Locale, order: AssignmentSummary): string {
  const parts: string[] = [];
  if (order.assignmentNo) parts.push(t(locale, "orders.assignmentNo", { no: order.assignmentNo }));
  parts.push(imageCountText(locale, order.counts.images));
  return parts.join(" · ");
}

/** Neste side lagt til bak, uten dubletter (samme id to ganger gir én rad). */
export function appendOrders(prev: readonly AssignmentSummary[], next: readonly AssignmentSummary[]): AssignmentSummary[] {
  const seen = new Set(prev.map((o) => o.id));
  return [...prev, ...next.filter((o) => !seen.has(o.id))];
}

// --- ny ordre ------------------------------------------------------------------

export type NewOrderCheck =
  | { ok: true; address: string; assignmentNo: string | null }
  | { ok: false; key: UiKey };

/** Adressen er paakrevd; tomt oppdragsnummer sendes ikke. Lengdene sjekkes av feltene og backend. */
export function checkNewOrder(address: string, assignmentNo: string): NewOrderCheck {
  const a = address.trim();
  if (a.length === 0) return { ok: false, key: "orders.addressRequired" };
  const no = assignmentNo.trim();
  return { ok: true, address: a, assignmentNo: no.length > 0 ? no : null };
}

// --- opplastingen --------------------------------------------------------------

export interface UploadCounts {
  done: number;
  /** Venter eller lastes opp. */
  active: number;
  failed: number;
  /** Feilet, men kan proeves igjen («Last opp paa nytt»). */
  retryable: number;
  /** Taket paa 60 er naadd (vises én gang over lista, som UploadQueue.limitReached). */
  limit: boolean;
}

export function uploadCounts(rows: readonly UploadRow[]): UploadCounts {
  const c: UploadCounts = { done: 0, active: 0, failed: 0, retryable: 0, limit: false };
  for (const r of rows) {
    if (r.state === "done") c.done++;
    else if (r.state === "failed") {
      c.failed++;
      if (r.failure !== null && retryable(r.failure)) c.retryable++;
      if (r.failure?.code === "assignment_image_limit") c.limit = true;
    } else c.active++;
  }
  return c;
}

/** Oppsummeringen over lista, bare delene som ikke er null («2 lastet opp · 1 ikke lastet opp»). */
export function uploadSummary(locale: Locale, counts: UploadCounts): string {
  const parts: string[] = [];
  if (counts.done > 0) parts.push(t(locale, "orders.countDone", { n: counts.done }));
  if (counts.active > 0) parts.push(t(locale, "orders.countActive", { n: counts.active }));
  if (counts.failed > 0) parts.push(t(locale, "orders.countFailed", { n: counts.failed }));
  return parts.join(" · ");
}

/**
 * Tallet til `UploadQueue.setCapacity`: koeen trekker selv fra radene som er
 * ferdige eller lastes opp, saa de ferdige (som ogsaa er i `imageCount`) legges
 * til igjen. Gir aldri mindre enn 0.
 */
export function queueCapacity(imageCount: number, rows: readonly UploadRow[]): number {
  const done = rows.filter((r) => r.state === "done").length;
  return Math.max(0, MAX_IMAGES_PER_ASSIGNMENT - imageCount + done);
}

/**
 * Bildene fra ferdige rader som ikke er i lista ennaa, lagt inn etter
 * `position` fra backend (nye bilder havner sist). Samme array tilbake naar
 * ingenting er nytt (stabil state). Samme Idempotency-Key gir samme bilde, saa
 * id-en avgjoer. Et fjernet bilde maa ogsaa tas ut av koeen (`UploadQueue.remove`),
 * ellers kommer det tilbake her.
 */
export function mergeUploaded(images: readonly AssignmentImage[], rows: readonly UploadRow[]): readonly AssignmentImage[] {
  const known = new Set(images.map((i) => i.id));
  const fresh: AssignmentImage[] = [];
  for (const r of rows) {
    if (r.state === "done" && r.image !== null && !known.has(r.image.id)) {
      known.add(r.image.id);
      fresh.push(r.image);
    }
  }
  if (fresh.length === 0) return images;
  return [...images, ...fresh].sort((a, b) => a.position - b.position);
}

// --- rom, flytt og fjern -------------------------------------------------------

/** Rommet slik backend vil ha det: trimmet, og tomt fjerner rommet (null). */
export function normalizeRoom(text: string): string | null {
  const room = text.trim();
  return room.length > 0 ? room : null;
}

/** Bare et bilde uten resultater kan fjernes (K 2.6, ellers 409 image_has_results). */
export function canRemove(image: AssignmentImage): boolean {
  return image.results.length === 0;
}

/**
 * Plassen (1..n) bildet skal til ved «Flytt opp»/«Flytt ned», eller null
 * ytterst i lista. Regnet fra rekkefoelgen, ikke fra `position`: et bilde som
 * ble lastet opp mens et annet ble fjernet, kan ha et nummer som er én for
 * hoeyt, men rekkefoelgen er lik den i backend (plassene der er 1..n).
 */
export function moveTarget(images: readonly AssignmentImage[], id: string, dir: "up" | "down"): number | null {
  const i = images.findIndex((img) => img.id === id);
  if (i < 0) return null;
  const j = dir === "up" ? i - 1 : i + 1;
  return j >= 0 && j < images.length ? j + 1 : null;
}

/** Nummer 1..n etter rekkefoelgen, som backend gjoer etter flytt og sletting (K 2.5-2.6). */
function renumber(images: readonly AssignmentImage[]): AssignmentImage[] {
  return images.map((img, i) => (img.position === i + 1 ? img : { ...img, position: i + 1 }));
}

/** Lista etter at bildet er flyttet til `position` (svaret paa PATCH); de andre forskyves. */
export function applyMove(images: readonly AssignmentImage[], id: string, position: number): AssignmentImage[] {
  const from = images.findIndex((img) => img.id === id);
  if (from < 0) return [...images];
  const rest = images.filter((img) => img.id !== id);
  const to = Math.min(Math.max(position - 1, 0), rest.length);
  return renumber([...rest.slice(0, to), images[from], ...rest.slice(to)]);
}

/** Lista uten bildet; de etter rykker opp. */
export function applyRemove(images: readonly AssignmentImage[], id: string): AssignmentImage[] {
  return renumber(images.filter((img) => img.id !== id));
}

/**
 * Nytt rom paa bildet. Bare rommet byttes: svaret paa PATCH har ikke
 * `results`, saa resten av bildet beholdes.
 */
export function applyRoom(images: readonly AssignmentImage[], id: string, room: string | null): AssignmentImage[] {
  return images.map((img) => (img.id === id && img.room !== room ? { ...img, room } : img));
}
