/**
 * Boligfakta i bestillingen av tekstpakken (TG-NEW-281, kontrakten §10):
 * feltene, grensene, norsk tallformat, telleren for noekkelopplysningene,
 * kroppen (`property`) og utkastet i nettleseren. Ren modul uten React og
 * uten import fra listingText.ts (som importerer herfra).
 *
 * Skjemaet holder alt som tekst slik megleren skrev det (`PropertyDraft`).
 * Tall leses med norsk format (mellomrom som tusenskille, desimalkomma) og
 * sendes som tall. Tomme felt sendes ikke.
 */

// --- feltene (K §10.1) ---------------------------------------------------------

export const PROPERTY_TYPES = ["enebolig", "tomannsbolig", "rekkehus", "leilighet", "hytte", "gardsbruk", "tomt", "annet"] as const;
export const OWNERSHIPS = ["selveier", "borettslag", "aksje", "obligasjon"] as const;
export const PLOT_OWNERSHIPS = ["eiet", "festet"] as const;
export const ENERGY_LETTERS = ["A", "B", "C", "D", "E", "F", "G"] as const;
export const ENERGY_COLORS = ["morkegronn", "lysegronn", "gul", "oransje", "rod"] as const;

/** Feltene i rekkefoelgen paa siden (som FINN). `target_group` vises for seg under. */
export const PROPERTY_KEYS = [
  "address",
  "property_type",
  "ownership",
  "asking_price",
  "total_price",
  "purchase_costs",
  "shared_debt",
  "monthly_costs",
  "municipal_fees",
  "bra_i",
  "bra_total",
  "tba",
  "plot_area",
  "plot_ownership",
  "rooms",
  "bedrooms",
  "floors",
  "floor",
  "build_year",
  "energy_letter",
  "energy_color",
  "target_group",
] as const;
export type PropertyKey = (typeof PROPERTY_KEYS)[number];

/** Gruppene i skjemaet (en rad per gruppe paa PC, alt under hverandre paa mobil). */
export const PROPERTY_GROUPS: readonly (readonly PropertyKey[])[] = [
  ["address"],
  ["property_type", "ownership"],
  ["asking_price", "total_price", "purchase_costs", "shared_debt", "monthly_costs", "municipal_fees"],
  ["bra_i", "bra_total", "tba", "plot_area", "plot_ownership"],
  ["rooms", "bedrooms", "floors", "floor"],
  ["build_year"],
  ["energy_letter", "energy_color"],
];

export type PropertySpec =
  | { kind: "text"; max: number }
  | { kind: "choice"; options: readonly string[] }
  /** `max: "year"` er i aar + 5 (byggeaaret). `group`: tusenskille i visningen. */
  | { kind: "number"; min: number; max: number | "year"; decimals: 0 | 1; group: boolean };

const money = (max: number): PropertySpec => ({ kind: "number", min: 0, max, decimals: 0, group: true });
const area = (min: number, max: number, decimals: 0 | 1): PropertySpec => ({ kind: "number", min, max, decimals, group: true });
const count = (min: number, max: number): PropertySpec => ({ kind: "number", min, max, decimals: 0, group: false });

export const PROPERTY_SPECS: Record<PropertyKey, PropertySpec> = {
  address: { kind: "text", max: 200 },
  property_type: { kind: "choice", options: PROPERTY_TYPES },
  ownership: { kind: "choice", options: OWNERSHIPS },
  asking_price: money(1_000_000_000),
  total_price: money(1_000_000_000),
  purchase_costs: money(100_000_000),
  shared_debt: money(1_000_000_000),
  monthly_costs: money(1_000_000),
  municipal_fees: money(1_000_000),
  bra_i: area(0.5, 100_000, 1),
  bra_total: area(0.5, 100_000, 1),
  tba: area(0.5, 100_000, 1),
  plot_area: area(1, 10_000_000, 1),
  plot_ownership: { kind: "choice", options: PLOT_OWNERSHIPS },
  rooms: count(0, 100),
  bedrooms: count(0, 100),
  floors: count(1, 100),
  floor: count(-5, 200),
  build_year: { kind: "number", min: 1600, max: "year", decimals: 0, group: false },
  energy_letter: { kind: "choice", options: ENERGY_LETTERS },
  energy_color: { kind: "choice", options: ENERGY_COLORS },
  target_group: { kind: "text", max: 200 },
};

/**
 * De seks noekkelopplysningene (Forbrukertilsynet, `key_facts`) og feltet som
 * fyller hver av dem (K §10.2).
 */
