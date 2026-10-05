/**
 * Lagret spraakvalg (TG-NEW-129, AUDIT_SPRAAK §3). Rene funksjoner, saa
 * modulen kan testes med node --test.
 *
 * - Cookien `pas_locale` styrer visningen: rot-layouten for (app) leser den,
 *   og siden rendres paa riktig spraak fra foerste byte.
 * - Clerk `unsafeMetadata.locale` foelger brukeren til andre enheter. Den
 *   skrives bare naar brukeren velger selv, og backend leser den aldri.
 * - Uten valg: nettleserens spraak (Accept-Language), ellers engelsk.
 *
 * Begge kildene kan brukeren skrive selv, saa alt valideres: bare "nb" og
 * "en" godtas, og alt annet hoppes over.
 */

import { pickLocale, type Locale } from "./index.ts";

export const LOCALE_COOKIE = "pas_locale";

/** Ett aar, i sekunder. */
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** "nb" eller "en"; alt annet (ogsaa "NB", "de" og tom) gir null. */
export function parseLocale(value: unknown): Locale | null {
  return value === "nb" || value === "en" ? value : null;
}

/**
 * Spraakene i en Accept-Language-header, det foretrukne foerst
 * (etter q, stabil ved likt). Tom eller manglende header gir [].
 */
export function headerLanguages(header: string | null | undefined): string[] {
  if (typeof header !== "string") return [];
  return header
    .split(",")
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      const weight = q === undefined ? 1 : Number(q.slice(2));
      return { tag: tag.trim(), weight: Number.isFinite(weight) ? weight : 0, index };
    })
    .filter((l) => l.tag !== "" && l.tag !== "*" && l.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.index - b.index)
    .map((l) => l.tag);
}

/**
 * Spraaket som vises: brukerens lagrede valg (Clerk), saa cookien, saa
 * nettleserens foerstevalg (samme regel som pickLocale), ellers engelsk.
 */
export function resolveLocale(sources: {
  saved?: unknown;
  cookie?: unknown;
  acceptLanguage?: string | null;
}): Locale {
  return (
    parseLocale(sources.saved) ??
    parseLocale(sources.cookie) ??
    pickLocale(headerLanguages(sources.acceptLanguage))
  );
}

/** Verdien til document.cookie. Secure bare paa https (localhost er http). */
export function localeCookie(locale: Locale, secure: boolean): string {
  const parts = [`${LOCALE_COOKIE}=${locale}`, "Path=/", `Max-Age=${LOCALE_COOKIE_MAX_AGE}`, "SameSite=Lax"];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

/** Cookien fra document.cookie, validert. */
export function cookieLocale(cookieHeader: string | null | undefined): Locale | null {
  if (typeof cookieHeader !== "string") return null;
  for (const part of cookieHeader.split(";")) {
    const [name, value] = part.trim().split("=");
    if (name === LOCALE_COOKIE) return parseLocale(value);
  }
  return null;
}
