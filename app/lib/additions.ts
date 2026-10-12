import type { AdditionItem, AdditionsCheck, AdditionsLevel, JobReviewDetail } from "./api";
import { DICTIONARIES, t, type Locale } from "./i18n/index.ts";
import { markerPosition } from "./lightsView.ts";
import { mediaDeleted } from "./review.ts";

/**
 * Kontrollen av tillegg slik megleren ser den (TG-NEW-199 PR 4, Petter 12.10,
 * V1 A, V2 A, V3 A). Rene funksjoner, saa de kan testes med node --test; bare
 * type-import fra api.ts.
 *
 * Alt styres av `level` for gjeldende runde (toppfeltet i review), aldri av
 * `status`. Backend har regnet ut nivaaet, saa frontend har ingen typeliste
 * for advarsel og merknad.
 */

export interface AdditionsView {
  /** Linja over sjekklista; null ved `none`. */
  notice: "warning" | "note" | "unchecked" | null;
  /** Krysset foer «Godkjenn»: bare ved `warning`. */
  needsAck: boolean;
  /** «Vis mulige tillegg»: bare ved `warning` og `note`. */
  showBoxes: boolean;
}

export function additionsView(level: AdditionsLevel): AdditionsView {
  switch (level) {
    case "warning":
      return { notice: "warning", needsAck: true, showBoxes: true };
    case "note":
      return { notice: "note", needsAck: false, showBoxes: true };
    case "none":
      return { notice: null, needsAck: false, showBoxes: false };
    default:
      return { notice: "unchecked", needsAck: false, showBoxes: false };
  }
}

/** «Godkjenn» kan trykkes: krysset er satt, eller nivaaet krever det ikke. */
export function approveEnabled(level: AdditionsLevel, acknowledged: boolean): boolean {
  return level !== "warning" || acknowledged;
}

/** Noekkel for en type: kjent kode, ellers felles «annen endring». */
const OTHER = "\u0000other";

function typeKey(locale: Locale, type: string | null): string {
  return type !== null && Object.hasOwn(DICTIONARIES[locale].codes.additionType, type) ? type : OTHER;
}

/** «nytt vindu», «2 nye vinduer», «glass i 3 dører»; ukjent type: «annen endring». */
export function additionTypeText(locale: Locale, type: string | null, n: number): string {
  const dict = DICTIONARIES[locale];
  const key = typeKey(locale, type);
  if (n <= 1) return key === OTHER ? dict.generic.additionType : dict.codes.additionType[key];
  const text = key === OTHER ? dict.generic.additionTypePlural : dict.codes.additionTypePlural[key];
  return text.replace("{n}", String(n));
}

/** «a», «a og b», «a, b og c». */
export function joinList(locale: Locale, parts: string[]): string {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} ${t(locale, "additions.and")} ${parts[parts.length - 1]}`;
}

/**
 * Typene av én art paa norsk eller engelsk, uten dubletter og med antall
 * naar typen finnes flere ganger, i rekkefoelgen fra backend. Ukjente typer
 * telles sammen. null naar arten ikke finnes.
 */
export function additionsList(locale: Locale, items: readonly AdditionItem[], kind: AdditionItem["kind"]): string | null {
  const counts = new Map<string, { type: string | null; n: number }>();
  for (const item of items) {
    if (item.kind !== kind) continue;
    const key = typeKey(locale, item.type);
    const entry = counts.get(key);
    if (entry === undefined) counts.set(key, { type: key === OTHER ? null : item.type, n: 1 });
    else entry.n += 1;
  }
  if (counts.size === 0) return null;
  return joinList(
    locale,
    [...counts.values()].map(({ type, n }) => additionTypeText(locale, type, n))
  );
}

/**
 * Setningene over sjekklista (V2 A): ved `warning` advarselen, og merknaden
 * under naar det ogsaa finnes merknader. Ved `note` bare merknaden. Mangler
 * postene, brukes «annen endring», saa setningen aldri blir tom.
 */
export function additionsSentences(
  locale: Locale,
  check: Pick<AdditionsCheck, "level" | "items">
): { warning: string | null; note: string | null } {
  const other = additionTypeText(locale, null, 1);
  const notes = additionsList(locale, check.items, "note");
  if (check.level === "warning") {
    const warnings = additionsList(locale, check.items, "warning") ?? other;
    return {
      warning: t(locale, "additions.warning", { list: warnings }),
      note: notes === null ? null : t(locale, "additions.note", { list: notes }),
    };
  }
  if (check.level === "note") return { warning: null, note: t(locale, "additions.note", { list: notes ?? other }) };
  return { warning: null, note: null };
}

export interface AdditionMarker {
  item: AdditionItem;
  /** 1, 2, 3 ... (tall, saa de ikke forveksles med lampenes A, B, C). */
  number: number;
  /** Midtpunkt og stoerrelse i prosent av resultatbildet. */
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Boksene paa resultatbildet, nummerert i rekkefoelgen fra backend. Poster
 * uten boks faar intet nummer og staar bare i lista (`withoutBox`).
 */
export function additionMarkers(items: readonly AdditionItem[]): { markers: AdditionMarker[]; withoutBox: AdditionItem[] } {
  const markers: AdditionMarker[] = [];
  const withoutBox: AdditionItem[] = [];
  for (const item of items) {
    if (item.box === null) withoutBox.push(item);
    else markers.push({ item, number: markers.length + 1, ...markerPosition(item.box) });
  }
  return { markers, withoutBox };
}

/**
 * «Vis mulige tillegg»: bare ved `warning` og `note`, naar kontrollen har
 * poster, og naar gjeldende rundes merkede forhaandsvisning finnes og
 * bildene ikke er slettet. Boksene gjelder det bildet, aldri originalen og
 * aldri miniatyren (den er beskaaret til 3:2).
 */
export function canShowAdditions(
  review: Pick<JobReviewDetail, "additionsCheck" | "images" | "mediaDeletedAt">
): boolean {
  return (
    additionsView(review.additionsCheck.level).showBoxes &&
    review.additionsCheck.items.length > 0 &&
    review.images.previewUrl !== null &&
    !mediaDeleted(review)
  );
}
