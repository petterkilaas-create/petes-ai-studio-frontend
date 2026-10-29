import type { OrderJobsWireItem } from "./assignments.ts";

/**
 * Bildebrettet for ordren (TG-NEW-277, FE-0; audit punkt 4). Megleren krysser
 * av bilder og legger tjenester paa dem i panelet. Brettet er en liste med
 * elementer (bilde × tjeneste × valg, beslutning 1), og sendes som
 * POST /v1/assignments/{id}/jobs i biter paa hoeyst 80 (K 2.7).
 *
 * Utkastet lagres i localStorage per ordre (Petter 29.10). Det er foerste bruk
 * av localStorage i appen: all lesing og skriving er i try/catch, og siden
 * virker uten (privat modus, blokkert lagring).
 *
 * Valgene per tjeneste (romtype, pyntenivaa, skumringsvalg) faar navn i
 * backend-PR 3; da utvides BoardItem. Ren modul uten React.
 */

/** Tjenestekodene i ordren (K 2.7). */
export const BOARD_SERVICES = ["skumring", "styling", "aarstid", "klart_vaer", "skjul_ansikter"] as const;
export type BoardService = (typeof BOARD_SERVICES)[number];

/** Hoeyst saa mange elementer per bestillingskall (K 2.7, Petter 29.10). */
export const MAX_ITEMS_PER_CALL = 80;

export interface BoardItem {
  imageId: string;
  service: BoardService;
  /** Stilen eller aarstiden (`styling_japandi`, `vinter`), eller null for tjenester uten valg. */
  option: string | null;
  /** Aarstiden bildet er tatt i (bare aarstid). Gjelder bildet, ikke valget. */
  sourceSeason: string | null;
}

/** Samme bilde, tjeneste og valg er samme element (K 2.7 avviser dubletter). */
export function itemKey(item: Pick<BoardItem, "imageId" | "service" | "option">): string {
  return `${item.imageId}|${item.service}|${item.option ?? ""}`;
}

function sameChoice(item: BoardItem, service: BoardService, option: string | null): boolean {
  return item.service === service && item.option === option;
}

/**
 * Legg tjenesten med valget paa alle de valgte bildene. Bilder som har den
 * fra foer, faar ingen dublett; `sourceSeason` oppdateres paa dem.
 */
export function addToImages(
  items: readonly BoardItem[],
  imageIds: readonly string[],
  choice: { service: BoardService; option?: string | null; sourceSeason?: string | null }
): BoardItem[] {
  const option = choice.option ?? null;
  const sourceSeason = choice.sourceSeason ?? null;
  const targets = new Set(imageIds);
  const out = items.map((it) =>
    targets.has(it.imageId) && sameChoice(it, choice.service, option) ? { ...it, sourceSeason } : it
  );
  const have = new Set(out.map(itemKey));
  for (const imageId of imageIds) {
    const item: BoardItem = { imageId, service: choice.service, option, sourceSeason };
    if (!have.has(itemKey(item))) {
      have.add(itemKey(item));
      out.push(item);
    }
  }
  return out;
}

/** Ta tjenesten (alle valg, eller bare `option` naar den er gitt) av de valgte bildene. */
export function removeFromImages(
  items: readonly BoardItem[],
  imageIds: readonly string[],
  service: BoardService,
  option?: string | null
): BoardItem[] {
  const targets = new Set(imageIds);
  return items.filter(
    (it) => !(targets.has(it.imageId) && it.service === service && (option === undefined || it.option === option))
  );
}

/** Hvor mange av de valgte bildene som har tjenesten (med valget), som avkrysningen i panelet. */
export type Coverage = "none" | "some" | "all";

export function coverage(
  items: readonly BoardItem[],
  imageIds: readonly string[],
  service: BoardService,
  option?: string | null
): Coverage {
  if (imageIds.length === 0) return "none";
  const has = new Set(
    items.filter((it) => it.service === service && (option === undefined || it.option === option)).map((it) => it.imageId)
  );
  const n = imageIds.filter((id) => has.has(id)).length;
  if (n === 0) return "none";
  return n === imageIds.length ? "all" : "some";
}

