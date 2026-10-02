/**
 * Fyller {navn} i en mal. Ukjente plassholdere blir staaende, saa en feil
 * synes i stedet for aa forsvinne. Ingen import (node --test).
 */
export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : whole
  );
}
