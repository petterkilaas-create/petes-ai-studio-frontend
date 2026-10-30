import type { UiKey } from "./i18n/index.ts";
import { parseQuota, type Quota } from "./quota.ts";

/**
 * Ordre per boligoppdrag (TG-NEW-277, FE-0). Typer, parsing og API-kall etter
 * kontraktutkastet (dag59/KONTRAKT_ORDRE_UTKAST.md, heretter K). Navnene kan
 * endres naar backend-PR-ene er merget; da endres de her og i testene.
 *
 * Ren modul uten runtime-importer fra api.ts (den kaster ved import naar
 * NEXT_PUBLIC_API_BASE mangler). API-kallene tar derfor en `request` som
 * kobles til authedFetch og API_BASE med `assignmentRequest` i api.ts (FE-2),
 * og testes med en falsk. Feltene er sjekket mot backend #270 (Ordre 1).
 */

/** Taket paa bilder per ordre (K 2.4, Petter 29.10). */
export const MAX_IMAGES_PER_ASSIGNMENT = 60;

/** `display_status` for et resultat (K 1). */
export const RESULT_STATUSES = [
  "processing",
  "to_review",
  "needs_answer",
  "approved",
  "not_used",
  "failed",
  "not_started",
] as const;
export type ResultStatus = (typeof RESULT_STATUSES)[number];

/**
 * `display_status` for et bilde (K 2.3): som resultatet, eller «Leveres som
 * original». Backend (#270, `image_display_status`) gir ogsaa `failed` naar
 * ingen er godkjent og noe feilet (Petter 29.10, stopp 2 i Ordre 1).
 */
export type ImageStatus = "processing" | "to_review" | "needs_answer" | "approved" | "failed" | "original_only";

const IMAGE_STATUSES: readonly ImageStatus[] = [
  "processing",
  "to_review",
  "needs_answer",
  "approved",
  "failed",
  "original_only",
];

export interface AssignmentCounts {
  images: number;
  results: number;
  processing: number;
  toReview: number;
  needsAnswer: number;
  approved: number;
  notUsed: number;
  failed: number;
}

/** En rad i ordrelista (K 2.2). */
export interface AssignmentSummary {
  id: string;
  address: string;
  assignmentNo: string | null;
  createdAt: string;
  updatedAt: string;
  counts: AssignmentCounts;
  coverThumbUrl: string | null;
}

export interface AssignmentList {
  items: AssignmentSummary[];
  nextCursor: string | null;
}

