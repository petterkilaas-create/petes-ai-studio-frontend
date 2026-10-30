import {
  AssignmentError,
  zipFileName,
  type Assignment,
  type AssignmentImage,
  type AssignmentRequest,
  type AssignmentResult,
} from "./assignments.ts";
import { reviewHref } from "./orderTabs.ts";
import { orderImagesHref } from "./ordrer.ts";
import { t, type Locale, type UiKey } from "./i18n/index.ts";

/**
 * Nedlastingen av ordren (TG-NEW-277, FE-5; skissen «Nedlasting»): manifestet
 * (K 2.8, `GET /v1/assignments/{id}/delivery`) og ZIP-en (K 2.9, `POST
 * …/delivery.zip` med `exclude`). Ren modul uten runtime-importer fra api.ts;
 * kallet sendes inn (`assignmentRequest`) og lagringen ogsaa (`saveBlob`), saa
 * alt testes med node --test. Ingen beskjaering ved lansering (Petter, AVVIK 2
 * i FE-auditen).
 */

/** En fil i ZIP-en (K 2.8): originalen (`a`) foerst, saa de godkjente resultatene (`b`, `c` …). */
export interface DeliveryFile {
  /** `img:<image_id>` eller `res:<result_id>`; det er dette `exclude` tar. */
  key: string;
  name: string;
  kind: "original" | "result";
  imageId: string;
  resultId: string | null;
  /** Den godkjente versjonen (bare resultater). */
  version: number | null;
  serviceLabel: string | null;
  /** Med AI-ikon og merketekst. Skjul ansikter er ikke merket (backend #271). */
  marked: boolean;
  /** Kan tas ut (resultatene). Originalene er alltid med. */
  toggleable: boolean;
}

/** Et resultat som ikke er med, og hvorfor (K 2.8 `notes`). */
export interface DeliveryNote {
  imageId: string;
  /** `result_processing`, `result_to_review`, `result_needs_answer`, `result_not_used`, `result_failed`. */
  code: string;
  resultId: string | null;
}

export interface DeliveryManifest {
  zipName: string | null;
  files: DeliveryFile[];
  notes: DeliveryNote[];
}

// --- parsing -----------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function posInt(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

/**
 * Manifestet. En fil uten `key`, `name` eller `image_id` hoppes over.
 * Rekkefoelgen fra backend beholdes (den er rekkefoelgen i ZIP-en). Bare
 * resultater kan tas ut, ogsaa om backend skulle si noe annet.
 */
export function parseDelivery(raw: unknown): DeliveryManifest {
  const body = isRecord(raw) ? raw : {};
  const files: DeliveryFile[] = [];
  for (const row of records(body.files)) {
    const key = str(row.key);
    const name = str(row.name);
    const imageId = str(row.image_id);
    if (key === null || name === null || imageId === null) continue;
    const kind = row.kind === "result" ? "result" : "original";
    files.push({
      key,
      name,
      kind,
      imageId,
      resultId: kind === "result" ? str(row.result_id) : null,
      version: kind === "result" ? posInt(row.version) : null,
      serviceLabel: str(row.service_label),
      marked: row.marked === true,
      toggleable: kind === "result" && row.toggleable === true,
    });
  }
  const notes: DeliveryNote[] = [];
  for (const row of records(body.notes)) {
    const imageId = str(row.image_id);
    const code = str(row.code);
    if (imageId === null || code === null) continue;
    notes.push({ imageId, code, resultId: str(row.result_id) });
  }
  return { zipName: str(body.zip_name), files, notes };
}

// --- utvalget ----------------------------------------------------------------

/**
 * `exclude` til ZIP-en: noeklene som er slaatt av, bare de som kan tas ut og
 * finnes i manifestet, i rekkefoelgen fra fillista (stabil body).
 */
export function deliveryExclude(files: readonly DeliveryFile[], off: ReadonlySet<string>): string[] {
  return files.filter((f) => f.toggleable && off.has(f.key)).map((f) => f.key);
}

export function isIncluded(file: DeliveryFile, off: ReadonlySet<string>): boolean {
  return !file.toggleable || !off.has(file.key);
}

export interface DeliveryCounts {
  originals: number;
  results: number;
  total: number;
}

/** Antall filer som kommer med naa. */
export function deliveryCounts(files: readonly DeliveryFile[], off: ReadonlySet<string>): DeliveryCounts {
  let originals = 0;
  let results = 0;
  for (const f of files) {
    if (!isIncluded(f, off)) continue;
    if (f.kind === "original") originals++;
    else results++;
  }
  return { originals, results, total: originals + results };
}

