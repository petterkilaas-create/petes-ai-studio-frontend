import type { Locale } from "./i18n/index.ts";

/** Dato- og tallformatet per spraak i ordlista (tallene: orderTabs.ts, D-5c). */
export const DATE_LOCALES: Readonly<Record<Locale, string>> = { nb: "nb-NO", en: "en-GB" };

/**
 * Datoen paa jobbkortene og i banneret om slettede bilder (TG-NEW-117).
 * Ett sted, saa begge viser datoen likt, paa brukerens spraak (TG-NEW-129).
 */
export function formatDate(iso: string | null, locale: Locale): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(DATE_LOCALES[locale], {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Bare datoen, uten klokkeslett («26. okt. 2026»): overskriften paa en
 * bestilling i Historikken (TG-NEW-262). Som formatDate ellers.
 */
export function formatDay(iso: string | null, locale: Locale): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(DATE_LOCALES[locale], { day: "numeric", month: "short", year: "numeric" });
}