export const KEY_FACT_FIELDS = {
  total_price: "total_price",
  location: "address",
  property_type: "property_type",
  bra_i: "bra_i",
  bedrooms: "bedrooms",
  energy_label: "energy_letter",
} as const satisfies Record<string, PropertyKey>;

export const KEY_FIELDS: ReadonlySet<PropertyKey> = new Set(Object.values(KEY_FACT_FIELDS));

// --- tallene -------------------------------------------------------------------

/** Byggeaaret kan vaere opptil fem aar fram (K §10.1). */
export function numberMax(spec: Extract<PropertySpec, { kind: "number" }>, now: Date = new Date()): number {
  return spec.max === "year" ? now.getFullYear() + 5 : spec.max;
}

/**
 * Et tall skrevet paa norsk: mellomrom (ogsaa hardt) som tusenskille,
 * desimalkomma og minus foran. Punktum godtas som tusenskille i grupper paa
 * tre («12.500.000») og ellers som desimaltegn («75.5»). Null naar teksten
 * ikke er et tall.
 */
export function parseNorwegianNumber(raw: string): number | null {
  let s = raw.replace(/\s/g, "").replace(/−/g, "-");
  if (s === "") return null;
  if (s.includes(",")) {
    if (s.includes(".")) return null;
    s = s.replace(",", ".");
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, "");
  }
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Norsk visning: mellomrom som tusenskille (bare med `group`), desimalkomma. */
export function formatNorwegianNumber(n: number, group = true): string {
  const sign = n < 0 ? "-" : "";
  const [whole, frac] = String(Math.abs(n)).split(".");
  const grouped = group ? whole.replace(/\B(?=(\d{3})+(?!\d))/g, " ") : whole;
  return `${sign}${grouped}${frac === undefined ? "" : `,${frac}`}`;
}

// --- utkastet og valideringen ---------------------------------------------------

/** Skjemaet slik megleren skrev det: tekst per felt, tom tekst er «ikke oppgitt». */
export type PropertyDraft = Record<PropertyKey, string>;

/** Kroppen i bestillingen: bare feltene som er fylt ut. */
export type PropertyWire = Partial<Record<PropertyKey, string | number>>;

export function emptyPropertyDraft(orderAddress = ""): PropertyDraft {
  const draft = Object.fromEntries(PROPERTY_KEYS.map((k) => [k, ""])) as PropertyDraft;
  draft.address = orderAddress;
  return draft;
}

export type PropertyErrorCode = "not_number" | "whole" | "decimals" | "range" | "too_long" | "choice" | "needs_letter";

export interface PropertyError {
  code: PropertyErrorCode;
  /** Grensene for `range` og `too_long`, ferdig formatert. */
  vars: Record<string, string>;
}

function decimalsOf(n: number): number {
  const frac = String(n).split(".")[1];
  return frac === undefined ? 0 : frac.length;
}

/** Feilen i ett felt, eller null (tomt eller gyldig). Grensene fra K §10.1. */
export function propertyFieldError(key: PropertyKey, raw: string, now: Date = new Date()): PropertyError | null {
  const spec = PROPERTY_SPECS[key];
  const value = raw.trim();
  if (value === "") return null;
  switch (spec.kind) {
    case "text":
      return [...value.normalize("NFC")].length > spec.max ? { code: "too_long", vars: { max: String(spec.max) } } : null;
    case "choice":
      return spec.options.includes(value) ? null : { code: "choice", vars: {} };
    case "number": {
      const n = parseNorwegianNumber(value);
      if (n === null) return { code: "not_number", vars: {} };
      if (decimalsOf(n) > spec.decimals) return { code: spec.decimals === 0 ? "whole" : "decimals", vars: {} };
      const max = numberMax(spec, now);
      if (n < spec.min || n > max) {
        return { code: "range", vars: { min: formatNorwegianNumber(spec.min, spec.group), max: formatNorwegianNumber(max, spec.group) } };
      }
      return null;
    }
  }
}

/** Feilene i skjemaet. Fargen uten bokstav i energimerket gir `400` i backend (K §10.7). */
export function propertyErrors(draft: PropertyDraft, now: Date = new Date()): Partial<Record<PropertyKey, PropertyError>> {
  const out: Partial<Record<PropertyKey, PropertyError>> = {};
  for (const key of PROPERTY_KEYS) {
    const err = propertyFieldError(key, draft[key], now);
    if (err !== null) out[key] = err;
  }
  if (out.energy_color === undefined && draft.energy_color.trim() !== "" && draft.energy_letter.trim() === "") {
    out.energy_color = { code: "needs_letter", vars: {} };
  }
  return out;
}

