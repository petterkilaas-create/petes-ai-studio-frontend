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
 * Valgene per tjeneste ligger i `fields`, med navnene fra K 2.7 (FE-3, backend
 * #271). Ren modul uten React.
 */

/** Tjenestekodene i ordren (K 2.7). */
export const BOARD_SERVICES = ["skumring", "styling", "aarstid", "klart_vaer", "skjul_ansikter"] as const;
export type BoardService = (typeof BOARD_SERVICES)[number];

/** Hoeyst saa mange elementer per bestillingskall (K 2.7, Petter 29.10). */
export const MAX_ITEMS_PER_CALL = 80;

/**
 * De andre feltene per tjeneste i K 2.7 (`option` og `source_season` har egne
 * felt i BoardItem). Bare disse sendes; et ukjent felt gir `unknown_field`.
 */
export const ITEM_FIELDS: Readonly<Record<BoardService, readonly string[]>> = {
  skumring: ["dusk_style", "dusk_time", "dusk_sky", "fireplace_fire", "image_type_hint"],
  klart_vaer: ["image_type_hint"],
  styling: ["furnish_as", "room_empty_confirmed", "decor_level", "wishes"],
  aarstid: ["image_type_hint"],
  skjul_ansikter: [],
};

export type ItemFieldValue = string | number | boolean;
export type ItemFields = Readonly<Record<string, ItemFieldValue>>;

export interface BoardItem {
  imageId: string;
  service: BoardService;
  /** Stilen eller aarstiden (`styling_japandi`, `vinter`), eller null for tjenester uten valg. */
  option: string | null;
  /** Aarstiden bildet er tatt i (bare aarstid). Gjelder bildet, ikke valget. */
  sourceSeason: string | null;
  /** Valgene ellers (K 2.7, ITEM_FIELDS). Mangler for tjenester uten valg. */
  fields?: ItemFields;
}

/**
 * Valget som tekst, som `choice_key` i backend: feltene sortert, uten
 * `wishes` (oenskene er ikke en del av valget, beslutning 1).
 */
function fieldsKey(fields: ItemFields | undefined): string {
  if (fields === undefined) return "";
  return Object.keys(fields)
    .filter((k) => k !== "wishes")
    .sort()
    .map((k) => `${k}=${String(fields[k])}`)
    .join(",");
}

/**
 * Samme bilde, tjeneste og valg er samme element (K 2.7 avviser dubletter).
 * To kveldsbilder med ulik stil paa samme bilde er to elementer.
 */
export function itemKey(item: Pick<BoardItem, "imageId" | "service" | "option" | "fields">): string {
  return `${item.imageId}|${item.service}|${item.option ?? ""}|${fieldsKey(item.fields)}`;
}

/** Valget slik panelet lager det (brett.ts), uten bildet. */
export interface BoardChoice {
  service: BoardService;
  option?: string | null;
  sourceSeason?: string | null;
  fields?: ItemFields;
}

/**
 * Legg tjenesten med valget paa alle de valgte bildene. Bilder som har den
 * fra foer, faar ingen dublett; `sourceSeason` og oenskene oppdateres paa dem.
 */
export function addToImages(items: readonly BoardItem[], imageIds: readonly string[], choice: BoardChoice): BoardItem[] {
  const option = choice.option ?? null;
  const sourceSeason = choice.sourceSeason ?? null;
  const fields = choice.fields !== undefined && Object.keys(choice.fields).length > 0 ? { ...choice.fields } : undefined;
  const make = (imageId: string): BoardItem =>
    fields === undefined
      ? { imageId, service: choice.service, option, sourceSeason }
      : { imageId, service: choice.service, option, sourceSeason, fields };
  const targets = new Set(imageIds);
  const wanted = new Set(imageIds.map((id) => itemKey(make(id))));
  const out = items.map((it) => (targets.has(it.imageId) && wanted.has(itemKey(it)) ? make(it.imageId) : it));
  const have = new Set(out.map(itemKey));
  for (const imageId of imageIds) {
    const item = make(imageId);
    if (!have.has(itemKey(item))) {
      have.add(itemKey(item));
      out.push(item);
    }
  }
  return out;
}

/** Elementet byttes med valgene fra panelet («Endre»): det gamle tas ut, de nye legges til paa samme bilde. */
export function replaceItem(items: readonly BoardItem[], key: string, choices: readonly BoardChoice[]): BoardItem[] {
  const old = items.find((it) => itemKey(it) === key);
  if (old === undefined) return [...items];
  let out = items.filter((it) => itemKey(it) !== key);
  for (const choice of choices) out = addToImages(out, [old.imageId], choice);
  return out;
}

/** Ta ett element av brettet (krysset paa bildet). */
export function removeItem(items: readonly BoardItem[], key: string): BoardItem[] {
  return items.filter((it) => itemKey(it) !== key);
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

/**
 * Elementet slik backend vil ha det (K 2.7). Tomme valg sendes ikke, og bare
 * feltene tjenesten har (ITEM_FIELDS); `option` bare for styling og aarstid.
 */
export function toWire(item: BoardItem): OrderJobsWireItem {
  const wire: OrderJobsWireItem = { image_id: item.imageId, service: item.service };
  if (item.option !== null && (item.service === "styling" || item.service === "aarstid")) wire.option = item.option;
  if (item.service === "aarstid" && item.sourceSeason !== null) wire.source_season = item.sourceSeason;
  const fields = item.fields ?? {};
  for (const name of ITEM_FIELDS[item.service]) {
    const value = fields[name];
    if (value !== undefined && value !== "") (wire as unknown as Record<string, ItemFieldValue>)[name] = value;
  }
  return wire;
}

/** Brettet uten dubletter, i samme rekkefoelge (elementene som sendes). */
export function uniqueItems(items: readonly BoardItem[]): BoardItem[] {
  const seen = new Set<string>();
  const unique: BoardItem[] = [];
  for (const it of items) {
    const key = itemKey(it);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(it);
  }
  return unique;
}

/** Elementene delt i biter paa hoeyst `size`, i samme rekkefoelge. Dubletter tas ut. */
export function itemChunks(items: readonly BoardItem[], size: number = MAX_ITEMS_PER_CALL): BoardItem[][] {
  if (!Number.isInteger(size) || size < 1) throw new RangeError("size");
  const unique = uniqueItems(items);
  const chunks: BoardItem[][] = [];
  for (let i = 0; i < unique.length; i += size) chunks.push(unique.slice(i, i + size));
  return chunks;
}

/** Brettet delt i kall paa hoeyst `size` elementer, i samme rekkefoelge. Dubletter tas ut. */
export function orderChunks(items: readonly BoardItem[], size: number = MAX_ITEMS_PER_CALL): OrderJobsWireItem[][] {
  return itemChunks(items, size).map((chunk) => chunk.map(toWire));
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
  const item: BoardItem = { imageId, service: r.service, option: optString(r.option), sourceSeason: optString(r.sourceSeason) };
  const fields = parseFields(r.fields, r.service);
  return fields === undefined ? item : { ...item, fields };
}

/** Feltene fra lagringen: bare de tjenesten har, og bare tekst, tall og sann/usann. */
function parseFields(raw: unknown, service: BoardService): ItemFields | undefined {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  const out: Record<string, ItemFieldValue> = {};
  for (const name of ITEM_FIELDS[service]) {
    const value = r[name];
    if (typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value))) {
      out[name] = value;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
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