/** Et resultat (bilde × tjeneste) paa et bilde (K 2.3). `resultId` er job_id. */
export interface AssignmentResult {
  resultId: string;
  service: string;
  presetId: string | null;
  serviceLabel: string | null;
  optionLabel: string | null;
  status: string;
  /** Ukjent verdi fra backend gir null (teksten blir «Ukjent status»). */
  displayStatus: ResultStatus | null;
  version: number;
  previousVersion: number | null;
  versions: number[];
  approvedVersion: number | null;
  roundsLeft: number | null;
  previewUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Et kildebilde (K 2.3; uten `results` i svaret paa opplastingen, K 2.4). */
export interface AssignmentImage {
  id: string;
  position: number;
  room: string | null;
  fileName: string;
  width: number | null;
  height: number | null;
  thumbUrl: string | null;
  originalUrl: string | null;
  displayStatus: ImageStatus | null;
  results: AssignmentResult[];
}

export interface Assignment {
  id: string;
  address: string;
  assignmentNo: string | null;
  /** Backend (#270) sender ikke `slug`; da lages den fra adressen (slugify). */
  slug: string;
  createdAt: string;
  updatedAt: string;
  counts: AssignmentCounts;
  images: AssignmentImage[];
}

/** Ett element i svaret paa bestillingen (K 2.7). */
export interface OrderJobsItem {
  index: number;
  imageId: string;
  service: string;
  resultId: string | null;
  status: string;
  code: string | null;
}

export interface OrderJobsResult {
  assignmentId: string;
  /** Samme Idempotency-Key og samme body igjen: samme svar, ingen nye jobber. */
  duplicate: boolean;
  items: OrderJobsItem[];
  quota: Quota | null;
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

function int(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

export function parseCounts(raw: unknown): AssignmentCounts {
  const c = isRecord(raw) ? raw : {};
  return {
    images: int(c.images) ?? 0,
    results: int(c.results) ?? 0,
    processing: int(c.processing) ?? 0,
    toReview: int(c.to_review) ?? 0,
    needsAnswer: int(c.needs_answer) ?? 0,
    approved: int(c.approved) ?? 0,
    notUsed: int(c.not_used) ?? 0,
    failed: int(c.failed) ?? 0,
  };
}

/** Raden i ordrelista, eller null uten `id`. */
export function parseAssignmentSummary(raw: unknown): AssignmentSummary | null {
  if (!isRecord(raw)) return null;
  const id = str(raw.id);
  if (id === null) return null;
  return {
    id,
    address: str(raw.address) ?? "",
    assignmentNo: str(raw.assignment_no),
    createdAt: str(raw.created_at) ?? "",
    updatedAt: str(raw.updated_at) ?? "",
    counts: parseCounts(raw.counts),
    coverThumbUrl: str(raw.cover_thumb_url),
  };
}

export function parseAssignmentList(raw: unknown): AssignmentList {
  const body = isRecord(raw) ? raw : {};
  const items: AssignmentSummary[] = [];
  for (const row of records(body.items)) {
    const item = parseAssignmentSummary(row);
    if (item !== null) items.push(item);
  }
  return { items, nextCursor: str(body.next_cursor) };
}

/** Et resultat, eller null uten `result_id`. Versjonene sorteres og dubletter fjernes. */
export function parseResult(raw: unknown): AssignmentResult | null {
  if (!isRecord(raw)) return null;
  const resultId = str(raw.result_id);
  if (resultId === null) return null;
  const versions = Array.isArray(raw.versions)
    ? [...new Set(raw.versions.map(int).filter((v): v is number => v !== null && v > 0))].sort((a, b) => a - b)
    : [];
  return {
    resultId,
    service: str(raw.service) ?? "",
    presetId: str(raw.preset_id),
    serviceLabel: str(raw.service_label),
    optionLabel: str(raw.option_label),
    status: str(raw.status) ?? "",
    displayStatus: oneOf(raw.display_status, RESULT_STATUSES),
    version: int(raw.version) ?? 1,
    previousVersion: int(raw.previous_version),
    versions,
    approvedVersion: int(raw.approved_version),
    roundsLeft: int(raw.rounds_left),
    previewUrl: str(raw.preview_url),
    createdAt: str(raw.created_at) ?? "",
    updatedAt: str(raw.updated_at) ?? "",
  };
}

/** Et bilde, eller null uten `id`. Resultatene beholder rekkefoelgen fra backend. */
export function parseImage(raw: unknown): AssignmentImage | null {
  if (!isRecord(raw)) return null;
  const id = str(raw.id);
  if (id === null) return null;
  const results: AssignmentResult[] = [];
  for (const row of records(raw.results)) {
    const result = parseResult(row);
    if (result !== null) results.push(result);
  }
  return {
    id,
    position: int(raw.position) ?? 0,
    room: str(raw.room),
    fileName: str(raw.file_name) ?? "",
    width: int(raw.width),
    height: int(raw.height),
    thumbUrl: str(raw.thumb_url),
    originalUrl: str(raw.original_url),
    displayStatus: oneOf(raw.display_status, IMAGE_STATUSES),
    results,
  };
}

/** Hele ordren (K 2.3). Bildene sorteres etter `position` (stabilt), ogsaa om backend ikke gjorde det. */
export function parseAssignment(raw: unknown): Assignment | null {
  if (!isRecord(raw)) return null;
  const id = str(raw.id);
  if (id === null) return null;
  const images: AssignmentImage[] = [];
  for (const row of records(raw.images)) {
    const image = parseImage(row);
    if (image !== null) images.push(image);
  }
  images.sort((a, b) => a.position - b.position);
  const address = str(raw.address) ?? "";
  return {
    id,
    address,
    assignmentNo: str(raw.assignment_no),
    slug: str(raw.slug) ?? slugify(address),
    createdAt: str(raw.created_at) ?? "",
    updatedAt: str(raw.updated_at) ?? "",
    counts: parseCounts(raw.counts),
    images,
  };
}

/** Svaret paa bestillingen (K 2.7). `not_started` har alltid `resultId` null. */
export function parseOrderJobs(raw: unknown): OrderJobsResult {
  const body = isRecord(raw) ? raw : {};
  const items: OrderJobsItem[] = [];
  for (const row of records(body.items)) {
    const index = int(row.index);
    const imageId = str(row.image_id);
    if (index === null || imageId === null) continue;
    const status = str(row.status) ?? "queued";
    items.push({
      index,
      imageId,
      service: str(row.service) ?? "",
      resultId: status === "not_started" ? null : str(row.result_id),
      status,
      code: str(row.code),
    });
  }
  return {
    assignmentId: str(body.assignment_id) ?? "",
    duplicate: body.duplicate === true,
    items,
    quota: parseQuota(body.quota),
  };
}

// --- tekst -------------------------------------------------------------------

/**
 * Ordlistenoekkelen for statusen til et resultat (K 1). `processing` med
 * forrige versjon er «Ny versjon behandles». Ukjent eller manglende gir
 * «Ukjent status».
 */
export function resultStatusKey(status: ResultStatus | null, previousVersion: number | null = null): UiKey {
  switch (status) {
    case "processing":
      return previousVersion !== null ? "assignment.status.processingNew" : "assignment.status.processing";
    case "to_review":
      return "assignment.status.toReview";
    case "needs_answer":
      return "assignment.status.needsAnswer";
    case "approved":
      return "assignment.status.approved";
    case "not_used":
      return "assignment.status.notUsed";
    case "failed":
      return "assignment.status.failed";
    case "not_started":
      return "assignment.status.notStarted";
    default:
      return "status.unknown";
  }
}

/** Ordlistenoekkelen for statusen til et bilde (K 2.3). */
export function imageStatusKey(status: ImageStatus | null): UiKey {
  if (status === "original_only") return "assignment.status.originalOnly";
  return resultStatusKey(status);
}

// --- filnavn -----------------------------------------------------------------

const FOLD: Readonly<Record<string, string>> = { æ: "ae", ø: "o", å: "aa", Æ: "ae", Ø: "o", Å: "aa" };

/**
 * Slug som i filnavnene i K 2.8 (Petter 29.10): smaa bokstaver, æ→ae, ø→o,
 * å→aa, andre aksenter fjernes, alt annet blir `-`. Hoeyst 40 tegn.
 */
export function slugify(text: string, max = 40): string {
  const folded = text
    .replace(/[æøåÆØÅ]/g, (ch) => FOLD[ch])
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  return folded.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, max).replace(/-+$/, "");
}

/** Navnet paa ZIP-filen: `zip_name` fra manifestet, ellers slugen av adressen, ellers «ordre». */
export function zipFileName(zipName: string | null, address: string): string {
  const fromBackend = zipName === null ? "" : zipName.replace(/[\\/:*?"<>|]+/g, "-").trim();
  if (fromBackend.length > 0) return fromBackend.toLowerCase().endsWith(".zip") ? fromBackend : `${fromBackend}.zip`;
  return `${slugify(address) || "ordre"}.zip`;
}

// --- API-kall ----------------------------------------------------------------

/**
 * Kallet mot backend: `path` er relativ til API_BASE (f.eks.
 * `/v1/assignments`). Kobles til authedFetch (token og 401-retry) der
 * modulen tas i bruk.
 */
export type AssignmentRequest = (path: string, init: RequestInit) => Promise<Response>;

/**
 * Feil fra ordre-endepunktene (K 3): `code` fra `detail.code`, ellers null
 * (f.eks. 404 med `detail: "not found"`). `detail` er resten av feltene
 * (`reason`, `index`, `field` …). Teksten kommer fra ordlista, aldri herfra.
 */
export class AssignmentError extends Error {
  readonly httpStatus: number;
  readonly code: string | null;
  readonly detail: Record<string, unknown>;

  constructor(httpStatus: number, code: string | null, detail: Record<string, unknown> = {}) {
    super(`assignments failed (${httpStatus})${code ? `: ${code}` : ""}`);
    this.name = "AssignmentError";
    this.httpStatus = httpStatus;
    this.code = code;
    this.detail = detail;
  }
}

/**
 * Koden til ordlista (`assignmentError`) for en feil fra kallene: `detail.code`
 * fra backend, `not_found` for 404 (uten kode, K 3), `assignments_unavailable`
 * for 503 uten kode, ellers `http_<status>`. Alt som ikke er et svar fra
 * backend (nett, token), er `network`.
 */
export function assignmentErrorCode(err: unknown): string {
  if (!(err instanceof AssignmentError)) return "network";
  if (err.code !== null) return err.code;
  if (err.httpStatus === 404) return "not_found";
  if (err.httpStatus === 503) return "assignments_unavailable";
  return `http_${err.httpStatus}`;
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

async function expectJson(res: Response, ok: number): Promise<unknown> {
  if (res.status !== ok) throw await errorFrom(res);
  return readJson(res);
}

function jsonInit(method: string, body: unknown, headers: Record<string, string> = {}): RequestInit {
  return { method, headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) };
}

function assignmentPath(id: string): string {
  return `/v1/assignments/${encodeURIComponent(id)}`;
}

function imagePath(id: string, imageId: string): string {
  return `${assignmentPath(id)}/images/${encodeURIComponent(imageId)}`;
}

function required<T>(value: T | null, what: string): T {
  if (value === null) throw new AssignmentError(200, "invalid_response", { field: what });
  return value;
}

/** POST /v1/assignments (K 2.1). */
export async function createAssignment(
  request: AssignmentRequest,
  body: { address: string; assignmentNo?: string | null }
): Promise<Assignment> {
  const payload: Record<string, string> = { address: body.address };
  if (body.assignmentNo) payload.assignment_no = body.assignmentNo;
  const res = await request("/v1/assignments", jsonInit("POST", payload));
  return required(parseAssignment(await expectJson(res, 201)), "assignment");
}

/** GET /v1/assignments (K 2.2), nyeste foerst. */
export async function listAssignments(
  request: AssignmentRequest,
  opts: { limit?: number; cursor?: string | null } = {}
): Promise<AssignmentList> {
  const query = new URLSearchParams();
  if (opts.limit !== undefined) query.set("limit", String(opts.limit));
  if (opts.cursor) query.set("cursor", opts.cursor);
  const qs = query.toString();
  const res = await request(`/v1/assignments${qs ? `?${qs}` : ""}`, { method: "GET" });
  return parseAssignmentList(await expectJson(res, 200));
}

/** GET /v1/assignments/{id} (K 2.3). */
export async function getAssignment(request: AssignmentRequest, id: string): Promise<Assignment> {
  const res = await request(assignmentPath(id), { method: "GET" });
  return required(parseAssignment(await expectJson(res, 200)), "assignment");
}

/**
 * POST /v1/assignments/{id}/images (K 2.4): ett bilde per kall, multipart med
 * `image` og ev. `room`. Samme `Idempotency-Key` gir samme bilde.
 */
export async function uploadAssignmentImage(
  request: AssignmentRequest,
  opts: { id: string; file: File; room?: string | null; idempotencyKey: string; signal?: AbortSignal }
): Promise<AssignmentImage> {
  const form = new FormData();
  form.append("image", opts.file);
  if (opts.room) form.append("room", opts.room);
  const res = await request(`${assignmentPath(opts.id)}/images`, {
    method: "POST",
    headers: { "Idempotency-Key": opts.idempotencyKey },
    body: form,
    signal: opts.signal,
  });
  return required(parseImage(await expectJson(res, 201)), "image");
}

/** PATCH /v1/assignments/{id}/images/{image_id} (K 2.5): rom og/eller plass. */
export async function patchAssignmentImage(
  request: AssignmentRequest,
  opts: { id: string; imageId: string; room?: string | null; position?: number }
): Promise<AssignmentImage> {
  const payload: Record<string, unknown> = {};
  if (opts.room !== undefined) payload.room = opts.room;
  if (opts.position !== undefined) payload.position = opts.position;
  const res = await request(imagePath(opts.id, opts.imageId), jsonInit("PATCH", payload));
  return required(parseImage(await expectJson(res, 200)), "image");
}

/** DELETE /v1/assignments/{id}/images/{image_id} (K 2.6). 409 image_has_results naar bildet har resultater. */
export async function deleteAssignmentImage(
  request: AssignmentRequest,
  opts: { id: string; imageId: string }
): Promise<void> {
  const res = await request(imagePath(opts.id, opts.imageId), { method: "DELETE" });
  if (res.status !== 204) throw await errorFrom(res);
}

/** Et element i bestillingen slik backend vil ha det (K 2.7). Lages av board.ts. */
export interface OrderJobsWireItem {
  image_id: string;
  service: string;
  option?: string;
  source_season?: string;
}

/**
 * POST /v1/assignments/{id}/jobs (K 2.7): hoeyst 80 elementer per kall
 * (board.ts deler opp), `Idempotency-Key` paakrevd. 202 gir svaret per element.
 */
export async function orderAssignmentJobs(
  request: AssignmentRequest,
  opts: { id: string; items: OrderJobsWireItem[]; idempotencyKey: string }
): Promise<OrderJobsResult> {
  const res = await request(
    `${assignmentPath(opts.id)}/jobs`,
    jsonInit("POST", { items: opts.items }, { "Idempotency-Key": opts.idempotencyKey })
  );
  return parseOrderJobs(await expectJson(res, 202));
}