/**
 * Tallet i norsk format etter at feltet er forlatt («12500000» blir
 * «12 500 000», «75.5» blir «75,5»). Ugyldig tekst og andre felt er uendret,
 * saa feilen synes.
 */
export function tidyPropertyField(key: PropertyKey, raw: string): string {
  const spec = PROPERTY_SPECS[key];
  if (spec.kind !== "number") return raw;
  const n = parseNorwegianNumber(raw);
  return n === null ? raw : formatNorwegianNumber(n, spec.group);
}

/**
 * `property` til bestillingen: bare feltene som er fylt ut, tall som tall og
 * tekst uten mellomrom rundt. Adressen er bare med naar megleren har endret
 * den; lik ordrens adresse utelates den, saa backend bruker ordren selv
 * (K §10.7). Null naar et felt er ugyldig (bestillingen sendes ikke). Et tomt
 * objekt naar ingenting er fylt ut.
 */
export function propertyWire(draft: PropertyDraft, orderAddress: string, now: Date = new Date()): PropertyWire | null {
  if (Object.keys(propertyErrors(draft, now)).length > 0) return null;
  const out: PropertyWire = {};
  for (const key of PROPERTY_KEYS) {
    const value = draft[key].trim();
    if (value === "") continue;
    if (key === "address" && sameAddress(value, orderAddress)) continue;
    out[key] = PROPERTY_SPECS[key].kind === "number" ? (parseNorwegianNumber(value) as number) : value;
  }
  return out;
}

/**
 * `property` i bestillingen: feltene som er fylt ut; `null` naar alt er
 * toemt og pakken hadde Boligfakta fra foer (fjerner det lagrede, K §10.1);
 * ellers utelatt (`undefined`). Ugyldige felt sperrer bestillingen foer dette
 * (orderBlock), saa de gir ogsaa `undefined` her.
 */
export function propertyForOrder(
  draft: PropertyDraft,
  stored: PropertyWire | null,
  orderAddress: string,
  now: Date = new Date()
): PropertyWire | null | undefined {
  const wire = propertyWire(draft, orderAddress, now);
  if (wire === null) return undefined;
  if (Object.keys(wire).length > 0) return wire;
  return stored !== null && Object.keys(stored).length > 0 ? null : undefined;
}

function sameAddress(a: string, b: string): boolean {
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  return norm(a) === norm(b);
}

/**
 * Sted kommer fra ordren: adressefeltet er tomt eller likt ordrens adresse,
 * og ordren har en adresse. Telleren merker det «fra ordren».
 */
export function locationFromOrder(draft: PropertyDraft, orderAddress: string): boolean {
  if (orderAddress.trim() === "") return false;
  const value = draft.address.trim();
  return value === "" || sameAddress(value, orderAddress);
}

/**
 * Om skjemaet gir grunnlag for teksten (K §10.1 `no_material`): minst ett felt
 * utenom `target_group`. Adressen teller bare naar den er endret fra ordren
 * (den er fylt inn fra foer).
 */
export function propertyHasMaterial(draft: PropertyDraft, orderAddress: string): boolean {
  return PROPERTY_KEYS.some((key) => {
    if (key === "target_group") return false;
    const value = draft[key].trim();
    if (value === "") return false;
    return key !== "address" || !sameAddress(value, orderAddress);
  });
}

/**
 * Hvor mange av de seks noekkelopplysningene skjemaet gir (K §10.2), bare
 * gyldige felt. Sted: adressen, eller ordrens adresse naar feltet er tomt
 * (backend bruker den da). Totalpris: feltet, eller utregnet av
 * prisantydning + omkostninger og fellesgjeld som backend gjoer
 * (`compute_total_price`): fellesgjelden trengs uten eierform selveier.
 */
export function keyFactsFilled(draft: PropertyDraft, orderAddress: string, now: Date = new Date()): number {
  const ok = (key: PropertyKey) => draft[key].trim() !== "" && propertyFieldError(key, draft[key], now) === null;
  const total = ok("total_price") || (ok("asking_price") && ok("purchase_costs") && (ok("shared_debt") || draft.ownership === "selveier"));
  const location = ok("address") || (draft.address.trim() === "" && orderAddress.trim() !== "");
  return [total, location, ok("property_type"), ok("bra_i"), ok("bedrooms"), ok("energy_letter")].filter(Boolean).length;
}

export const KEY_FACT_COUNT = Object.keys(KEY_FACT_FIELDS).length;

