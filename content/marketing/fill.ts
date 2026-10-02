/**
 * Fyller {navn} i en mal. Ukjente plassholdere blir staaende, saa en feil
 * synes i stedet for aa forsvinne. Ingen import (node --test).
 */
export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : whole
  );
}

/** En plass i malen som venter ([E-POST], [TID] osv.): blir en merkelapp. */
export type PendingSlot = { pending: string };

/**
 * Som fill, men en verdi kan vente (`{ pending }`). Gir en liste med tekst og
 * plasser, saa komponenten kan vise merkelappen der verdien skal staa.
 */
export function fillParts(
  template: string,
  vars: Record<string, string | number | PendingSlot>
): (string | PendingSlot)[] {
  const parts: (string | PendingSlot)[] = [];
  let last = 0;
  for (const m of template.matchAll(/\{(\w+)\}/g)) {
    if (!Object.prototype.hasOwnProperty.call(vars, m[1])) continue;
    const value = vars[m[1]];
    const before = template.slice(last, m.index);
    last = (m.index ?? 0) + m[0].length;
    if (typeof value === "object") {
      if (before) parts.push(before);
      parts.push(value);
    } else {
      parts.push(before + String(value));
    }
  }
  parts.push(template.slice(last));
  // Slaa sammen tekst som staar ved siden av hverandre.
  return parts.reduce<(string | PendingSlot)[]>((out, p) => {
    const prev = out[out.length - 1];
    if (typeof p === "string" && typeof prev === "string") out[out.length - 1] = prev + p;
    else if (p !== "") out.push(p);
    return out;
  }, []);
}
