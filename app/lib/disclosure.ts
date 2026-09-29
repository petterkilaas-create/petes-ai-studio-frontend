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
  status: string | null;
}

/** "base": bare grunnsetningen. "edited": pluss lista. "full": pluss tidspunktet. */
export type DisclosureDetail = "base" | "edited" | "full";

/** Tidspunktet vises ikke naa (Petter 29.09). Endres her for aa slaa det paa. */
export const DISCLOSURE_DETAIL: DisclosureDetail = "edited";

/** Teksten i boksen er alltid paa annonsens spraak inntil TG-NEW-129. */
export const DISCLOSURE_LOCALE: Locale = "nb";

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

function editedSentence(locale: Locale, items: string[]): string {
  const list = capitalize(locale, joinList(locale, items));
  if (locale === "nb") return `${list} er redigert.`;
  return `${list} ${items.length === 1 ? "has" : "have"} been edited.`;
}

/**
 * Merketeksten for en jobb. null naar backend ikke sender disclosure (ikke
 * skumring): da vises ingen boks. `base` og `edited` sjekkes alltid, ogsaa
 * med "base"; `time` bare naar det vises ("full").
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
  const base = lookup(codes.disclosureBase, disclosure.base);
  if (base === null) return missing;
  if (new Set(disclosure.edited).size !== disclosure.edited.length) return missing;
  const items: string[] = [];
  for (const code of disclosure.edited) {
    const text = lookup(codes.disclosureEdited, code);
    if (text === null) return missing;
    items.push(text);
  }

  const parts = [base];
  if (detail === "full") {
    const time = lookup(codes.disclosureTime, disclosure.time);
    if (time === null) return missing;
    parts.push(time);
  }
  if (detail !== "base" && items.length > 0) parts.push(editedSentence(locale, items));
  return { kind: "text", text: parts.join(" ") };
}
