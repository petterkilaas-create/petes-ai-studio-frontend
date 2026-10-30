import { AssignmentError, type OrderJobsResult, type OrderJobsWireItem } from "./assignments.ts";
import { itemChunks, toWire, type BoardItem } from "./board.ts";
import { codeText, t, type Locale } from "./i18n/index.ts";
import type { Quota } from "./quota.ts";

/**
 * «Start behandling» (TG-NEW-277, FE-3): brettet sendes som POST
 * /v1/assignments/{id}/jobs i kall paa hoeyst 80 elementer (K 2.7), ett om
 * gangen. Svaret samles per element. Ren modul uten React og uten api.ts;
 * kallet sendes inn (`send`), saa reglene testes med en falsk.
 *
 * Noekkelregelen (Petter 30.10, ORDRE_2 stopp 2): backend avleder id-ene av
 * noekkelen og elementet, saa samme noekkel med en annen body er en ny
 * bestilling. Derfor lages en ny `Idempotency-Key` for hvert nytt kall. Den
 * gjenbrukes bare naar noeyaktig samme kall sendes paa nytt etter nettfeil
 * eller tidsavbrudd, og den glemmes naar et svar er mottatt (ogsaa et
 * feilsvar).
 */

/** Tidsavbrudd per kall. Backend starter hoeyst 80 elementer ett om gangen. */
export const ORDER_CALL_TIMEOUT_MS = 120_000;

/** Noekkelen per kall: ny for hvert nytt kall, samme ved nytt forsoek av samme kall. */
export class CallKeys {
  private pending: { body: string; key: string } | null = null;
  private readonly newKey: () => string;

  constructor(newKey: () => string = () => crypto.randomUUID()) {
    this.newKey = newKey;
  }

  /** Noekkelen for kallet med denne bodyen: den ventende ved samme body, ellers en ny. */
  keyFor(body: string): string {
    if (this.pending !== null && this.pending.body === body) return this.pending.key;
    const key = this.newKey();
    this.pending = { body, key };
    return key;
  }

  /** Et svar er mottatt (202 eller feilsvar): neste kall faar ny noekkel. */
  received(): void {
    this.pending = null;
  }
}

/** Utfallet for ett element. */
export interface ItemOutcome {
  item: BoardItem;
  started: boolean;
  resultId: string | null;
  /** Koden naar elementet ikke ble startet (K 2.7), eller null (ogsaa i et duplikatsvar). */
  code: string | null;
}

/** Hvor langt sendingen har kommet. `sent` er antall kall som har faatt 202. */
export interface StartProgress {
  chunks: BoardItem[][];
  sent: number;
  outcomes: ItemOutcome[];
  /** Kvoten fra siste svar, eller null (ukjent, ikke sendt ennaa). */
  quota: Quota | null;
}

/** Hvorfor sendingen stoppet. */
export type StartStop =
  | { kind: "done" }
  /** Nettfeil eller tidsavbrudd: «Prøv igjen» sender samme kall med samme noekkel. */
  | { kind: "network" }
  /** Feilsvar for hele kallet (K 2.7). `item` er elementet `index` peker paa (400 invalid_items, 403). */
  | { kind: "error"; code: string; item: BoardItem | null; field: string | null; itemCode: string | null };

export function startPlan(items: readonly BoardItem[], size?: number): StartProgress {
  return { chunks: itemChunks(items, size), sent: 0, outcomes: [], quota: null };
}

/** Elementene som ikke er sendt ennaa (det som blir igjen i utkastet). */
export function unsentItems(progress: StartProgress): BoardItem[] {
  return progress.chunks.slice(progress.sent).flat();
}

export function totalItems(progress: StartProgress): number {
  return progress.chunks.reduce((n, c) => n + c.length, 0);
}

export type SendCall = (items: OrderJobsWireItem[], idempotencyKey: string) => Promise<OrderJobsResult>;

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Svaret paa ett kall per element, i rekkefoelgen paa brettet. Mangler et element i svaret, regnes det som ikke startet. */
export function chunkOutcomes(chunk: readonly BoardItem[], result: OrderJobsResult): ItemOutcome[] {
  return chunk.map((item, index) => {
    const row = result.items.find((r) => r.index === index);
    if (row === undefined) return { item, started: false, resultId: null, code: null };
    const started = row.status !== "not_started" && row.resultId !== null;
    return { item, started, resultId: started ? row.resultId : null, code: started ? null : row.code };
  });
}

