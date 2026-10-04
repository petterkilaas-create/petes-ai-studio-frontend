/**
 * Kvote for gratisbilder (TG-NEW-149, KONTRAKT_KVOTE). Rene regler uten
 * runtime-importer, saa de kan testes med node --test.
 *
 * Tallet kommer alltid fra backend (`limit`): piloter har et annet tall
 * enn vanlige meglere, saa frontend skriver aldri inn antallet selv.
 */

/** `GET /v1/quota` og `quota` i 202-svaret fra `POST /v1/process`. */
export type Quota =
  | { limited: false }
  | { limited: true; used: number; limit: number; remaining: number };

/** Hva bestillingen viser: ingenting, telleren, eller at kvoten er brukt opp. */
export type QuotaView =
  | { kind: "hidden" }
  | { kind: "counter"; remaining: number; limit: number }
  | { kind: "exhausted"; limit: number };

function count(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

/** Leser kvoten fra backend. Ugyldig form gir null (ingen teller). */
export function parseQuota(raw: unknown): Quota | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (r.limited === false) return { limited: false };
  if (r.limited !== true) return null;
  const used = count(r.used);
  const limit = count(r.limit);
  const remaining = count(r.remaining);
  if (used === null || limit === null || remaining === null) return null;
  return { limited: true, used, limit, remaining };
}

/**
 * Kvoten etter 402 free_quota_exhausted: ingen igjen. `used`/`limit` fra
 * svaret; mangler `limit`, brukes tallet vi allerede har.
 */
export function exhaustedQuota(body: { used?: unknown; limit?: unknown }, previous: Quota | null): Quota | null {
  const limit = count(body.limit) ?? (previous?.limited ? previous.limit : null);
  if (limit === null) return null;
  return { limited: true, used: count(body.used) ?? limit, limit, remaining: 0 };
}

export function quotaView(quota: Quota | null): QuotaView {
  if (quota === null || !quota.limited) return { kind: "hidden" };
  if (quota.remaining <= 0) return { kind: "exhausted", limit: quota.limit };
  return { kind: "counter", remaining: quota.remaining, limit: quota.limit };
}

/** Backend trekker for scene_transform (skumring), aldri for privacy_blur. */
export function countsAgainstQuota(service: string | null | undefined): boolean {
  return service === "scene_transform";
}

/** Kan tjenesten bestilles? Bare stengt naar den trekker og kvoten er brukt opp. */
export function canOrder(service: string | null | undefined, quota: Quota | null): boolean {
  return !countsAgainstQuota(service) || quotaView(quota).kind !== "exhausted";
}

/** Det bestillingen forteller om kvoten: 202 med `quota`, eller 402. */
export type QuotaEvent =
  | { kind: "accepted"; quota: Quota | null }
  | { kind: "exhausted"; used?: unknown; limit?: unknown };

/** Ny kvote etter en bestilling. 202 uten `quota` (privacy_blur) endrer ingenting. */
export function applyQuotaEvent(previous: Quota | null, event: QuotaEvent): Quota | null {
  if (event.kind === "accepted") return event.quota ?? previous;
  return exhaustedQuota(event, previous) ?? previous;
}