/** Linja oeverst: «14 filer: 6 bearbeidede bilder og 8 originaler.» */
export function deliverySummary(locale: Locale, counts: DeliveryCounts): string {
  const results =
    counts.results === 1 ? t(locale, "delivery.resultsOne") : t(locale, "delivery.results", { n: counts.results });
  const originals =
    counts.originals === 1 ? t(locale, "delivery.originalsOne") : t(locale, "delivery.originals", { n: counts.originals });
  const files = counts.total === 1 ? t(locale, "delivery.filesOne") : t(locale, "delivery.files", { n: counts.total });
  return t(locale, "delivery.summary", { files, results, originals });
}

/** Teksten paa knappen: «Last ned ZIP (14 filer)». */
export function zipButtonText(locale: Locale, total: number): string {
  return total === 1 ? t(locale, "delivery.zipOne") : t(locale, "delivery.zipMany", { n: total });
}

/**
 * Antall filer i leveransen regnet fra ordren (K 2.3), til lenken «Last ned
 * (N filer)» paa bildesiden: alle originalene og de godkjente resultatene,
 * som manifestet (K 2.8).
 */
export function deliveryFileCount(counts: Pick<Assignment["counts"], "images" | "approved">): number {
  return counts.images + counts.approved;
}

/** «Last ned (14 filer)» paa bildesiden. */
export function deliveryLinkText(locale: Locale, n: number): string {
  return n === 1 ? t(locale, "delivery.linkOne") : t(locale, "delivery.link", { n });
}

// --- visningen per bilde -----------------------------------------------------

export interface DeliveryGroup {
  imageId: string;
  /** Plassen i ordren (1..n), etter rekkefoelgen i manifestet. */
  number: number;
  image: AssignmentImage | null;
  files: DeliveryFile[];
  notes: DeliveryNote[];
}

/**
 * Fillista gruppert per bilde i rekkefoelgen fra manifestet, med merknadene
 * under bildet sitt. Bildet fra ordren (K 2.3) gir miniatyr, rom og navnet paa
 * tjenesten; mangler det (ordren kunne ikke hentes), vises fillista likevel.
 * En merknad for et bilde uten filer (skal ikke skje) faar egen gruppe sist.
 */
export function deliveryGroups(manifest: DeliveryManifest, images: readonly AssignmentImage[]): DeliveryGroup[] {
  const byImage = new Map(images.map((img) => [img.id, img]));
  const groups: DeliveryGroup[] = [];
  const index = new Map<string, DeliveryGroup>();
  const groupFor = (imageId: string) => {
    let g = index.get(imageId);
    if (g === undefined) {
      g = { imageId, number: groups.length + 1, image: byImage.get(imageId) ?? null, files: [], notes: [] };
      index.set(imageId, g);
      groups.push(g);
    }
    return g;
  };
  for (const f of manifest.files) groupFor(f.imageId).files.push(f);
  for (const n of manifest.notes) groupFor(n.imageId).notes.push(n);
  return groups;
}

/** Resultatet i ordren med denne id-en, eller null. */
export function findResult(image: AssignmentImage | null, resultId: string | null): AssignmentResult | null {
  if (image === null || resultId === null) return null;
  return image.results.find((r) => r.resultId === resultId) ?? null;
}

/**
 * Linja under filnavnet: «Original» eller «Digital styling · Japandi ·
 * versjon 1 · merket». `label` er navnet fra ordren (paa brukerens spraak);
 * uten det brukes `service_label` fra manifestet.
 */
export function fileDetail(locale: Locale, file: DeliveryFile, label: string | null): string {
  if (file.kind === "original") return t(locale, "delivery.original");
  const parts = [label ?? file.serviceLabel ?? t(locale, "board.service.unknown")];
  if (file.version !== null) parts.push(t(locale, "delivery.version", { n: file.version }));
  parts.push(t(locale, file.marked ? "delivery.marked" : "delivery.unmarked"));
  return parts.join(" · ");
}

const NOTE_KEYS: Readonly<Record<string, UiKey>> = {
  result_processing: "delivery.note.processing",
  result_to_review: "delivery.note.toReview",
  result_needs_answer: "delivery.note.needsAnswer",
  result_not_used: "delivery.note.notUsed",
  result_failed: "delivery.note.failed",
};

/** Teksten for en merknad; `{label}` er tjenesten. Ukjent kode gir en generisk tekst. */
export function noteKey(code: string): UiKey {
  return Object.hasOwn(NOTE_KEYS, code) ? NOTE_KEYS[code] : "delivery.note.unknown";
}

/**
 * Hvor megleren kan gjoere noe med resultatet: godkjenningssiden for til
 * godkjenning og trenger svar, ellers bildesiden (foelge med, bestille paa
 * nytt). Teksten paa lenken foelger med.
 */
export function noteLink(assignmentId: string, note: DeliveryNote): { href: string; key: UiKey } {
  const review = note.code === "result_to_review" || note.code === "result_needs_answer";
  if (review && note.resultId !== null) return { href: reviewHref(note.resultId), key: "delivery.note.openReview" };
  return { href: orderImagesHref(assignmentId), key: "delivery.note.openImages" };
}