/** Feilsvaret som stopp, med elementet `index` peker paa (bare 400 invalid_items og 403 har `index`). */
export function errorStop(err: AssignmentError, chunk: readonly BoardItem[]): StartStop {
  const index = typeof err.detail.index === "number" && Number.isInteger(err.detail.index) ? err.detail.index : null;
  return {
    kind: "error",
    code: err.code ?? (err.httpStatus === 404 ? "not_found" : `http_${err.httpStatus}`),
    item: index !== null && index >= 0 && index < chunk.length ? chunk[index] : null,
    field: str(err.detail.field),
    itemCode: str(err.detail.item_code),
  };
}

/**
 * Send kallene som gjenstaar, ett om gangen, fra `progress.sent`. Stopper
 * ved foerste feil: et feilsvar glemmer noekkelen, en nettfeil beholder den,
 * saa neste forsoek (samme kall) faar samme noekkel. `onProgress` faar
 * tilstanden etter hvert kall som gikk.
 */
export async function sendRemaining(
  progress: StartProgress,
  deps: { send: SendCall; keys: CallKeys; onProgress?: (p: StartProgress) => void }
): Promise<{ progress: StartProgress; stop: StartStop }> {
  let current = progress;
  while (current.sent < current.chunks.length) {
    const chunk = current.chunks[current.sent];
    const wire = chunk.map(toWire);
    const key = deps.keys.keyFor(JSON.stringify(wire));
    let result: OrderJobsResult;
    try {
      result = await deps.send(wire, key);
    } catch (err) {
      if (err instanceof AssignmentError) {
        deps.keys.received();
        return { progress: current, stop: errorStop(err, chunk) };
      }
      return { progress: current, stop: { kind: "network" } };
    }
    deps.keys.received();
    current = {
      ...current,
      sent: current.sent + 1,
      outcomes: [...current.outcomes, ...chunkOutcomes(chunk, result)],
      quota: result.quota ?? current.quota,
    };
    deps.onProgress?.(current);
  }
  return { progress: current, stop: { kind: "done" } };
}

// --- tekst ---------------------------------------------------------------------------

/** «Ikke startet» med grunnen fra ordlista; `service_already_on_image` er «Finnes allerede». */
export function notStartedText(locale: Locale, code: string | null): string {
  return codeText(locale, "assignmentNotStarted", code);
}

/** Antall startet og ikke startet, til statuslinja etter start. */
export function outcomeCounts(outcomes: readonly ItemOutcome[]): { started: number; notStarted: number } {
  const started = outcomes.filter((o) => o.started).length;
  return { started, notStarted: outcomes.length - started };
}

/**
 * Teksten for et feilsvar. 400 invalid_items peker paa bildet og feltet:
 * «Bilde 3 (Kveldsbilde), Himmel: Valget kan ikke brukes.» `imageNumber`
 * og `label` lages av kalleren (brett.ts).
 */
export function stopText(
  locale: Locale,
  stop: Extract<StartStop, { kind: "error" }>,
  where: { imageNumber: number; label: string } | null
): string {
  if (stop.code === "invalid_items") {
    const reason = codeText(locale, "assignmentItemError", stop.itemCode);
    const field = stop.field === null ? null : codeText(locale, "assignmentItemField", stop.field);
    if (where === null) return field === null ? reason : t(locale, "check.itemErrorField", { field, reason });
    return field === null
      ? t(locale, "check.itemErrorAt", { n: where.imageNumber, label: where.label, reason })
      : t(locale, "check.itemErrorAtField", { n: where.imageNumber, label: where.label, field, reason });
  }
  const text = codeText(locale, "assignmentError", stop.code);
  return where === null ? text : t(locale, "check.itemErrorAt", { n: where.imageNumber, label: where.label, reason: text });
}