/** Elementene paa ett bilde, i rekkefoelgen de ble lagt til. */
export function itemsForImage(items: readonly BoardItem[], imageId: string): BoardItem[] {
  return items.filter((it) => it.imageId === imageId);
}

/** Fjern elementer for bilder som ikke finnes lenger (slettet, eller utkast fra en eldre ordre). */
export function pruneItems(items: readonly BoardItem[], imageIds: Iterable<string>): BoardItem[] {
  const ids = new Set(imageIds);
  return items.filter((it) => ids.has(it.imageId));
}

/** Elementet slik backend vil ha det. Tomme valg sendes ikke. */
export function toWire(item: BoardItem): OrderJobsWireItem {
  const wire: OrderJobsWireItem = { image_id: item.imageId, service: item.service };
  if (item.option !== null) wire.option = item.option;
  if (item.service === "aarstid" && item.sourceSeason !== null) wire.source_season = item.sourceSeason;
  return wire;
}

/** Brettet delt i kall paa hoeyst `size` elementer, i samme rekkefoelge. Dubletter tas ut. */
export function orderChunks(items: readonly BoardItem[], size: number = MAX_ITEMS_PER_CALL): OrderJobsWireItem[][] {
  if (!Number.isInteger(size) || size < 1) throw new RangeError("size");
  const seen = new Set<string>();
  const unique: BoardItem[] = [];
  for (const it of items) {
    const key = itemKey(it);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(it);
  }
  const chunks: OrderJobsWireItem[][] = [];
  for (let i = 0; i < unique.length; i += size) chunks.push(unique.slice(i, i + size).map(toWire));
  return chunks;
}

// --- utkastet i localStorage -------------------------------------------------

/** Det som trengs av localStorage; null naar lagringen ikke finnes. */
export type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export interface BoardDraft {
  items: BoardItem[];
  savedAt: string;
}

/** Uten merkenavnet: det staar bare i brand.ts (design.test.ts). */
export function draftKey(assignmentId: string): string {
  return `ordre.brett.${assignmentId}.v1`;
}

/** localStorage, eller null: tilgangen kan kaste (blokkert lagring) eller mangle (server). */
export function browserStorage(): DraftStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function isService(value: unknown): value is BoardService {
  return typeof value === "string" && (BOARD_SERVICES as readonly string[]).includes(value);
}

function optString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Ett element fra lagringen, eller null naar formen er feil. */
function parseItem(raw: unknown): BoardItem | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const imageId = optString(r.imageId);
  if (imageId === null || !isService(r.service)) return null;
  return { imageId, service: r.service, option: optString(r.option), sourceSeason: optString(r.sourceSeason) };
}

/** Lagre utkastet. Feil (full lagring, privat modus) svelges: gir false. */
export function saveDraft(
  storage: DraftStorage | null,
  assignmentId: string,
  items: readonly BoardItem[],
  now: () => Date = () => new Date()
): boolean {
  if (storage === null) return false;
  try {
    const draft: BoardDraft = { items: [...items], savedAt: now().toISOString() };
    storage.setItem(draftKey(assignmentId), JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}

/**
 * Utkastet for ordren, med bare bildene som finnes naa, eller null (ingen
 * utkast, ugyldig JSON, feil ved lesing). Ugyldige elementer hoppes over.
 */
export function loadDraft(
  storage: DraftStorage | null,
  assignmentId: string,
  imageIds: Iterable<string>
): BoardDraft | null {
  if (storage === null) return null;
  try {
    const text = storage.getItem(draftKey(assignmentId));
    if (text === null) return null;
    const raw: unknown = JSON.parse(text);
    if (typeof raw !== "object" || raw === null) return null;
    const r = raw as Record<string, unknown>;
    if (!Array.isArray(r.items)) return null;
    const items = r.items.map(parseItem).filter((it): it is BoardItem => it !== null);
    return { items: pruneItems(items, imageIds), savedAt: optString(r.savedAt) ?? "" };
  } catch {
    return null;
  }
}

/** Slett utkastet (etter vellykket bestilling). Feil svelges. */
export function clearDraft(storage: DraftStorage | null, assignmentId: string): void {
  if (storage === null) return;
  try {
    storage.removeItem(draftKey(assignmentId));
  } catch {
    // Lagringen er utilgjengelig; utkastet blir liggende til neste gang.
  }
}
