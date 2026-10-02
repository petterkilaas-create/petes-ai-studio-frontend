import type { PendingKey } from "./schema.ts";

/**
 * Det som venter paa avklaring foer lansering (MS3, regel 3 og 4): paastander
 * som ikke er bekreftet, verdier vi ikke har og midlertidige bilder. Alt
 * som har feltet `pending`, telles. Testen i marketing.test.ts hindrer
 * MARKETING_PUBLIC = true saa lenge lista ikke er tom. Ingen import utenom
 * typer (node --test).
 */
export type PendingItem = { path: string; key: PendingKey };

export function pendingItems(value: unknown, path = ""): PendingItem[] {
  if (Array.isArray(value)) return value.flatMap((v, i) => pendingItems(v, `${path}[${i}]`));
  if (value === null || typeof value !== "object") return [];
  const out: PendingItem[] = [];
  const record = value as Record<string, unknown>;
  if (typeof record.pending === "string") out.push({ path, key: record.pending as PendingKey });
  for (const [k, v] of Object.entries(record)) {
    if (k !== "pending") out.push(...pendingItems(v, path ? `${path}.${k}` : k));
  }
  return out;
}