// --- kallene -----------------------------------------------------------------

function deliveryPath(id: string): string {
  return `/v1/assignments/${encodeURIComponent(id)}/delivery`;
}

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

async function errorFrom(res: Response): Promise<AssignmentError> {
  const body = await readJson(res);
  const detail = isRecord(body) && isRecord(body.detail) ? body.detail : {};
  return new AssignmentError(res.status, str(detail.code), detail);
}

/** GET /v1/assignments/{id}/delivery (K 2.8). Feil kastes som AssignmentError (som de andre kallene). */
export async function getDelivery(request: AssignmentRequest, id: string): Promise<DeliveryManifest> {
  const res = await request(deliveryPath(id), { method: "GET" });
  if (res.status !== 200) throw await errorFrom(res);
  return parseDelivery(await readJson(res));
}

export type ZipResult =
  | { kind: "ok"; fileName: string; bytes: number }
  /** `files`: noeklene som er slettet (410 media_deleted). */
  | { kind: "error"; code: string; files: string[] }
  | { kind: "cancelled" };

/** Koden naar ZIP-en brytes midt i (K 2.9: «Nedlastingen ble avbrutt, prøv igjen»). */
export const ZIP_ABORTED = "aborted";

function isAbort(err: unknown): boolean {
  return err instanceof Error && err.name === "AbortError";
}

/**
 * POST /v1/assignments/{id}/delivery.zip (K 2.9): `{exclude}` i body, svaret
 * leses bit for bit (`onProgress` med antall byte mottatt; ZIP-en er
 * stroemmet uten lengde, saa det finnes ingen prosent) og lagres som én fil
 * med navnet fra `zip_name`. Feil foer stroemmen gir koden fra backend (404
 * uten kode blir `not_found`); brudd midt i gir `aborted`; nettfeil foer svar
 * gir `network`. Avbrutt av siden (`signal`) gir `cancelled`.
 */
export async function downloadZip(opts: {
  request: AssignmentRequest;
  id: string;
  exclude: readonly string[];
  zipName: string | null;
  address: string;
  save: (blob: Blob, fileName: string) => void;
  onProgress?: (bytes: number) => void;
  signal?: AbortSignal;
}): Promise<ZipResult> {
  const { request, id, exclude, save, onProgress, signal } = opts;
  let res: Response;
  try {
    res = await request(`${deliveryPath(id)}.zip`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ exclude }),
      signal,
    });
  } catch (err) {
    return isAbort(err) || signal?.aborted ? { kind: "cancelled" } : { kind: "error", code: "network", files: [] };
  }
  if (res.status !== 200) {
    const err = await errorFrom(res);
    const files = Array.isArray(err.detail.files) ? err.detail.files.filter((f): f is string => typeof f === "string") : [];
    const code = err.code ?? (res.status === 404 ? "not_found" : `http_${res.status}`);
    return { kind: "error", code, files };
  }
  const chunks: BlobPart[] = [];
  let bytes = 0;
  try {
    if (res.body === null) {
      const blob = await res.blob();
      chunks.push(blob);
      bytes = blob.size;
      onProgress?.(bytes);
    } else {
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        bytes += value.byteLength;
        onProgress?.(bytes);
      }
    }
  } catch (err) {
    return isAbort(err) || signal?.aborted ? { kind: "cancelled" } : { kind: "error", code: ZIP_ABORTED, files: [] };
  }
  // En tom ZIP er aldri riktig (minst én fil og katalogen); da ble stroemmen brutt.
  if (bytes === 0) return { kind: "error", code: ZIP_ABORTED, files: [] };
  const fileName = zipFileName(opts.zipName, opts.address);
  try {
    save(new Blob(chunks, { type: "application/zip" }), fileName);
  } catch {
    return { kind: "error", code: "save_failed", files: [] };
  }
  return { kind: "ok", fileName, bytes };
}

/** Filnavnene for noeklene i 410 media_deleted (noekkelen selv naar den ikke er i manifestet). */
export function deletedFileNames(files: readonly DeliveryFile[], keys: readonly string[]): string[] {
  const byKey = new Map(files.map((f) => [f.key, f.name]));
  return keys.map((k) => byKey.get(k) ?? k);
}

/** «12,3 MB» / «12.3 MB»: megabyte (1 MB = 1 000 000 byte, som Finder) med én desimal. */
export function formatMegabytes(locale: Locale, bytes: number): string {
  const mb = Math.max(0, bytes) / 1_000_000;
  const text = new Intl.NumberFormat(locale === "nb" ? "nb-NO" : "en-GB", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(mb);
  return t(locale, "delivery.megabytes", { mb: text });
}