/**
 * `property` fra GET (K §10.3), eller null. Bare kjente noekler med riktig
 * type; ukjente hoppes over, saa en nyere backend ikke stopper siden.
 */
export function parsePropertyWire(raw: unknown): PropertyWire | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const rec = raw as Record<string, unknown>;
  const out: PropertyWire = {};
  for (const key of PROPERTY_KEYS) {
    const value = rec[key];
    const spec = PROPERTY_SPECS[key];
    if (spec.kind === "number") {
      if (typeof value === "number" && Number.isFinite(value)) out[key] = value;
    } else if (typeof value === "string" && value.trim() !== "") {
      if (spec.kind === "text" || spec.options.includes(value)) out[key] = value;
    }
  }
  return out;
}

/** Skjemaet fylt ut fra `property` i GET. Adressen fra ordren naar `property` ikke har den. */
export function propertyDraftFrom(wire: PropertyWire | null, orderAddress: string): PropertyDraft {
  const draft = emptyPropertyDraft(orderAddress);
  if (wire === null) return draft;
  for (const key of PROPERTY_KEYS) {
    const value = wire[key];
    if (value === undefined) continue;
    const spec = PROPERTY_SPECS[key];
    draft[key] = typeof value === "number" ? formatNorwegianNumber(value, spec.kind === "number" && spec.group) : value;
  }
  return draft;
}

// --- utkastet i nettleseren (localStorage) -------------------------------------
//
// Som utkastet paa bestillingsbrettet (board.ts): per ordre, all lesing og
// skriving i try/catch, og siden virker som foer uten lagring. Slettes naar
// bestillingen er sendt; etter det kommer verdiene fra `property` i GET.

export type TextDraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export interface OrderDraft {
  property: PropertyDraft;
  /** «Om boligen». */
  note: string;
}

/** Uten merkenavnet: det staar bare i brand.ts (design.test.ts). */
export function orderDraftKey(assignmentId: string): string {
  return `annonsetekst.utkast.${assignmentId}.v1`;
}

/** localStorage, eller null: tilgangen kan kaste (blokkert lagring) eller mangle (server). */
export function browserTextStorage(): TextDraftStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** Lagre utkastet. Feil (full lagring, privat modus) svelges: gir false. */
export function saveOrderDraft(storage: TextDraftStorage | null, assignmentId: string, draft: OrderDraft): boolean {
  if (storage === null) return false;
  try {
    storage.setItem(orderDraftKey(assignmentId), JSON.stringify({ property: draft.property, note: draft.note }));
    return true;
  } catch {
    return false;
  }
}

/**
 * Utkastet for ordren, eller null (ingen utkast, ugyldig JSON, feil ved
 * lesing). Ukjente felt hoppes over; et valg som ikke finnes, blir tomt.
 */
export function loadOrderDraft(storage: TextDraftStorage | null, assignmentId: string): OrderDraft | null {
  if (storage === null) return null;
  try {
    const text = storage.getItem(orderDraftKey(assignmentId));
    if (text === null) return null;
    const raw: unknown = JSON.parse(text);
    if (typeof raw !== "object" || raw === null) return null;
    const r = raw as Record<string, unknown>;
    const fields = typeof r.property === "object" && r.property !== null ? (r.property as Record<string, unknown>) : {};
    const property = emptyPropertyDraft();
    for (const key of PROPERTY_KEYS) {
      const value = fields[key];
      if (typeof value !== "string") continue;
      const spec = PROPERTY_SPECS[key];
      if (spec.kind === "choice" && value !== "" && !spec.options.includes(value)) continue;
      property[key] = value;
    }
    return { property, note: typeof r.note === "string" ? r.note : "" };
  } catch {
    return null;
  }
}

/** Slett utkastet (etter bestillingen). Feil svelges. */
export function clearOrderDraft(storage: TextDraftStorage | null, assignmentId: string): void {
  if (storage === null) return;
  try {
    storage.removeItem(orderDraftKey(assignmentId));
  } catch {
    // Lagringen er utilgjengelig; utkastet blir liggende til neste gang.
  }
}

/**
 * Skjemaet naar siden aapnes: utkastet i nettleseren foerst (det megleren ikke
 * har sendt), ellers det som ble sendt sist (`property` og `note` i GET),
 * ellers tomt med adressen fra ordren.
 */
export function initialOrderDraft(
  stored: OrderDraft | null,
  pkg: { property: PropertyWire | null; note: string | null },
  orderAddress: string
): OrderDraft {
  if (stored !== null) return stored;
  return { property: propertyDraftFrom(pkg.property, orderAddress), note: pkg.note ?? "" };
}
