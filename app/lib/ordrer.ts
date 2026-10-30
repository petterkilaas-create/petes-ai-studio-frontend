import {
  MAX_IMAGES_PER_ASSIGNMENT,
  type Assignment,
  type AssignmentImage,
  type AssignmentResult,
  type AssignmentSummary,
} from "./assignments.ts";
import { parseFrom } from "./orderTabs.ts";
import { playerHref } from "./player.ts";
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

/** Bildene i ordren: opplasting, rom og rekkefoelge. */
export function orderImagesHref(id: string): string {
  return `${ORDERS_PATH}/${encodeURIComponent(id)}/bilder`;
}

/**
 * Lenken fra ordrelista (FE-4): ordresiden naar ordren har resultater,
 * ellers bildesiden (der lastes bildene opp foerst).
 */
export function orderHref(order: Pick<AssignmentSummary, "id" | "counts">): string {
  return order.counts.results > 0 ? playerHref(order.id) : orderImagesHref(order.id);
}

/** Bildebrettet (FE-3): velg tjenester, ogsaa for etterbestilling. */
export function orderServicesHref(id: string): string {
  return `${ORDERS_PATH}/${encodeURIComponent(id)}/tjenester`;
}

/** Oppsummeringen med «Start behandling» (FE-3). */
export function orderCheckHref(id: string): string {
  return `${ORDERS_PATH}/${encodeURIComponent(id)}/kontroll`;
}

/** Nedlastingen (FE-5): fillista og ZIP-en. */
export function orderDeliveryHref(id: string): string {
  return `${ORDERS_PATH}/${encodeURIComponent(id)}/last-ned`;
}

/** Parameteren paa bildesiden etter start: antall resultater som ble startet. */
export const STARTED_PARAM = "startet";

export function orderStartedHref(id: string, started: number): string {
  return `${orderImagesHref(id)}?${STARTED_PARAM}=${started}`;
}

/** Tallet fra `?startet=`, eller null naar det mangler eller ikke er et tall. */
export function parseStarted(value: string | string[] | undefined): number | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === undefined || !/^\d{1,4}$/.test(raw)) return null;
  return Number(raw);
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

/** Valgene i menyen paa kortet (FE-3 tillegg, WCAG 2.5.7: flytt uten aa dra). */
export const MOVE_ACTIONS = ["first", "up", "down", "last"] as const;
export type MoveAction = (typeof MOVE_ACTIONS)[number];

/** Plassen (1..n) for et menyvalg, eller null naar bildet allerede staar der. */
export function menuTarget(images: readonly AssignmentImage[], id: string, action: MoveAction): number | null {
  if (action === "up" || action === "down") return moveTarget(images, id, action);
  const i = images.findIndex((img) => img.id === id);
  if (i < 0) return null;
  const j = action === "first" ? 0 : images.length - 1;
  return i === j ? null : j + 1;
}

/**
 * Plassen (1..n) bildet slippes paa naar det dras over et annet bilde
 * (dra og slipp), eller null naar det slippes paa seg selv eller utenfor.
 */
export function dragTarget(images: readonly AssignmentImage[], activeId: string, overId: string | null): number | null {
  if (overId === null || overId === activeId) return null;
  const from = images.findIndex((img) => img.id === activeId);
  const to = images.findIndex((img) => img.id === overId);
  return from < 0 || to < 0 ? null : to + 1;
}

/** Plassen (1..n) bildet staar paa naa, eller null. */
export function positionOf(images: readonly AssignmentImage[], id: string): number | null {
  const i = images.findIndex((img) => img.id === id);
  return i < 0 ? null : i + 1;
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

// --- resultatene paa bildesiden (FE-3) ----------------------------------------------

/**
 * «Åpne» paa et resultat (FE-4): ordresiden med bildet og resultatet valgt.
 * Alle resultater kan aapnes der, unntatt det som ikke ble startet.
 */
export function resultOpenHref(assignmentId: string, imageId: string, result: AssignmentResult): string | null {
  return result.displayStatus === "not_started" ? null : playerHref(assignmentId, { imageId, resultId: result.resultId });
}

/**
 * Tilbake-lenken paa godkjenningssiden (FE-3c): «← Til ordren» med en gyldig
 * `fra` (stien bygges her, aldri fra adressen), ellers Historikk som foer.
 * FE-4: «Til ordren» gaar til ordresiden.
 */
export function reviewBackLink(from: string | null): { href: string; key: UiKey } {
  const order = parseFrom(from);
  return order === null ? { href: "/history", key: "review.back" } : { href: playerHref(order), key: "review.backToOrder" };
}

/**
 * Banneret «N bearbeidinger er startet» (FE-3c): bare rett etter starten
 * (`?startet=` ved foerste visning), til det lukkes eller ingenting lenger
 * behandles.
 */
export function showStartedBanner(started: number | null, closed: boolean, processing: boolean): boolean {
  return started !== null && started > 0 && !closed && processing;
}

/** Noe i ordren behandles: siden henter ordren paa nytt (én henting for hele ordren). */
export function isProcessing(assignment: Pick<Assignment, "counts" | "images">): boolean {
  return (
    assignment.counts.processing > 0 ||
    assignment.images.some((img) => img.results.some((r) => r.displayStatus === "processing"))
  );
}

/**
 * Lenkene fra backend er signerte og faar ny signatur ved hver henting (TTL
 * 3600 s). Hvert 5. sekund ville nettleseren lastet miniatyrene paa nytt.
 * Derfor beholdes forrige lenke for samme bilde naar `keep` er sann (kalleren
 * gir false naar lenkene er eldre enn URL_REFRESH_MS).
 */
export const URL_REFRESH_MS = 45 * 60_000;

export function keepImageUrls(
  prev: readonly AssignmentImage[],
  next: readonly AssignmentImage[],
  keep: boolean
): AssignmentImage[] {
  if (!keep) return [...next];
  const byId = new Map(prev.map((img) => [img.id, img]));
  return next.map((img) => {
    const old = byId.get(img.id);
    if (old === undefined) return img;
    return {
      ...img,
      thumbUrl: old.thumbUrl ?? img.thumbUrl,
      originalUrl: old.originalUrl ?? img.originalUrl,
    };
  });
}

/** Linja over bildene mens noe behandles: «2 behandles · 1 til godkjenning». Tom naar ordren ikke har resultater. */
export function resultSummary(locale: Locale, counts: Assignment["counts"]): string {
  const parts: string[] = [];
  if (counts.processing > 0) parts.push(t(locale, "orders.results.processing", { n: counts.processing }));
  if (counts.toReview > 0) parts.push(t(locale, "orders.results.toReview", { n: counts.toReview }));
  if (counts.needsAnswer > 0) parts.push(t(locale, "orders.results.needsAnswer", { n: counts.needsAnswer }));
  if (counts.approved > 0) parts.push(t(locale, "orders.results.approved", { n: counts.approved }));
  if (counts.failed > 0) parts.push(t(locale, "orders.results.failed", { n: counts.failed }));
  return parts.join(" · ");
}

/** Fargen paa statuspillen (Pill): venter paa megleren er amber, godkjent groenn, feilet roed. */
export function resultTone(status: AssignmentResult["displayStatus"]): "amber" | "green" | "neutral" | "red" {
  switch (status) {
    case "to_review":
    case "needs_answer":
      return "amber";
    case "approved":
      return "green";
    case "failed":
      return "red";
    default:
      return "neutral";
  }
}
