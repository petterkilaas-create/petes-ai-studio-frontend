/**
 * Lenker paa markedssiden (MS3, regel 5): en lenke til et anker vises bare
 * naar seksjonen finnes i innholdet, saa siden aldri lenker til en seksjon
 * som ikke er bygget ennaa (MS3a: ikke #priser eller #kjeder). Ankrene er
 * feltene `anchor` i innholdet. Ingen import (node --test).
 */
export function contentAnchors(value: unknown, out: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) {
    for (const v of value) contentAnchors(v, out);
  } else if (value !== null && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k === "anchor" && typeof v === "string") out.add(v);
      else contentAnchors(v, out);
    }
  }
  return out;
}

/** Lenkene som kan vises: alle uten anker, og ankre som finnes paa siden. */
export function visibleLinks<T extends { href?: string }>(links: readonly T[], anchors: ReadonlySet<string>): T[] {
  return links.filter((l) => l.href === undefined || !l.href.startsWith("#") || anchors.has(l.href.slice(1)));
}

/**
 * Lenkene paa en underside (MS5a): ankrene ligger paa forsiden, saa «#priser»
 * blir «/no#priser». Paa forsiden (homePath null) er lenkene uendret. Lenker
 * uten href (sider som ikke finnes) og lenker til en rute er uendret.
 */
export function onPage<T extends { href?: string }>(links: readonly T[], homePath: string | null): T[] {
  if (homePath === null) return [...links];
  return links.map((l) => (l.href !== undefined && l.href.startsWith("#") ? { ...l, href: `${homePath}${l.href}` } : l));
}
