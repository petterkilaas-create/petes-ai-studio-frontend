/**
 * Merketeksten «Tekst til annonsen» (merking PR 2, Petter 29.09). Backend
 * sender bare koder i `review.disclosure`; setningen settes sammen her av
 * ordlista (kodegruppene disclosureBase, disclosureTime, disclosureEdited).
 * Kontrakt: ~/dev/_handoff/KONTRAKT_MERKING.md.
 *
 * Regelen er streng: et ledd skal aldri falle bort i stillhet, og ingen
 * tekst skal vises som ikke kommer fra en kjent kode. Ukjent kode, ugyldig
 * liste eller status som ikke er "ok" gir derfor ingen tekst ("missing").
 *
 * Importen har .ts-endelse, saa modulen kan testes med node --test.
 */

import { DICTIONARIES, type Locale } from "./i18n/index.ts";

/** `disclosure` fra review-svaret, som koder (lest i normalizeReview i api.ts). */
export interface ReviewDisclosure {
  version: string | null;
  base: string | null;
  time: string | null;
  scope: string | null;
  /** null naar lista ikke er en liste eller har noe som ikke er tekst. */
  edited: string[] | null;
  source: string | null;
  /**
   * Aarstiden bildet er tatt i (backend versjon 10, TG-NEW-273): sommer, hoest
   * eller vaar for aarstidsbasene, ellers null. Valgfri, saa faste eksempler
   * (markedssiden) ikke maa ha den; mangler den, er det som null.
   */
  sourceSeason?: string | null;
  status: string | null;
}

/** "base": bare grunnsetningen. "edited": pluss lista. "full": pluss tidspunktet. */
export type DisclosureDetail = "base" | "edited" | "full";

/** Tidspunktet vises ikke naa (Petter 29.09). Endres her for aa slaa det paa. */
export const DISCLOSURE_DETAIL: DisclosureDetail = "edited";

/** Teksten i boksen er alltid paa annonsens spraak inntil TG-NEW-129. */
export const DISCLOSURE_LOCALE: Locale = "nb";

/**
 * Aarstidene (backend versjon 9, TG-NEW-271): én base per maalaarstid. Kodene
 * er hele ledd (disclosureSeasonEdited), ikke ord i en liste: «Fargene på
 * løvet er endret, løv er lagt på bakken, og lys og skygger er tilpasset
 * årstiden.» Fra versjon 10 (Dag 58, TG-NEW-273) sier grunnsetningen «fra
 * <kilde> til <mål>» naar backend sender `source_season`
 * (disclosureSeasonFrom); uten den er den som foer. Teksten i bildet og XMP
 * har fortsatt ikke kilden (Petter 28.10).
 */
export const SEASON_BASES: ReadonlySet<string | null> = new Set([
  "season_autumn",
  "season_spring",
  "season_summer",
  "season_winter",
]);

/**
 * Baser der tidspunktet ikke er en del av teksten (Klart vaer, Petter 19.10;
 * Digital styling, GS; Aarstider): med "full" legges det ikke til, og manglende
 * tidspunkt gir ikke "missing".
 */
const BASES_WITHOUT_TIME: ReadonlySet<string | null> = new Set(["sky_replaced", "furniture_added", ...SEASON_BASES]);

export type DisclosureResult = { kind: "text"; text: string } | { kind: "missing" };

/** «A», «A og B», «A, B og C» (en: «and», uten komma foran). */
export function joinList(locale: Locale, items: readonly string[]): string {
  if (items.length <= 1) return items.join("");
  const and = locale === "nb" ? "og" : "and";
  return `${items.slice(0, -1).join(", ")} ${and} ${items[items.length - 1]}`;
}

function capitalize(locale: Locale, text: string): string {
  return text.charAt(0).toLocaleUpperCase(locale) + text.slice(1);
}

function lookup(table: Record<string, string>, code: string | null): string | null {
  return code !== null && Object.hasOwn(table, code) ? table[code] : null;
}

/**
 * Grunnsetningen for en aarstidsbase: med kilden «… endret fra sommer til
 * høst.», uten kilden som foer. En kilde som ikke er kjent, gir null
 * (ingen tekst), aldri en setning uten den.
 */
function seasonBase(locale: Locale, base: string | null, sourceSeason: string | null | undefined): string | null {
  const codes = DICTIONARIES[locale].codes;
  if (sourceSeason == null) return lookup(codes.disclosureBase, base);
  const template = lookup(codes.disclosureSeasonFrom, base);
  const source = lookup(codes.disclosureSeasonSource, sourceSeason);
  if (template === null || source === null) return null;
  return template.replace("{source}", source);
}

function editedSentence(locale: Locale, items: string[]): string {
  const list = capitalize(locale, joinList(locale, items));
  if (locale === "nb") return `${list} er redigert.`;
  return `${list} ${items.length === 1 ? "has" : "have"} been edited.`;
}

/**
 * Leddene for aarstider som én setning: «A, B, og C.» Leddene er
 * hovedsetninger, saa det staar komma foran «og» (nb) og «and» (en).
 */
export function clauseSentence(locale: Locale, items: readonly string[]): string {
  if (items.length <= 1) return `${capitalize(locale, items.join(""))}.`;
  const and = locale === "nb" ? "og" : "and";
  return `${capitalize(locale, items.slice(0, -1).join(", "))}, ${and} ${items[items.length - 1]}.`;
}

/**
 * Merketeksten for en jobb. null naar backend ikke sender disclosure (ikke
 * skumring, Klart vaer, Digital styling eller Aarstider): da vises ingen boks. `base` og `edited` sjekkes alltid, ogsaa
 * med "base"; `time` bare naar det vises ("full", ikke for BASES_WITHOUT_TIME).
 */
export function disclosureText(
  locale: Locale,
  disclosure: ReviewDisclosure | null,
  detail: DisclosureDetail
): DisclosureResult | null {
  if (disclosure === null) return null;
  const missing: DisclosureResult = { kind: "missing" };
  if (disclosure.status !== "ok" || disclosure.edited === null) return missing;

  const codes = DICTIONARIES[locale].codes;
  // Aarstider slaar opp i egen tabell: en kode fra den andre gruppen gir "missing".
  const season = SEASON_BASES.has(disclosure.base);
  // Kilden brukes bare for aarstidsbasene; andre baser faar den aldri fra backend.
  const base = season
    ? seasonBase(locale, disclosure.base, disclosure.sourceSeason)
    : lookup(codes.disclosureBase, disclosure.base);
  if (base === null) return missing;
  if (new Set(disclosure.edited).size !== disclosure.edited.length) return missing;
  const editedTable = season ? codes.disclosureSeasonEdited : codes.disclosureEdited;
  const items: string[] = [];
  // «Marker og beskriv» (FE-3, versjon 10): `objects_removed` og `objects_added` er hele setninger etter lista.
  const sentences: string[] = [];
  for (const code of disclosure.edited) {
    const text = lookup(editedTable, code);
    const sentence = season ? null : lookup(codes.disclosureLocal, code);
    if (text !== null) items.push(text);
    else if (sentence !== null) sentences.push(sentence);
    else return missing;
  }

  const parts = [base];
  if (detail === "full" && !BASES_WITHOUT_TIME.has(disclosure.base)) {
    const time = lookup(codes.disclosureTime, disclosure.time);
    if (time === null) return missing;
    parts.push(time);
  }
  if (detail !== "base" && items.length > 0) {
    parts.push(season ? clauseSentence(locale, items) : editedSentence(locale, items));
  }
  if (detail !== "base") parts.push(...sentences);
  return { kind: "text", text: parts.join(" ") };
}
