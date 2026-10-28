// Bare typer, pluss de rene quota.ts, retry.ts og feedback.ts (.ts-endelse: testes med node --test).
import type { DuskSky, DuskStyle, DuskTime, ReviewDusk, ReviewStyle } from "./dusk";
import type { ReviewDisclosure } from "./disclosure";
import { parseQuota, type Quota } from "./quota.ts";
import { getWithRetry, isNetworkError, isRetryableStatus, TransientError } from "./retry.ts";
import {
  parseFeedback,
  ratingOrNull,
  type FeedbackRating,
  type FeedbackRequest,
  type FeedbackResult,
  type JobFeedback,
} from "./feedback.ts";

const apiBase = process.env.NEXT_PUBLIC_API_BASE;
if (!apiBase) {
  throw new Error(
    "NEXT_PUBLIC_API_BASE er ikke satt. Legg den i .env.local lokalt, " +
      "eller i Vercel Environment Variables (Production/Preview)."
  );
}
export const API_BASE: string = apiBase;

/**
 * Typet speil av backendens ProcessParams (Dag 18, PR #65).
 *
 * Alle felter er valgfrie: backend har defaults (scene_type="auto",
 * force_scene_type=false), og eksisterende sider som
 * sender tomt params-objekt skal beholde uendret oppfoersel.
 *
 * Kontrakt (POST /v1/process):
 * - force_scene_type=true uten scene_type="exterior" gir HTTP 400
 *   synkront (kastes som ValidationError fra submitJob).
 * - scene_type="interior" avvises av pipelinen (interior-preset er
 *   Fase A2) — kommer som rejected_interior i poll.
 */
export interface ProcessParams {
  scene_type?: "auto" | "exterior" | "interior";
  force_scene_type?: boolean;
  preset_id?: string;
  quality_tier?: string;
  /** Skumringsvalg (2f-b, TG-NEW-189): sendes alltid alle tre for skumring, ellers aldri. */
  dusk_time?: DuskTime;
  dusk_sky?: DuskSky;
  dusk_style?: DuskStyle;
  /** «Hvor er bildet tatt?» (TG-NEW-268): bare naar megleren har valgt, og bare lovlige valg. */
  image_type_hint?: ImageTypeHint;
}

/** Meglerens valg ved bestilling (TG-NEW-268, backend #257). Tomt: analysen avgjoer. */
export const IMAGE_TYPE_HINTS = ["interior", "exterior", "aerial"] as const;
export type ImageTypeHint = (typeof IMAGE_TYPE_HINTS)[number];

/** Koden for et valg tjenesten ikke godtar (400 ved bestilling); `hint` legges i `detail.reason`. */
export const IMAGE_TYPE_HINT_NOT_SUPPORTED = "image_type_hint_not_supported";

/**
 * Strukturert gate-avslag fra scene-type-gaten (TG-NEW-58).
 * `message` er den norske, bruker-rettede meldingen UTEN prefiks —
 * den kommer ferdig formulert fra backend og baerer alt UI trenger
 * (inkl. ev. confidence-tekst), saa Rejection holder seg til
 * {reason, message} og RejectionPanel trenger ingen endring.
 */
export type RejectionReason = "interior" | "uncertain";

export interface Rejection {
  reason: RejectionReason;
  message: string;
}

/**
 * Strukturert jobb-status fra GET /v1/jobs/{id} (TG-NEW-70).
 * Gate-avslag kommer naa som HTTP 200 med status="rejected" og et
 * `code`/`message`/`classifier`-felt — ikke lenger HTTP 500 med
 * `rejected_*:`-prefikset detail.
 */
interface JobStatusBody {
  job_id?: string;
  service?: string;
  status?: string;
  code?: string;
  message?: string;
  classifier?: { verdict?: string; confidence?: number };
  /**
   * Lekkasjen L1/L3: merket forhaandsvisning (awaiting_approval og
   * succeeded). null naar fila ikke er laget ennaa.
   */
  preview_url?: unknown;
  /** Grunner fra port 1 (needs_review, 2c-2). */
  reasons?: unknown;
  /** Meglerens egen begrunnelse ved rejected_by_reviewer (2d-1). */
  reason?: unknown;
  /** TG-NEW-117: naar bildene ble slettet. Bare med naar det er satt. */
  media_deleted_at?: unknown;
  /** P2 (Dag 56): grunnkodene naar vi ikke laget bildet (code not_created). */
  reason_codes?: unknown;
  /** P2 (Dag 56): om gratisbildet er gitt tilbake, for failed. */
  quota_return?: unknown;
}

/**
 * Port 1 har stoppet jobben foer generering (needs_review, 2c-2).
 * `code` er f.eks. gate_review eller fireplace_answer_missing; `reasons`
 * speiler GateResult.reasons (list[str]) i backend. Intern visning inntil
 * megler-teksten kommer.
 */
export interface Review {
  code: string;
  reasons: string[];
}

/**
 * Mapper backendens strukturerte avslags-svar til Rejection-typen utad.
 * `code` -> `reason`: rejected_interior -> "interior",
 * rejected_uncertain -> "uncertain". Returnerer null for ukjente koder.
 *
 * TG-NEW-70: backend leverer naa kode + ferdig melding direkte (ingen
 * prefiks aa strippe). Dette er fortsatt DET ENESTE stedet i frontend
 * som tolker rejected_*-koder — ikke tolk dem andre steder.
 */
export function parseRejection(body: JobStatusBody): Rejection | null {
  const reason: RejectionReason | null =
    body.code === "rejected_interior"
      ? "interior"
      : body.code === "rejected_uncertain"
        ? "uncertain"
        : null;
  if (reason === null) return null;
  return {
    reason,
    message: (body.message ?? "").trim(),
  };
}

/**
 * HTTP 400 fra POST /v1/process — strukturelt kontraktsbrudd i params
 * (f.eks. force_scene_type=true uten scene_type="exterior").
 * Skilles fra generiske submit-feil saa UI kan gi presis tilbakemelding.
 */
export class ValidationError extends Error {
  readonly status = 400;
  readonly detail: string;

  constructor(detail: string) {
    super(`Ugyldige parametre (HTTP 400): ${detail}`);
    this.name = "ValidationError";
    this.detail = detail;
  }
}

export interface SubmitErrorDetail {
  used?: unknown;
  limit?: unknown;
  reason?: unknown;
}

/**
 * Feil fra POST /v1/process med kode (TG-NEW-149, KONTRAKT_KVOTE), f.eks.
 * free_quota_exhausted (402), daily_capacity_reached (429),
 * quota_unavailable / job_create_failed (503), duplicate_request (409),
 * invalid_idempotency_key og unsupported_image (400). `code` er null naar
 * svaret ikke har en.
 * Teksten til brukeren kommer fra ordlista (gruppen orderError), aldri herfra.
 */
export class SubmitError extends Error {
  readonly httpStatus: number;
  readonly code: string | null;
  /** 402: `used`/`limit` fra svaret. 400 unsupported_image: `reason` (TG-NEW-185). Ellers tom. */
  readonly detail: SubmitErrorDetail;

  constructor(httpStatus: number, code: string | null, detail: SubmitErrorDetail = {}) {
    super(`submitJob failed (${httpStatus})${code ? `: ${code}` : ""}`);
    this.name = "SubmitError";
    this.httpStatus = httpStatus;
    this.code = code;
    this.detail = detail;
  }
}

export type SubmitResult =
  | { kind: "sync"; imageBlob: Blob; requestId: string }
  | {
      kind: "async";
      jobId: string;
      service: string;
      /** Samme Idempotency-Key igjen: ingen ny jobb, foelg den som vanlig. */
      duplicate: boolean;
      /** Kvoten etter trekket, eller null (privacy_blur, eldre svar). */
      quota: Quota | null;
    };

/**
 * Poll-resultat. Alt unntatt "pending" er terminalt — pollingen stopper.
 *
 * Kontrakt 2c-2 (godkjent av Petter Dag 29), begge HTTP 200 + JSON:
 * - awaiting_approval: {status, preview_url} — bildet finnes, ikke godkjent.
 *   Lekkasjen L2: bare den merkede `preview_url` brukes; null gir
 *   plassholder.
 * - succeeded: JSON {status, preview_url} (Lekkasjen L3) gir "done".
 *   Et 200-svar som ikke er JSON gir "unknown", aldri et bilde (L4).
 * - needs_review: {status, code, reasons} — port 1 stoppet, intet bilde.
 * Ukjent status (200-JSON eller 202) gir "unknown": aldri evig polling,
 * aldri roed feil.
 *
 * Kontrakt 2d-1a (Petter 28.09, alternativ B): jobb avvist av megleren er
 * HTTP 200 + JSON {status:"failed", code:"rejected_by_reviewer", reason}.
 * Det er en avgjoerelse, ikke en feil -> "rejected_by_reviewer".
 *
 * TG-NEW-156 (Petter 04.10): feilet jobb er HTTP 200 + JSON
 * {status:"failed", code:"job_failed"} -> "failed" med detail "job_failed",
 * ogsaa uten kode eller med ukjent kode. 500 taales til backend er endret
 * (pollJob kaster, og useJobStatus proever igjen).
 *
 * P2 (Dag 56): {status:"failed", code:"not_created", reason_codes} er en jobb
 * vi ikke laget (porten) -> "failed" med detail "not_created" og
 * `notCreated`. Alle failed-svarene kan ha `quota_return`; `quotaReturn` er
 * bare med naar verdien er kjent og ikke null (som `mediaDeletedAt`).
 */
export type JobResult =
  | { kind: "pending"; status: "queued" | "running"; retryAfterMs?: number }
  | { kind: "done"; previewUrl: string | null; jobId: string; mediaDeletedAt?: string }
  | { kind: "awaiting_approval"; previewUrl: string | null; jobId: string; mediaDeletedAt?: string }
  | { kind: "needs_review"; review: Review }
  | { kind: "unknown"; status: string | null; httpStatus: number }
  | { kind: "rejected_by_reviewer"; reason: string | null; quotaReturn?: QuotaReturn }
  | {
      kind: "failed";
      detail: string;
      rejection?: Rejection;
      notCreated?: NotCreated;
      quotaReturn?: QuotaReturn;
    };

/** Fast detail for en feilet jobb (TG-NEW-156). Aldri tekst fra bodyen. */
export const JOB_FAILED = "job_failed";

/** P2 (Dag 56): koden for en jobb vi ikke laget (porten). */
export const NOT_CREATED = "not_created";

/** Grunnkodene for en jobb vi ikke laget; aldri tekst fra analysen. */
export interface NotCreated {
  reasonCodes: string[];
}

/**
 * P2 (Dag 56): om gratisbildet er gitt tilbake for en feilet jobb.
 * "returned" er det eneste som lover noe; "not_returned" og null (ingen
 * reservasjon, eller ledgeren kunne ikke leses) gir ingen tekst.
 */
export type QuotaReturn = "returned" | "not_returned" | null;

/** `quota_return` strengt lest: ukjent verdi eller ikke tekst gir null. */
export function parseQuotaReturn(raw: unknown): QuotaReturn {
  return raw === "returned" || raw === "not_returned" ? raw : null;
}

/** `quotaReturn` bare naar den er kjent (som pollDeleted). */
function pollQuota(data: { quota_return?: unknown }): { quotaReturn?: QuotaReturn } {
  const q = parseQuotaReturn(data.quota_return);
  return q === null ? {} : { quotaReturn: q };
}

function unknownStatus(status: unknown, httpStatus: number): JobResult {
  return {
    kind: "unknown",
    status: typeof status === "string" ? status : null,
    httpStatus,
  };
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

/**
 * TG-NEW-117: poll sender `media_deleted_at` bare naar bildene er slettet.
 * Mangler feltet, mangler det ogsaa her (ikke slettet).
 */
function pollDeleted(data: JobStatusBody): { mediaDeletedAt?: string } {
  const at = nonEmptyString(data.media_deleted_at);
  return at === null ? {} : { mediaDeletedAt: at };
}

/**
 * Tolker status-JSON fra HTTP 200. Det ENESTE stedet som kjenner
 * terminal-statusene i poll-kontrakten.
 */
export function parseStatusBody(data: JobStatusBody, jobId: string): JobResult {
  if (data.status === "rejected") {
    const rejection = parseRejection(data);
    const detail = data.message ?? data.code ?? "rejected";
    return rejection !== null
      ? { kind: "failed", detail, rejection }
      : { kind: "failed", detail };
  }
  if (data.status === "awaiting_approval") {
    // Lekkasjen L2: bare den merkede forhaandsvisningen. Mangler den, viser
    // siden plassholder.
    return {
      kind: "awaiting_approval",
      previewUrl: nonEmptyString(data.preview_url),
      jobId: data.job_id ?? jobId,
      ...pollDeleted(data),
    };
  }
  if (data.status === "succeeded") {
    // Lekkasjen L3: "done" med den merkede URL-en, eller null (plassholder).
    return {
      kind: "done",
      previewUrl: nonEmptyString(data.preview_url),
      jobId: data.job_id ?? jobId,
      ...pollDeleted(data),
    };
  }
  if (data.status === "failed" && data.code === "rejected_by_reviewer") {
    return { kind: "rejected_by_reviewer", reason: nonEmptyString(data.reason), ...pollQuota(data) };
  }
  if (data.status === "failed" && data.code === NOT_CREATED) {
    // P2: vi laget ikke bildet. Bare kodene, aldri feiltekst.
    return {
      kind: "failed",
      detail: NOT_CREATED,
      notCreated: { reasonCodes: stringList(data.reason_codes) },
      ...pollQuota(data),
    };
  }
  if (data.status === "failed") {
    // TG-NEW-156: feilet jobb, ogsaa uten kode eller med ukjent kode. Fast
    // detail, aldri tekst fra bodyen (TG-NEW-121).
    return { kind: "failed", detail: JOB_FAILED, ...pollQuota(data) };
  }
  if (data.status === "needs_review") {
    const reasons = Array.isArray(data.reasons)
      ? data.reasons.filter((r): r is string => typeof r === "string")
      : [];
    return {
      kind: "needs_review",
      review: { code: data.code ?? "", reasons },
    };
  }
  return unknownStatus(data.status, 200);
}

/**
 * Token-henter fra Clerk (useAuth().getToken). Opsjonen skipCache brukes
 * ved 401-retry: Clerk-JWT-er lever ~60 s, saa jobber som poller lenger
 * enn det trenger et ferskt token midt i loopen.
 */
type GetToken = (options?: { skipCache?: boolean }) => Promise<string | null>;

async function authHeader(
  getToken: GetToken,
  options?: { skipCache?: boolean }
): Promise<HeadersInit> {
  const token = await getToken(options);
  if (!token) {
    throw new Error("Not authenticated: Clerk token unavailable");
  }
  return { Authorization: `Bearer ${token}` };
}

async function extractDetail(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { detail?: unknown };
    if (typeof data.detail === "string") return data.detail;
    return JSON.stringify(data);
  } catch {
    try {
      return await res.text();
    } catch {
      return `${res.status} ${res.statusText}`;
    }
  }
}

export async function submitJob(opts: {
  service: string;
  image: File;
  /** Typet params (foretrukket). Serialiseres internt. */
  params?: ProcessParams;
  /**
   * Raa JSON-streng (legacy). Ignoreres hvis `params` er satt.
   * Beholdt for bakoverkompatibilitet med eksisterende kall-steder.
   */
  paramsJson?: string;
  /** Én per bestilling, samme ved nytt forsoek (se orderKey.ts). */
  idempotencyKey?: string;
  getToken: GetToken;
}): Promise<SubmitResult> {
  const { service, image, params, idempotencyKey, getToken } = opts;

  // params (typet) har forrang; deretter legacy paramsJson; ellers "{}".
  // JSON.stringify utelater undefined-felter, saa et ProcessParams-objekt
  // med kun noen felter satt sender bare de feltene — backend-defaults
  // gjelder for resten (identisk med dagens oppfoersel for tomt objekt).
  const paramsJson =
    params !== undefined ? JSON.stringify(params) : opts.paramsJson ?? "{}";

  const form = new FormData();
  form.append("service", service);
  form.append("image", image);
  form.append("params_json", paramsJson);

  const headers = new Headers(await authHeader(getToken));
  if (idempotencyKey !== undefined) headers.set("Idempotency-Key", idempotencyKey);

  const res = await fetch(`${API_BASE}/v1/process`, {
    method: "POST",
    headers,
    body: form,
  });

  if (res.status === 200) {
    // Sync-tjenester (privacy_blur) svarer med bytes. Bildet er ikke
    // KI-endret (Q1), og denne grenen staar (Lekkasjen L4 fjernet bare
    // bytes fra poll).
    const imageBlob = await res.blob();
    const requestId = res.headers.get("X-Request-ID") ?? "";
    return { kind: "sync", imageBlob, requestId };
  }

  if (res.status === 202) {
    const data = (await res.json()) as {
      job_id: string;
      service: string;
      duplicate?: unknown;
      quota?: unknown;
    };
    return {
      kind: "async",
      jobId: data.job_id,
      service: data.service,
      duplicate: data.duplicate === true,
      quota: parseQuota(data.quota),
    };
  }

  // Feil med kode (kvoten, TG-NEW-149) gaar foran den gamle 400-grenen:
  // invalid_idempotency_key er 400, men ingen ValidationError.
  const raw = await res.text().catch(() => "");
  const body = parseJsonOrNull(raw);
  const code = errorCode(body);
  if (code !== null) {
    const outer = isRecord(body) ? body : {};
    const inner = isRecord(outer.detail) ? outer.detail : {};
    // TG-NEW-268: valget tjenesten ikke godtar, staar i `hint`; teksten velges etter det (orderErrorText).
    const reason = code === IMAGE_TYPE_HINT_NOT_SUPPORTED ? inner.hint : inner.reason;
    throw new SubmitError(res.status, code, { used: inner.used, limit: inner.limit, reason });
  }

  if (res.status === 400) {
    throw new ValidationError(detailText(body, raw, res));
  }

  throw new Error(`submitJob failed (${res.status}): ${detailText(body, raw, res)}`);
}

function parseJsonOrNull(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Feilteksten i et svar som allerede er lest (samme form som extractDetail). */
function detailText(body: unknown, raw: string, res: Response): string {
  if (body === null) return raw || `${res.status} ${res.statusText}`;
  if (isRecord(body) && typeof body.detail === "string") return body.detail;
  return JSON.stringify(body);
}

// ---------------------------------------------------------------------------
// Bestilling av Digital styling (S2-f, KONTRAKT_BESTILLING)
// ---------------------------------------------------------------------------

/** `params_json` i POST /v1/orders/styling. Ukjente felt avvises (400 invalid_order). */
export interface StylingOrderParams {
  styles: string[];
  furnish_as: string;
  /** Megleren bekrefter at rommet er tomt (Petter 3A). Alltid bokstavelig true. */
  room_empty_confirmed: true;
  /**
   * Mengde pynt (TG-NEW-257): bare 1, 3 eller 5. Mangler feltet, bruker
   * backend stilens eget nivaa («Anbefalt for stilen»).
   */
  decor_level?: 1 | 3 | 5;
  /**
   * Meglerens oensker (TG-NEW-250): hoeyst 300 tegn (kodepunkter), bare for
   * `living` og `living_dining`, og bare naar teksten ikke er tom. Ellers
   * utelates noekkelen. Logges aldri.
   */
  wishes?: string;
}

/**
 * En rad i `jobs`: én per stil, i rekkefoelgen fra `styles`. `not_started`
 * har `jobId` null og skal ikke polles; `code` sier hvorfor (capacity,
 * job_create_failed, submit_error, eller null i et duplikatsvar).
 */
export interface OrderJob {
  presetId: string;
  jobId: string | null;
  status: string;
  code: string | null;
}

export interface StylingOrderResult {
  orderId: string;
  /** Samme Idempotency-Key igjen: samme bestilling, ingen nye jobber og intet nytt trekk. */
  duplicate: boolean;
  jobs: OrderJob[];
  /** Kvoten etter trekket, `{limited: false}` for admin, eller null. */
  quota: Quota | null;
}

export const ORDER_NOT_STARTED = "not_started";

/**
 * 202-svaret fra POST /v1/orders/styling. Strengt: en rad uten `preset_id`
 * droppes, og `not_started` har alltid `jobId` null, ogsaa om backend
 * skulle sende en id.
 */
export function parseStylingOrder(raw: unknown): StylingOrderResult {
  const body = isRecord(raw) ? raw : {};
  const jobs: OrderJob[] = [];
  for (const row of records(body.jobs)) {
    const presetId = nonEmptyString(row.preset_id);
    if (presetId === null) continue;
    const status = nonEmptyString(row.status) ?? "queued";
    jobs.push({
      presetId,
      jobId: status === ORDER_NOT_STARTED ? null : nonEmptyString(row.job_id),
      status,
      code: nonEmptyString(row.code),
    });
  }
  return {
    orderId: nonEmptyString(body.order_id) ?? "",
    duplicate: body.duplicate === true,
    jobs,
    quota: parseQuota(body.quota),
  };
}

/**
 * POST /v1/orders/styling: ett bilde, én opplasting og én Idempotency-Key
 * for hele bestillingen (1-3 stiler, én kvote-enhet). Feilene kastes som i
 * submitJob: kode gir SubmitError, 400 uten kode ValidationError.
 */
export async function submitStylingOrder(opts: {
  image: File;
  params: StylingOrderParams;
  /** Én per bestilling, samme ved nytt forsoek og ved dobbeltklikk (orderKey.ts). */
  idempotencyKey?: string;
  getToken: GetToken;
}): Promise<StylingOrderResult> {
  return submitOrder("/v1/orders/styling", "submitStylingOrder", opts);
}

// ---------------------------------------------------------------------------
// Bestilling av Aarstider (TG-NEW-271, Dag 57)
// ---------------------------------------------------------------------------

/**
 * `params_json` i POST /v1/orders/aarstid. Ukjente felt avvises (400
 * invalid_order). Backend sjekker kilden og parene foer kvoten:
 * season_source_not_supported (vinter) og season_target_not_supported.
 */
export interface AarstidOrderParams {
  /** 1-3 ulike maalaarstider, i den rekkefoelgen jobbene startes. */
  seasons: string[];
  /** Aarstiden bildet er tatt i: sommer, hoest eller vaar. */
  source_season: string;
  /** Bare «Utendørs»: backend godtar ikke andre valg for aarstider. */
  image_type_hint: "exterior";
}

/**
 * POST /v1/orders/aarstid: som submitStylingOrder (ett bilde, én
 * Idempotency-Key, én kvote-enhet, samme 202-svar med én jobb per aarstid).
 */
export async function submitAarstidOrder(opts: {
  image: File;
  params: AarstidOrderParams;
  idempotencyKey?: string;
  getToken: GetToken;
}): Promise<StylingOrderResult> {
  return submitOrder("/v1/orders/aarstid", "submitAarstidOrder", opts);
}

/** Felles for bestillingene: samme skjema, samme svar og samme feilform. */
async function submitOrder(
  path: string,
  name: string,
  opts: { image: File; params: StylingOrderParams | AarstidOrderParams; idempotencyKey?: string; getToken: GetToken }
): Promise<StylingOrderResult> {
  const { image, params, idempotencyKey, getToken } = opts;

  // Uten `service`: bestillingen er alltid scene_transform.
  const form = new FormData();
  form.append("image", image);
  form.append("params_json", JSON.stringify(params));

  const headers = new Headers(await authHeader(getToken));
  if (idempotencyKey !== undefined) headers.set("Idempotency-Key", idempotencyKey);

  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers,
    body: form,
  });

  if (res.status === 202) {
    return parseStylingOrder(await res.json().catch(() => null));
  }
  return orderFailure(res, name);
}

/**
 * «Lag i en annen aarstid» (Dag 58, TG-NEW-273, A1): POST
 * /v1/jobs/{job_id}/aarstid med `{"seasons": [...]}`. Ny bestilling fra
 * originalen til jobben, én kvote-enhet. Kilden og bildetypen tar backend fra
 * jobben, saa de sendes ikke (de gir 400 invalid_order). Samme 202-svar og
 * samme feilform som submitAarstidOrder.
 */
export async function submitSeasonFromJob(opts: {
  jobId: string;
  seasons: string[];
  /** Én per bestilling, samme ved nytt forsoek av samme valg (aarstidBytte.ts). */
  idempotencyKey?: string;
  getToken: GetToken;
}): Promise<StylingOrderResult> {
  const { jobId, seasons, idempotencyKey, getToken } = opts;
  const headers = new Headers(await authHeader(getToken));
  headers.set("Content-Type", "application/json");
  if (idempotencyKey !== undefined) headers.set("Idempotency-Key", idempotencyKey);

  const res = await fetch(`${API_BASE}/v1/jobs/${encodeURIComponent(jobId)}/aarstid`, {
    method: "POST",
    headers,
    body: JSON.stringify({ seasons }),
  });

  if (res.status === 202) {
    return parseStylingOrder(await res.json().catch(() => null));
  }
  return orderFailure(res, "submitSeasonFromJob");
}

/** Feilen fra en bestilling: kode gir SubmitError, 400 uten kode ValidationError. */
async function orderFailure(res: Response, name: string): Promise<never> {
  // Samme feilform som submitJob (KONTRAKT_KVOTE).
  const raw = await res.text().catch(() => "");
  const body = parseJsonOrNull(raw);
  const code = errorCode(body);
  if (code !== null) {
    const outer = isRecord(body) ? body : {};
    const inner = isRecord(outer.detail) ? outer.detail : {};
    throw new SubmitError(res.status, code, { used: inner.used, limit: inner.limit, reason: inner.reason });
  }

  if (res.status === 400) {
    throw new ValidationError(detailText(body, raw, res));
  }

  throw new Error(`${name} failed (${res.status}): ${detailText(body, raw, res)}`);
}

/**
 * Kvoten for gratisbilder (GET /v1/quota, TG-NEW-149). null ved 503
 * quota_unavailable, nettverksfeil eller ukjent form: da vises ingen
 * teller, og backend avgjoer ved bestillingen.
 */
export async function getQuota(opts: { getToken: GetToken }): Promise<Quota | null> {
  try {
    const res = await authedFetch(`${API_BASE}/v1/quota`, { method: "GET" }, opts.getToken);
    if (res.status !== 200) return null;
    return parseQuota(await readJson(res));
  } catch {
    return null;
  }
}

/** Parser Retry-After-header (sekunder) -> millisekunder, clampe 0-30 s. */
function parseRetryAfterMs(res: Response): number | undefined {
  const raw = res.headers.get("Retry-After");
  if (raw === null) return undefined;
  const seconds = Number(raw);
  if (!Number.isFinite(seconds) || seconds < 0) return undefined;
  return Math.min(seconds, 30) * 1000;
}

export async function pollJob(opts: {
  jobId: string;
  getToken: GetToken;
}): Promise<JobResult> {
  const { jobId, getToken } = opts;

  const url = `${API_BASE}/v1/jobs/${encodeURIComponent(jobId)}`;

  // Ingen nye forsoek her: afterPoll styrer pausene (TG-NEW-134). En
  // nettverksfeil blir TransientError, saa pollingen taaler en kaldstart.
  const send = async (options?: { skipCache?: boolean }) => {
    const headers = await authHeader(getToken, options);
    try {
      return await fetch(url, { method: "GET", headers });
    } catch (err) {
      if (!isNetworkError(err)) throw err;
      throw new TransientError(null, `pollJob failed (network): ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  let res = await send();

  // 401 = Clerk-tokenet har utloept (levetid ~60 s) — hent ferskt token
  // utenom cache og prov EN gang til. Vedvarende 401 faller gjennom til
  // den generiske feilgrenen nederst.
  if (res.status === 401) {
    res = await send({ skipCache: true });
  }

  if (res.status === 200) {
    // 200 er alltid status-JSON (Lekkasjen L3). Et svar som ikke er JSON
    // (f.eks. bildebytes) gir "unknown" uten at bodyen leses: aldri et
    // bilde fra poll (L4).
    const contentType = res.headers.get("Content-Type") ?? "";
    if (!contentType.includes("application/json")) {
      return unknownStatus(null, 200);
    }
    const data = ((await res.json()) ?? {}) as JobStatusBody;
    return parseStatusBody(data, jobId);
  }

  if (res.status === 202) {
    const retryAfterMs = parseRetryAfterMs(res);
    const data = ((await res.json()) ?? {}) as { status?: unknown };
    // Kun queued/running er ikke-terminale. Alt annet paa 202 stopper
    // pollingen (tidligere: evig polling paa ukjent status, AUDIT_2C avvik 4).
    if (data.status === "queued" || data.status === "running") {
      return { kind: "pending", status: data.status, retryAfterMs };
    }
    return unknownStatus(data.status, 202);
  }

  // Gate-avslag er ikke lenger HTTP 500 (TG-NEW-70 fjernet prefiks-formen);
  // 500 er derfor naa kun ekte pipeline-feil.
  const detail = await extractDetail(res);
  if (isRetryableStatus(res.status)) {
    throw new TransientError(res.status, `pollJob failed (${res.status}): ${detail}`);
  }
  throw new Error(`pollJob failed (${res.status}): ${detail}`);
}

/**
 * Wire-form (raa JSON) for en rad fra GET /v1/jobs — snake_case slik
 * backend sender den. Mappes til camelCase JobSummary internt.
 * Eksporteres ikke; kun listJobs ser denne formen.
 */
interface JobSummaryWire {
  job_id: string;
  service: string;
  status: string;
  created_at: string | null;
  /** Lekkasjen L1: merket miniatyr 640x427, eller null. */
  thumb_url?: unknown;
  /** Ventebildet (KONTRAKT_VENTEBILDE): dagsbildet 640x427, bare uten resultatbilde, ellers null. */
  original_thumb_url?: unknown;
  error: string | null;
  /** 2d-1a: kode for raden (rejected_by_reviewer, needs_review-koden) eller null. */
  code?: string | null;
  /** 2d-1a: meglerens begrunnelse ved rejected_by_reviewer, ellers null. */
  reason?: string | null;
  /** TG-NEW-127: false for en annen brukers jobb (scope=all). */
  is_owner?: boolean;
  /** TG-NEW-127: de 6 siste tegnene i eierens id, eller null. */
  owner_short?: string | null;
  /** TG-NEW-117: naar bildene i full stoerrelse ble slettet, eller null. */
  media_deleted_at?: unknown;
  /** TG-NEW-117: naar den merkede miniatyren ble slettet, eller null. */
  thumb_deleted_at?: unknown;
  /** G1b: oppskriften (f.eks. "skumring"), eller null mens jobben kjoerer. */
  preset_id?: unknown;
  /** TG-NEW-262: bestillingen jobben hoerer til, eller null (enkeltjobber og gamle jobber). */
  order_id?: unknown;
  /** P2 (Dag 56): grunnkodene for code not_created, ellers []. */
  reason_codes?: unknown;
  /** P2 (Dag 56): "returned", "not_returned" eller null; bare for failed. */
  quota_return?: unknown;
  /** TG-NEW-263: antall oensker tatt med (bare koder, aldri tekst), eller null. */
  wishes_summary?: unknown;
  /** Dag 58 (valg 1A): stjernene fra siste tilbakemelding (1–5), eller null. */
  feedback_rating?: unknown;
}

/**
 * Effektiv status fra GET /v1/jobs (backendens effective_job_status):
 * en foreldreloes queued/running eldre enn staleness-terskelen vises
 * som "failed", ikke som evig "kjoerer".
 */
export type JobSummaryStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "rejected"
  | "awaiting_approval"
  | "needs_review"
  | "unknown";

const KNOWN_SUMMARY_STATUSES: ReadonlySet<string> = new Set([
  "queued",
  "running",
  "succeeded",
  "failed",
  "rejected",
  "awaiting_approval",
  "needs_review",
]);

/** Ukjente verdier (f.eks. cancelled) blir "unknown" — /history krasjer aldri. */
export function normalizeSummaryStatus(raw: unknown): JobSummaryStatus {
  return typeof raw === "string" && KNOWN_SUMMARY_STATUSES.has(raw)
    ? (raw as JobSummaryStatus)
    : "unknown";
}

/**
 * En rad i jobb-historikken (GET /v1/jobs, TG-NEW-74 PR #76).
 *
 * Kontrakts-asymmetri vs. pollJob, viktig: listingen baerer en flat
 * `error`-streng for failed/rejected (allerede bruker-rettet og prefiks-
 * fri). Den har IKKE `classifier` slik singular poll har — saa History-
 * siden kjoerer IKKE parseRejection paa disse radene. Fra 2d-1a har raden
 * `code`/`reason`; en jobb avvist av megleren kjennes paa `code`, aldri
 * ved aa tolke `error`-teksten.
 *
 * Det eneste bildet er den merkede miniatyren `thumbUrl` (Lekkasjen L2).
 * En rad uten miniatyr vises uten bilde; det er ikke en feil.
 */
export interface JobSummary {
  jobId: string;
  service: string;
  status: JobSummaryStatus;
  createdAt: string | null;
  /**
   * Lekkasjen L2: den merkede miniatyren, det eneste bildet /history viser.
   * null naar den ikke er laget ennaa (hoeyst 4 nye per kall) eller feltet
   * mangler (eldre backend).
   */
  thumbUrl: string | null;
  /**
   * Ventebildet (KONTRAKT_VENTEBILDE): liten JPEG av dagsbildet megleren
   * lastet opp, uten AI-merke. Bare for rader uten resultatbilde; kan alltid
   * vaere null. Vises aldri som resultat (se jobMedia.ts).
   */
  originalThumbUrl: string | null;
  error: string | null;
  /**
   * Kode fra backend (2d-1a): "rejected_by_reviewer" for jobb avvist av
   * megleren, koden fra port 1 for needs_review, ellers null. Mangler
   * feltet (eldre backend), er den null.
   */
  code: string | null;
  /** Meglerens begrunnelse ved rejected_by_reviewer, ellers null. */
  reason: string | null;
  /**
   * TG-NEW-127: false bare naar backend sier `is_owner: false`. Mangler
   * feltet (eldre backend), regnes jobben som egen.
   */
  isOwner: boolean;
  /** De 6 siste tegnene i eierens id (for «Eier: …»), ellers null. */
  ownerShort: string | null;
  /**
   * TG-NEW-117: naar bildene i full stoerrelse ble slettet. Den merkede
   * miniatyren kan fortsatt finnes. null og undefined: ikke slettet.
   */
  mediaDeletedAt?: string | null;
  /** TG-NEW-117: naar den merkede miniatyren ble slettet. null og undefined: ikke slettet. */
  thumbDeletedAt?: string | null;
  /**
   * G1b: oppskriften jobben ble laget med (f.eks. "skumring"). null mens
   * jobben kjoerer, og naar feltet mangler (eldre backend); etiketten
   * bruker da reserven (presets.ts).
   */
  presetId: string | null;
  /**
   * TG-NEW-262: bestillingen jobben hoerer til (Historikken grupperer paa
   * den, historyGroups.ts). null for enkeltjobber, gamle jobber og naar
   * feltet mangler (eldre backend).
   */
  orderId: string | null;
  /** P2 (Dag 56): grunnkodene naar `code` er not_created, ellers tom. Mangler: tom. */
  reasonCodes?: string[];
  /** P2 (Dag 56): om gratisbildet er gitt tilbake (failed). Mangler: null. */
  quotaReturn?: QuotaReturn;
  /** TG-NEW-263: oppsummeringen av oenskene (bare tall). null og undefined: ingen linje. */
  wishesSummary?: WishesSummary | null;
  /** Dag 58: stjernene fra siste tilbakemelding (feedback.ts). null og undefined: ingen. */
  feedbackRating?: FeedbackRating | null;
}

/** Statusene i filteret «Venter paa meg» (GET /v1/jobs?status=, 2d-1a). */
export const WAITING_FOR_ME_STATUSES = ["awaiting_approval", "needs_review"] as const;

/** Omfanget i listen (TG-NEW-127): egne jobber, eller alle (bare admin). */
export type JobScope = "mine" | "all";

/**
 * Feilsvar fra GET /v1/jobs. `code` er `detail.code` fra backend, f.eks.
 * scope_not_allowed (403) eller invalid_scope (422), ellers null.
 */
export class ListJobsError extends Error {
  readonly httpStatus: number;
  readonly code: string | null;

  constructor(httpStatus: number, code: string | null) {
    super(`listJobs failed (${httpStatus})${code ? `: ${code}` : ""}`);
    this.name = "ListJobsError";
    this.httpStatus = httpStatus;
    this.code = code;
  }
}

/** Koden i et feilsvar: FastAPI pakker den i {"detail": {...}}. */
export function errorCode(body: unknown): string | null {
  const outer = isRecord(body) ? body : {};
  const inner = isRecord(outer.detail) ? outer.detail : outer;
  return stringOrNull(inner.code);
}

/**
 * Henter den autentiserte brukerens jobb-historikk (nyeste foerst) fra
 * GET /v1/jobs. Autorisering er server-side: backend avleder user_id fra
 * Clerk-tokenet, aldri fra en param — en bruker kan ikke be om en annens
 * historikk.
 *
 * Paginering (keyset, TG-NEW-79): `before` (createdAt) og `beforeId`
 * (jobId) er et PAR fra samme rad — den siste i forrige side. Backend
 * pagineres paa (created_at, job_id), saa rader som deler created_at paa
 * sidegrensen tapes ikke. `beforeId` er valgfri: utelates den, faller
 * backend tilbake til created_at-only (.lt) — bakoverkompatibelt. Begge
 * MAA komme fra samme rad, ellers blir keyset-paret inkonsistent.
 * Responsen er et bart array uten next-cursor; kalleren plukker selv
 * (createdAt, jobId) fra siste element. `limit` klemmes til [1, 100] paa
 * backend (default 50).
 *
 * Gaar gjennom authedFetch: samme 401-retry som pollJob (Clerk-JWT lever
 * ~60 s, saa et utloept token hentes paa nytt med skipCache og kallet
 * proeves EN gang til), og nye forsoek ved kaldstart (TG-NEW-134).
 */
export async function listJobs(opts: {
  limit?: number;
  before?: string;
  beforeId?: string;
  /** Statusfilter (2d-1a, hvitliste i backend), f.eks. WAITING_FOR_ME_STATUSES. */
  statuses?: readonly string[];
  /** TG-NEW-127: "all" sender scope=all; "mine" eller utelatt sender ingenting. */
  scope?: JobScope;
  getToken: GetToken;
  /** Kalles foer hver pause ved kaldstart (TG-NEW-134). */
  onRetry?: () => void;
}): Promise<JobSummary[]> {
  const { limit, before, beforeId, statuses, scope, getToken, onRetry } = opts;

  const params = new URLSearchParams();
  if (limit !== undefined) params.set("limit", String(limit));
  if (before !== undefined) params.set("before", before);
  if (beforeId !== undefined) params.set("before_id", beforeId);
  if (statuses !== undefined && statuses.length > 0) {
    params.set("status", statuses.join(","));
  }
  if (scope === "all") params.set("scope", "all");
  const qs = params.toString();
  const url = `${API_BASE}/v1/jobs${qs ? `?${qs}` : ""}`;

  const res = await authedFetch(url, { method: "GET" }, getToken, onRetry);

  if (res.status !== 200) {
    throw new ListJobsError(res.status, errorCode(await readJson(res)));
  }

  const rows = (await res.json()) as JobSummaryWire[];
  return rows.map((row) => ({
    jobId: row.job_id,
    service: row.service,
    status: normalizeSummaryStatus(row.status),
    createdAt: row.created_at,
    thumbUrl: nonEmptyString(row.thumb_url),
    originalThumbUrl: nonEmptyString(row.original_thumb_url),
    error: row.error,
    code: nonEmptyString(row.code),
    reason: nonEmptyString(row.reason),
    isOwner: row.is_owner !== false,
    ownerShort: nonEmptyString(row.owner_short),
    mediaDeletedAt: nonEmptyString(row.media_deleted_at),
    thumbDeletedAt: nonEmptyString(row.thumb_deleted_at),
    presetId: nonEmptyString(row.preset_id),
    orderId: nonEmptyString(row.order_id),
    reasonCodes: stringList(row.reason_codes),
    quotaReturn: parseQuotaReturn(row.quota_return),
    wishesSummary: toWishesSummary(row.wishes_summary),
    feedbackRating: ratingOrNull(row.feedback_rating),
  }));
}

// ---------------------------------------------------------------------------
// Egenskaper for visningen (TG-NEW-127): GET /me
// ---------------------------------------------------------------------------

/** Hva brukeren kan se. Aldri selve rollen; serveren sjekker alt selv. */
export interface Capabilities {
  /** Vis bryteren «Mine jobber / Alle brukere». */
  viewAll: boolean;
}

export const NO_CAPABILITIES: Capabilities = { viewAll: false };

/**
 * Leser `capabilities` fra GET /me. Mangler feltet eller noekkelen, eller er
 * verdien ikke `true`, er svaret false. Ukjente noekler ignoreres.
 */
export function parseCapabilities(raw: unknown): Capabilities {
  const r = isRecord(raw) ? raw : {};
  const caps = isRecord(r.capabilities) ? r.capabilities : {};
  return { viewAll: caps.view_all === true };
}

/**
 * GET /me (paa roten, ikke under /v1). Feil gir NO_CAPABILITIES, aldri
 * unntak: bryteren er bare visning, og siden skal virke uten den.
 */
export async function getCapabilities(opts: { getToken: GetToken }): Promise<Capabilities> {
  try {
    const res = await authedFetch(`${API_BASE}/me`, { method: "GET" }, opts.getToken);
    if (res.status !== 200) return NO_CAPABILITIES;
    return parseCapabilities(await readJson(res));
  } catch {
    return NO_CAPABILITIES;
  }
}

// ---------------------------------------------------------------------------
// Godkjenning (2d-1): GET /v1/jobs/{id}/review og POST /v1/jobs/{id}/decision
// ---------------------------------------------------------------------------

export type DecisionAction = "approve" | "reject" | "continue" | "correct";

/** `choose` (FE-3) er tatt ut i studio v2 (Dag 58): én runde gir ett resultat, uten kandidater. */
const DECISION_ACTIONS: ReadonlySet<string> = new Set(["approve", "reject", "continue", "correct"]);

/** Maks lengde paa begrunnelsen (backend renser og sjekker igjen, 422 over). */
export const REASON_MAX_LEN = 500;

/**
 * Hva som gjelder for gjeldende bilde (2d-2a): approved/disabled for
 * godkjente, candidate/promoted for ustabile og avviste.
 */
export type LightState = "approved" | "disabled" | "candidate" | "promoted";

const LIGHT_STATES: ReadonlySet<string> = new Set(["approved", "disabled", "candidate", "promoted"]);

/**
 * Boksen rundt en lyskilde i originalbildet (TG-NEW-148): `[ymin, xmin, ymax,
 * xmax]`, heltall 0-1000 (andel av hoeyden og bredden).
 */
export type LightBox = readonly [number, number, number, number];

/** En lyskilde fra analysen. `type` og `reasonCode` er koder, `location` fritekst. */
export interface ReviewLight {
  /** Noekkel i UI (2d-2a): "L1" for godkjente, "r2:L3" for kandidater. Tolkes aldri. */
  key: string | null;
  id: string | null;
  /** Kjoeringen kandidaten kom fra (1 eller 2); null for godkjente. */
  run: number | null;
  type: string | null;
  location: string | null;
  /** null naar backend ikke har boksen (lagt til for haand, eller gammel backend). */
  box: LightBox | null;
  /** Bare for avviste lyskilder, f.eks. "not_confirmed". */
  reasonCode: string | null;
  /** false naar id-en er tvetydig i kjoeringen, eller feltet mangler. */
  editable: boolean;
  state: LightState | null;
}

/** Retterunder (2d-2a). Antallet kommer alltid fra backend. */
export interface ReviewCorrection {
  roundsLeft: number;
  /** Siste retterunde feilet; jobben har forrige bilde, og runden er ikke telt. */
  lastRoundFailed: boolean;
  /**
   * «Endre valg» (TG-NEW-145, KONTRAKT_ENDRE_VALG §3): valgene «Rett» tar imot,
   * f.eks. ["dusk_style", "dusk_sky"] eller ["style", "decor_level"]. Tom naar
   * feltet mangler (backend uten CORRECT_CHOICES) eller tjenesten ikke har valg.
   * normalizeReview setter alltid feltet; mangler det (testdata), er det tomt.
   */
  choicesAccepted?: string[];
  /** Valgene gjeldende bilde ble laget med, som utgangspunkt for velgeren; null (eller mangler) uten. */
  currentChoices?: CurrentChoices | null;
  /**
   * «Marker og beskriv» (FE-3, Dag 58, BE-7b): `correction.local_accepted`. Bare med
   * LOCAL_EDIT i backend; mangler feltet, er det false.
   */
  localAccepted?: boolean;
  /** Rundetaket for brukeren (`correction.max_rounds`); null naar feltet mangler. */
  maxRounds?: number | null;
  /**
   * Koden naar siste retterunde feilet (`correction.last_round_error`, Petter 28.10),
   * f.eks. `mask_empty`. null naar feltet mangler eller er tomt.
   */
  lastRoundError?: string | null;
}

/** Nummeret paa en endring i en lokal runde (studio v2: inntil 4). */
export type LocalEditNumber = 1 | 2 | 3 | 4;

/**
 * En endring i den lokale runden (studio v2, `local.edits[]`): nummeret,
 * instruksen, boksen (hjoernene i 0–1, null naar den mangler), lengden paa
 * teksten, teksten og status: "ok" eller koden for hvorfor endringen ikke ble
 * gjort. Teksten (fritekst, D2) faar bare eieren; null for andre og etter
 * slettejobben.
 */
export interface ReviewLocalEdit {
  k: LocalEditNumber;
  instruction: ReviewLocalInstruction | null;
  box: { from: { x: number; y: number }; to: { x: number; y: number } } | null;
  textLen: number | null;
  text: string | null;
  status: string;
}

/** `local` i review-svaret (studio v2, lr2): runden bak gjeldende bilde og endringene i den. */
export interface ReviewLocal {
  round: number | null;
  /** Endringen runden proevde igjen («Prøv igjen»), eller null. */
  retryOf: LocalEditNumber | null;
  edits: ReviewLocalEdit[];
}

/**
 * `correction.current_choices` (KONTRAKT_ENDRE_VALG §3), som koder. Kveldsbilde
 * har `duskStyle` og `duskSky` (stilen megleren ba om, ogsaa en gammel v1/v2),
 * styling har `style` og `decorLevel`; resten er null.
 */
export interface CurrentChoices {
  duskStyle: string | null;
  duskSky: string | null;
  style: string | null;
  /** 1, 3 eller 5; null er stilens eget nivaa (eller ukjent). */
  decorLevel: 1 | 3 | 5 | null;
}

/**
 * `choices` i body for «Rett» (KONTRAKT_ENDRE_VALG §1): bare feltene som er
 * endret. Et felt som mangler, beholder valget gjeldende bilde ble laget med.
 * `decor_level: null` er stilens eget nivaa. `dusk_time` sendes aldri.
 */
export interface CorrectionChoices {
  dusk_style?: string;
  dusk_sky?: string;
  style?: string;
  decor_level?: 1 | 3 | 5 | null;
}

/** Body for «Rett»: hele avviket fra analysen, ikke endringen fra forrige runde. */
export interface CorrectionOverrides {
  promote: { run: number; id: string }[];
  disable: string[];
  add: never[];
}

/** Valgene en runde ble laget med (bare koder; etiketten lages i compare.ts). */
export interface RoundChoices {
  time: string | null;
  sky: string | null;
  /** false: himmelvalget ble ikke brukt (ingen himmel i bildet). null: ukjent. */
  skyApplied: boolean | null;
  fireplaceFire: "yes" | "no" | null;
  /** Runden ble laget med lysene justert i forhold til analysen. */
  lightsChanged: boolean;
  /**
   * Stilen runden ble bestilt med (TG-NEW-145, V-a): `dusk_style` for
   * Kveldsbilde, `styling_…` for styling; null naar feltet mangler. toRoundChoices
   * setter alltid feltet; mangler det (testdata), gjelder null.
   */
  style?: string | null;
  /** Pyntnivaaet runden ble bestilt med (styling): 1, 3, 5, eller null. */
  decorLevel?: 1 | 3 | 5 | null;
}

/** En runde i `images.rounds`. Lenkene er merkede forhaandsvisninger eller null. */
export interface ReviewRound {
  round: number;
  current: boolean;
  previewUrl: string | null;
  /** Bare admin; alle andre: alltid null. */
  rawPreviewUrl: string | null;
  choices: RoundChoices | null;
  /**
   * Kontrollen av tillegg for runden (`images.rounds[].additions_check`). En
   * lokal runde har kontrollen fra basen (backend C2), saa den er lik. Mangler
   * i eldre testdata.
   */
  additionsCheck?: AdditionsCheck;
}

/** Trinnene for lysstyrke (TG-NEW-147): -2 til 2. Navnet lages fra trinnet i brightness.ts. */
export type BrightnessStep = -2 | -1 | 0 | 1 | 2;

/** Ett trinn i `review.brightness.steps`. `null`-lenke gir plassholder. */
export interface ReviewBrightnessStep {
  step: BrightnessStep;
  /** Merket forhaandsvisning av trinnet fra backend. */
  previewUrl: string | null;
}

/**
 * `review.brightness` (KONTRAKT_LYSSTYRKE §2). Gjelder bare gjeldende runde.
 * Mangler feltet (eldre backend), er `available` false og siden som foer.
 */
export interface ReviewBrightness {
  available: boolean;
  /** Trinnet som er lik gjeldende bilde: 0 for nye jobber, 1 for gamle. */
  defaultStep: BrightnessStep | null;
  /** Satt etter godkjenning med lysstyrke, ellers null. */
  approvedStep: BrightnessStep | null;
  /** Sortert fra -2 til 2, hvert trinn bare en gang. */
  steps: ReviewBrightnessStep[];
}

/**
 * Kontrollen av tillegg (TG-NEW-199, backend #174): mulige tillegg i
 * resultatbildet for gjeldende runde. Frontend styrer bare paa `level`;
 * backend har regnet det ut. Ukjent eller manglende nivaa blir `unchecked`.
 */
export type AdditionsLevel = "warning" | "note" | "none" | "unchecked";

export interface AdditionItem {
  kind: "warning" | "note";
  /** Kode, f.eks. "new_window"; ukjent type gir «annen endring». */
  type: string | null;
  /** `[ymin, xmin, ymax, xmax]` (0-1000) i resultatbildet, ikke originalen; null uten boks. */
  box: LightBox | null;
  confidence: string | null;
  /** Fritekst fra modellen (engelsk). Vises bare for admin. */
  location: string | null;
}

export interface AdditionsCheck {
  /** Bare for logg og feilsoeking; visningen bruker `level`. */
  status: string | null;
  level: AdditionsLevel;
  items: AdditionItem[];
}

export interface RunValue {
  value: string | null;
  runValues: string[];
}

/**
 * `image_type` i review-svaret (TG-NEW-268): `value` er typen bildet ble
 * laget med. `source` og `hint` kommer bare naar jobben ble bestilt med
 * IMAGE_TYPE_CHOICE paa; mangler `source`, er den "analysis".
 */
export interface ImageTypeView extends RunValue {
  /** normalizeReview setter alltid feltet; mangler det (testdata), gjelder "analysis". */
  source?: "broker" | "analysis";
  /** Meglerens valg, bare kjente verdier; ellers null (eller mangler). */
  hint?: ImageTypeHint | null;
}

/**
 * Det megleren trenger for aa avgjoere en jobb (GET /v1/jobs/{id}/review).
 * Bare koder og data; tekstene kommer fra ordlista (app/lib/i18n).
 */
/**
 * Retningen i originalen slik backend leste den foer modellene (TG-NEW-170).
 * `value`: EXIF-retningen 1-8, eller null (ingen, eller ugyldig i fila).
 * `applied`: pikslene ble snudd (bare for 2-8). Da er boksene i samme ramme
 * som nettleseren viser originalen i.
 */
export interface InputOrientation {
  value: number | null;
  applied: boolean;
}

export interface JobReviewDetail {
  jobId: string;
  status: string;
  /**
   * `ai_jobs.version` slik backend leste raden (TG-NEW-130). Sendes uendret
   * tilbake som `expected_version`; null naar backend ikke sender feltet.
   */
  version: number | null;
  /**
   * TG-NEW-127: false naar brukeren ser en annen brukers jobb (bare lesing).
   * Mangler feltet (eldre backend), regnes jobben som egen.
   */
  isOwner: boolean;
  /** gate_review | fireplace_answer_missing | not_created (P2) | null */
  code: string | null;
  reasonCodes: string[];
  /** P2 (Dag 56): om gratisbildet er gitt tilbake (bare failed); ellers null. */
  quotaReturn: QuotaReturn;
  flagCodes: string[];
  /** Bare kjente handlinger; ukjente fra backend ignoreres. */
  allowedActions: DecisionAction[];
  validRuns: number;
  fireplace: { present: boolean; disagreement: boolean; answer: string | null };
  imageType: ImageTypeView;
  skyVisibility: RunValue;
  /** Skumringsvalgene (2f-a); null naar backend ikke sender feltet. */
  dusk: ReviewDusk | null;
  /**
   * Stilen jobben ba om og stilen gjeldende runde ble laget med (TG-NEW-189).
   * Mangler feltet (backend foer Stil v2 PR 4): standard bestilt, ingen brukt.
   */
  style: ReviewStyle;
  /** Kodene til merketeksten (merking PR 1); null naar ikke skumring eller feltet mangler. */
  disclosure: ReviewDisclosure | null;
  lights: { approved: ReviewLight[]; unstable: ReviewLight[]; rejected: ReviewLight[] };
  correction: ReviewCorrection;
  images: {
    originalUrl: string | null;
    /** Bildet fra forrige runde, eller null foer foerste runde er ferdig. */
    previous: {
      round: number | null;
      /** Lekkasjen L1: merket forhaandsvisning av forrige runde, eller null. */
      previewUrl: string | null;
    } | null;
    /**
     * Lekkasjen L2: de merkede forhaandsvisningene er de eneste KI-bildene
     * siden viser. null (eller feltet mangler) gir plassholder.
     */
    previewUrl: string | null;
    /** Merket forhaandsvisning av det raa bildet; bare admin, ellers null. */
    rawPreviewUrl: string | null;
    /**
     * Alle runder med et resultat (TG-NEW-141, KONTRAKT_RUNDER). null naar
     * backend ikke sender feltet (gammel backend): siden bruker da feltene over.
     */
    rounds: ReviewRound[] | null;
  };
  decisions: { action: string | null; at: string | null; byRole: string | null; reason: string | null }[];
  /** Lysstyrke for gjeldende runde (TG-NEW-147). */
  brightness: ReviewBrightness;
  /**
   * TG-NEW-117: naar bildene ble slettet. Da er alle bildefeltene null og
   * `allowedActions` tom. null og undefined: ikke slettet.
   */
  mediaDeletedAt?: string | null;
  /**
   * TG-NEW-170: null for jobber fra foer rettingen (eller feltet mangler).
   * Da sjekker markoerene retningen i originalen selv (orientation.ts).
   */
  inputOrientation: InputOrientation | null;
  /** Kontrollen av tillegg for gjeldende runde (TG-NEW-199). Mangler feltet: `unchecked`. */
  additionsCheck: AdditionsCheck;
  /** G1b: oppskriften jobben ble laget med, eller null (feltet mangler eller er tomt). */
  presetId: string | null;
  /**
   * G1c: panelene oppskriften bruker. null naar feltet mangler (backend foer
   * G1c): da vises alle fem, som foer (presets.ts).
   */
  reviewPanels: ReviewPanel[] | null;
  /**
   * D-5c (TG-NEW-249): jobbene i bestillingen, eldst foerst, ogsaa denne.
   * null for enkeltjobber, gamle jobber, ved lesefeil i backend og naar
   * feltet mangler (eldre backend): da er siden som foer.
   */
  order: ReviewOrder | null;
  /** D-5c (TG-NEW-260): rammen. Mangler feltet: ikke maalt. */
  framing: ReviewFraming;
  /**
   * TG-NEW-263: meglerens oensker og svaret paa dem. null uten oensker (og
   * naar feltet mangler). Teksten er bare med for eieren og foer A1.
   */
  wishes: ReviewWishes | null;
  /**
   * «Marker og beskriv» (studio v2, Dag 58): den lokale runden bak gjeldende
   * bilde og endringene i den. null uten lokal runde, uten LOCAL_EDIT, for en
   * gammel runde med kandidater (FE-3) og naar feltet mangler.
   */
  local?: ReviewLocal | null;
}

// ---- Oenskene (TG-NEW-263, backend #254) ---------------------------------------
// Bare kjente koder; ukjente blir null, saa siden aldri viser en kode raatt.

export const WISH_VERSIONS = ["w1", "w2"] as const;
export const PLAN_STATUSES = ["ok", "error", "skipped", "empty", "not_applicable"] as const;
export const WISH_STATUSES = ["followed", "partly", "not_possible"] as const;
export const WISH_REASONS = [
  "none",
  "rule_door",
  "rule_fixed",
  "not_in_list",
  "no_space",
  "conflict",
  "unclear",
  "rule_window",
] as const;

export type WishVersion = (typeof WISH_VERSIONS)[number];
export type PlanStatus = (typeof PLAN_STATUSES)[number];
export type WishStatus = (typeof WISH_STATUSES)[number];
export type WishReason = (typeof WISH_REASONS)[number];

/** Ett oenske i planen. `text` bare i w2, bare for eieren og foer A1. */
export interface WishItem {
  no: number;
  /** null: planleggeren vurderte ikke linja (w2), eller ukjent kode. */
  status: WishStatus | null;
  reason: WishReason | null;
  text: string | null;
}

export interface ReviewWishes {
  /** null: ingen plan (porten stoppet foer planen, analysen feilet, eller planen var av). */
  version: WishVersion | null;
  planStatus: PlanStatus | null;
  /** A1 har toemt teksten. */
  cleared: boolean;
  /** Hele oensket (w1 og uten plan), bare for eieren og foer A1; ellers null. */
  text: string | null;
  items: WishItem[];
}

/** Oppsummeringen i jobblisten: bare tall, aldri tekst. */
export interface WishesSummary {
  planStatus: PlanStatus | null;
  count: number;
  followed: number;
  partly: number;
}

function oneOf<T extends string>(list: readonly T[], value: unknown): T | null {
  return typeof value === "string" && (list as readonly string[]).includes(value) ? (value as T) : null;
}

function count(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : 0;
}

/**
 * `wishes` i review-svaret, strengt lest. Ikke et objekt gir null. Rader
 * uten et heltall `no` fra 1 hoppes over, og bare den foerste per nummer
 * tas med. `text` bare naar den er tekst og ikke tom.
 */
export function toReviewWishes(raw: unknown): ReviewWishes | null {
  if (!isRecord(raw)) return null;
  const seen = new Set<number>();
  const items: WishItem[] = [];
  for (const item of records(raw.items)) {
    const no = item.no;
    if (typeof no !== "number" || !Number.isInteger(no) || no < 1 || seen.has(no)) continue;
    seen.add(no);
    items.push({
      no,
      status: oneOf(WISH_STATUSES, item.status),
      reason: oneOf(WISH_REASONS, item.reason),
      text: nonEmptyString(item.text),
    });
  }
  return {
    version: oneOf(WISH_VERSIONS, raw.version),
    planStatus: oneOf(PLAN_STATUSES, raw.plan_status),
    cleared: raw.cleared === true,
    text: nonEmptyString(raw.text),
    items,
  };
}

/** `wishes_summary` i jobblisten, strengt lest. Ikke et objekt gir null. */
export function toWishesSummary(raw: unknown): WishesSummary | null {
  if (!isRecord(raw)) return null;
  return {
    planStatus: oneOf(PLAN_STATUSES, raw.plan_status),
    count: count(raw.count),
    followed: count(raw.followed),
    partly: count(raw.partly),
  };
}

/** En jobb i bestillingen (D-5c). `thumbUrl` er den merkede miniatyren, eller null. */
export interface ReviewOrderJob {
  jobId: string;
  presetId: string | null;
  status: string;
  thumbUrl: string | null;
  /** TG-NEW-262: koden som i jobblista (f.eks. rejected_by_reviewer), ellers null. Mangler feltet: null. */
  code: string | null;
}

export interface ReviewOrder {
  orderId: string;
  jobs: ReviewOrderJob[];
}

/**
 * Andelen av KI-bildet som ligger utenfor originalfotoet, i prosent med én
 * desimal (TG-NEW-260). `measured` er sann bare med et tall.
 */
export interface ReviewFraming {
  outsidePct: number | null;
  measured: boolean;
}

/**
 * `order` (D-5c): strengt lest. Ikke et objekt, uten `order_id` eller uten
 * en liste med jobber gir null. Rader uten `job_id` hoppes over, og en
 * `job_id` som staar to ganger, tas bare med foerste gang. Rekkefoelgen
 * fra backend beholdes (eldst foerst).
 */
export function toReviewOrder(raw: unknown): ReviewOrder | null {
  if (!isRecord(raw)) return null;
  const orderId = nonEmptyString(raw.order_id);
  if (orderId === null || !Array.isArray(raw.jobs)) return null;
  const seen = new Set<string>();
  const jobs: ReviewOrderJob[] = [];
  for (const j of records(raw.jobs)) {
    const jobId = nonEmptyString(j.job_id);
    if (jobId === null || seen.has(jobId)) continue;
    seen.add(jobId);
    jobs.push({
      jobId,
      presetId: nonEmptyString(j.preset_id),
      status: stringOrNull(j.status) ?? "unknown",
      // Lekkasjen L2: bare den merkede miniatyren.
      thumbUrl: nonEmptyString(j.thumb_url),
      code: nonEmptyString(j.code),
    });
  }
  return { orderId, jobs };
}

/** `framing` (D-5c): maalt bare med `measured: true` og et endelig tall >= 0. */
export function toFraming(raw: unknown): ReviewFraming {
  if (!isRecord(raw)) return { outsidePct: null, measured: false };
  const pct = raw.outside_pct;
  if (raw.measured !== true || typeof pct !== "number" || !Number.isFinite(pct) || pct < 0) {
    return { outsidePct: null, measured: false };
  }
  return { outsidePct: pct, measured: true };
}

/** Panelene paa godkjenningssiden som en oppskrift kan bruke (G1c). */
export type ReviewPanel = "fireplace" | "dusk" | "style" | "lights" | "correct";

const REVIEW_PANELS: ReadonlySet<string> = new Set(["fireplace", "dusk", "style", "lights", "correct"]);

/**
 * `review_panels` (G1c): strengt lest. Ikke en liste (eller feltet mangler)
 * gir null; ukjente navn droppes, og en tom liste er `[]`.
 */
export function toReviewPanels(raw: unknown): ReviewPanel[] | null {
  if (!Array.isArray(raw)) return null;
  return raw.filter((v): v is ReviewPanel => typeof v === "string" && REVIEW_PANELS.has(v));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Boksen leses strengt: fire heltall i 0-1000, ellers null (som `light_box` i backend). */
export function toLightBox(value: unknown): LightBox | null {
  if (!Array.isArray(value) || value.length !== 4) return null;
  if (!value.every((v) => Number.isInteger(v) && v >= 0 && v <= 1000)) return null;
  return [value[0], value[1], value[2], value[3]];
}

function toLight(raw: Record<string, unknown>): ReviewLight {
  const state = stringOrNull(raw.state);
  return {
    key: stringOrNull(raw.key),
    id: stringOrNull(raw.id),
    run: numberOrNull(raw.run),
    type: stringOrNull(raw.type),
    location: stringOrNull(raw.location),
    box: toLightBox(raw.box),
    reasonCode: stringOrNull(raw.reason_code),
    editable: raw.editable === true,
    state: state !== null && LIGHT_STATES.has(state) ? (state as LightState) : null,
  };
}

function toDusk(raw: unknown): ReviewDusk | null {
  if (!isRecord(raw)) return null;
  return {
    time: stringOrNull(raw.time),
    sky: stringOrNull(raw.sky),
    skyApplied: typeof raw.sky_applied === "boolean" ? raw.sky_applied : null,
  };
}

function toStyle(raw: unknown): ReviewStyle {
  const style = isRecord(raw) ? raw : {};
  return {
    requested: stringOrNull(style.requested) ?? "nordic_blue_hour_v1",
    applied: stringOrNull(style.applied),
  };
}

/**
 * `edited` leses strengt: er lista ikke en liste, eller har den noe som ikke
 * er tekst, blir den null (ugyldig) i stedet for aa filtreres. Ellers kunne
 * et ledd falle bort i stillhet.
 */
function toDisclosure(raw: unknown): ReviewDisclosure | null {
  if (!isRecord(raw)) return null;
  const edited = raw.edited;
  return {
    version: stringOrNull(raw.version),
    base: stringOrNull(raw.base),
    time: stringOrNull(raw.time),
    scope: stringOrNull(raw.scope),
    edited:
      Array.isArray(edited) && edited.every((v): v is string => typeof v === "string") ? edited : null,
    source: stringOrNull(raw.source),
    sourceSeason: stringOrNull(raw.source_season),
    status: stringOrNull(raw.status),
  };
}

function toRoundChoices(raw: unknown): RoundChoices | null {
  if (!isRecord(raw)) return null;
  const fire = raw.fireplace_fire;
  return {
    time: stringOrNull(raw.time),
    sky: stringOrNull(raw.sky),
    skyApplied: typeof raw.sky_applied === "boolean" ? raw.sky_applied : null,
    fireplaceFire: fire === "yes" || fire === "no" ? fire : null,
    lightsChanged: raw.lights_changed === true,
    style: nonEmptyString(raw.style),
    decorLevel: toDecorLevel(raw.decor_level),
  };
}

/** 1, 3 eller 5 (heltall); alt annet er null. */
function toDecorLevel(raw: unknown): 1 | 3 | 5 | null {
  return raw === 1 || raw === 3 || raw === 5 ? raw : null;
}

/** `correction.current_choices`: strengt lest; ikke et objekt gir null. */
function toCurrentChoices(raw: unknown): CurrentChoices | null {
  if (!isRecord(raw)) return null;
  return {
    duskStyle: nonEmptyString(raw.dusk_style),
    duskSky: nonEmptyString(raw.dusk_sky),
    style: nonEmptyString(raw.style),
    decorLevel: toDecorLevel(raw.decor_level),
  };
}

/**
 * `images.rounds`: null naar feltet mangler eller ikke er en liste (gammel
 * backend). Rader uten heltallig `round` hoppes over. Bare de to merkede
 * lenkene leses (KONTRAKT_LEKKASJE §8).
 */
function toRounds(raw: unknown): ReviewRound[] | null {
  if (!Array.isArray(raw)) return null;
  return raw.filter(isRecord).flatMap((r) =>
    typeof r.round === "number" && Number.isInteger(r.round) && r.round >= 0
      ? [
          {
            round: r.round,
            current: r.current === true,
            previewUrl: nonEmptyString(r.preview_url),
            rawPreviewUrl: nonEmptyString(r.raw_preview_url),
            choices: toRoundChoices(r.choices),
            additionsCheck: toAdditionsCheck(r.additions_check),
          },
        ]
      : []
  );
}

export function isBrightnessStep(value: unknown): value is BrightnessStep {
  return typeof value === "number" && Number.isInteger(value) && value >= -2 && value <= 2;
}

function brightnessStepOrNull(value: unknown): BrightnessStep | null {
  return isBrightnessStep(value) ? value : null;
}

/**
 * `review.brightness`: strengt lest. Trinn utenfor -2..2 hoppes over, et
 * trinn som staar to ganger tas bare med foerste gang, og lenken leses
 * bare fra trinnets egen `preview_url` (ingen tilbakefall).
 */
function toBrightness(raw: unknown): ReviewBrightness {
  if (!isRecord(raw)) return { available: false, defaultStep: null, approvedStep: null, steps: [] };
  const seen = new Set<number>();
  const steps: ReviewBrightnessStep[] = [];
  for (const s of records(raw.steps)) {
    if (!isBrightnessStep(s.step) || seen.has(s.step)) continue;
    seen.add(s.step);
    steps.push({ step: s.step, previewUrl: nonEmptyString(s.preview_url) });
  }
  steps.sort((a, b) => a.step - b.step);
  return {
    available: raw.available === true,
    defaultStep: brightnessStepOrNull(raw.default_step),
    approvedStep: brightnessStepOrNull(raw.approved_step),
    steps,
  };
}

/**
 * `input_orientation`: strengt lest. Alt som ikke er `{value: 1-8 | null,
 * applied: boolean}`, gir null. Det gjelder ogsaa kombinasjoner som ikke
 * henger sammen (Petter 08.10): `applied` er sann bare for 2-8.
 */
export function toInputOrientation(raw: unknown): InputOrientation | null {
  if (!isRecord(raw) || typeof raw.applied !== "boolean") return null;
  const value = raw.value;
  if (value !== null && !(typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 8)) return null;
  if (raw.applied !== (value !== null && value >= 2)) return null;
  return { value, applied: raw.applied };
}

const ADDITIONS_LEVELS: ReadonlySet<string> = new Set(["warning", "note", "none", "unchecked"]);

/**
 * `additions_check` (TG-NEW-199): strengt lest. Ukjent nivaa gir `unchecked`,
 * poster med ukjent `kind` hoppes over, og en ugyldig boks blir null (posten
 * vises da bare i lista).
 */
export function toAdditionsCheck(raw: unknown): AdditionsCheck {
  if (!isRecord(raw)) return { status: null, level: "unchecked", items: [] };
  const level = stringOrNull(raw.level);
  return {
    status: stringOrNull(raw.status),
    level: level !== null && ADDITIONS_LEVELS.has(level) ? (level as AdditionsLevel) : "unchecked",
    items: records(raw.items).flatMap((item): AdditionItem[] =>
      item.kind === "warning" || item.kind === "note"
        ? [
            {
              kind: item.kind,
              type: stringOrNull(item.type),
              box: toLightBox(item.box),
              confidence: stringOrNull(item.confidence),
              location: stringOrNull(item.location),
            },
          ]
        : []
    ),
  };
}

function toRunValue(raw: unknown): RunValue {
  const r = isRecord(raw) ? raw : {};
  return { value: stringOrNull(r.value), runValues: stringList(r.run_values) };
}

/** `image_type` med `source` og `hint` strengt lest (TG-NEW-268). */
export function toImageType(raw: unknown): ImageTypeView {
  const r = isRecord(raw) ? raw : {};
  const hint = typeof r.hint === "string" && (IMAGE_TYPE_HINTS as readonly string[]).includes(r.hint)
    ? (r.hint as ImageTypeHint)
    : null;
  return { ...toRunValue(raw), source: r.source === "broker" ? "broker" : "analysis", hint };
}

/**
 * Normaliserer review-svaret. Manglende eller feil felt gir tomme verdier,
 * aldri krasj; ukjente koder beholdes og oversettes med generisk tekst.
 */
export function normalizeReview(raw: unknown, jobId: string): JobReviewDetail {
  const r = isRecord(raw) ? raw : {};
  const fireplace = isRecord(r.fireplace) ? r.fireplace : {};
  const lights = isRecord(r.lights) ? r.lights : {};
  const images = isRecord(r.images) ? r.images : {};
  const previous = isRecord(images.previous) ? images.previous : null;
  const correction = isRecord(r.correction) ? r.correction : {};
  const roundsLeft = numberOrNull(correction.rounds_left);
  return {
    jobId: stringOrNull(r.job_id) ?? jobId,
    status: stringOrNull(r.status) ?? "unknown",
    version: typeof r.version === "number" && Number.isInteger(r.version) && r.version >= 0 ? r.version : null,
    isOwner: r.is_owner !== false,
    code: stringOrNull(r.code),
    reasonCodes: stringList(r.reason_codes),
    quotaReturn: parseQuotaReturn(r.quota_return),
    flagCodes: stringList(r.flag_codes),
    allowedActions: stringList(r.allowed_actions).filter((a): a is DecisionAction =>
      DECISION_ACTIONS.has(a)
    ),
    validRuns: typeof r.valid_runs === "number" ? r.valid_runs : 0,
    fireplace: {
      present: fireplace.present === true,
      disagreement: fireplace.disagreement === true,
      answer: stringOrNull(fireplace.answer),
    },
    imageType: toImageType(r.image_type),
    skyVisibility: toRunValue(r.sky_visibility),
    dusk: toDusk(r.dusk),
    style: toStyle(r.style),
    disclosure: toDisclosure(r.disclosure),
    lights: {
      approved: records(lights.approved).map(toLight),
      unstable: records(lights.unstable).map(toLight),
      rejected: records(lights.rejected).map(toLight),
    },
    correction: {
      roundsLeft: roundsLeft !== null && roundsLeft > 0 ? roundsLeft : 0,
      lastRoundFailed: correction.last_round_failed === true,
      choicesAccepted: stringList(correction.choices_accepted),
      currentChoices: toCurrentChoices(correction.current_choices),
      localAccepted: correction.local_accepted === true,
      maxRounds: numberOrNull(correction.max_rounds),
      lastRoundError: nonEmptyString(correction.last_round_error),
    },
    images: {
      originalUrl: stringOrNull(images.original_url),
      previous:
        previous === null
          ? null
          : {
              round: numberOrNull(previous.round),
              previewUrl: nonEmptyString(previous.preview_url),
            },
      previewUrl: nonEmptyString(images.preview_url),
      rawPreviewUrl: nonEmptyString(images.raw_preview_url),
      rounds: toRounds(images.rounds),
    },
    decisions: records(r.decisions).map((d) => ({
      action: stringOrNull(d.action),
      at: stringOrNull(d.at),
      byRole: stringOrNull(d.by_role),
      reason: stringOrNull(d.reason),
    })),
    brightness: toBrightness(r.brightness),
    mediaDeletedAt: nonEmptyString(r.media_deleted_at),
    inputOrientation: toInputOrientation(r.input_orientation),
    additionsCheck: toAdditionsCheck(r.additions_check),
    presetId: nonEmptyString(r.preset_id),
    reviewPanels: toReviewPanels(r.review_panels),
    order: toReviewOrder(r.order),
    framing: toFraming(r.framing),
    wishes: toReviewWishes(r.wishes),
    local: toReviewLocal(r.local),
  };
}

function editNumber(value: unknown): LocalEditNumber | null {
  return value === 1 || value === 2 || value === 3 || value === 4 ? value : null;
}

const LOCAL_INSTRUCTION_SET: ReadonlySet<string> = new Set(["text", "original", "fire_out", "light", "remove", "add"]);

/**
 * Boksen som [[x0, y0], [x1, y1]] i 0–1, eller null ved feil form. Formen
 * fra forespoerselen ({shape: "box", points}) godtas ogsaa: kontrakten sier
 * `box`, men ikke formen (AVVIK i rapporten).
 */
function toEditBox(value: unknown): ReviewLocalEdit["box"] {
  const raw = isRecord(value) ? value.points : value;
  if (!Array.isArray(raw) || raw.length !== 2) return null;
  const pts: number[][] = [];
  for (const p of raw) {
    if (!Array.isArray(p) || p.length !== 2) return null;
    const [x, y] = p;
    if (typeof x !== "number" || typeof y !== "number" || !(x >= 0 && x <= 1 && y >= 0 && y <= 1)) return null;
    pts.push([x, y]);
  }
  return {
    from: { x: Math.min(pts[0][0], pts[1][0]), y: Math.min(pts[0][1], pts[1][1]) },
    to: { x: Math.max(pts[0][0], pts[1][0]), y: Math.max(pts[0][1], pts[1][1]) },
  };
}

/**
 * `local` (studio v2, `decisions.local_view`) strengt lest: endringer med k
 * 1–4, hver én gang, sortert etter k. Uten status blir den "unknown", saa
 * siden aldri viser ✓ uten at backend sa "ok". Uten endringer (ogsaa en
 * gammel runde med kandidater): null.
 */
export function toReviewLocal(raw: unknown): ReviewLocal | null {
  if (!isRecord(raw)) return null;
  const edits: ReviewLocalEdit[] = [];
  for (const e of records(raw.edits)) {
    const k = editNumber(e.k);
    if (k === null || edits.some((x) => x.k === k)) continue;
    const instruction = typeof e.instruction === "string" && LOCAL_INSTRUCTION_SET.has(e.instruction)
      ? (e.instruction as ReviewLocalInstruction)
      : null;
    const textLen = typeof e.text_len === "number" && Number.isInteger(e.text_len) && e.text_len >= 0 ? e.text_len : null;
    const text = nonEmptyString(e.text);
    edits.push({ k, instruction, box: toEditBox(e.box), textLen, text, status: nonEmptyString(e.status) ?? "unknown" });
  }
  if (edits.length === 0) return null;
  edits.sort((a, b) => a.k - b.k);
  return { round: numberOrNull(raw.round), retryOf: editNumber(raw.retry_of), edits };
}

export type ReviewFetchResult =
  | { kind: "ok"; review: JobReviewDetail }
  /** 404: ukjent, fremmed eller ikke en skumringsjobb (samme svar). */
  | { kind: "not_found" }
  /** 503: degradert modus i backend. */
  | { kind: "unavailable" }
  | { kind: "error"; httpStatus: number };

/**
 * Kall med samme 401-retry som pollJob. GET proeves i tillegg paa nytt ved
 * kaldstart (getWithRetry, TG-NEW-134); POST proeves aldri paa nytt der.
 */
async function authedFetch(
  url: string,
  init: RequestInit,
  getToken: GetToken,
  onRetry?: () => void
): Promise<Response> {
  const isGet = (init.method ?? "GET").toUpperCase() === "GET";
  const send = async (options?: { skipCache?: boolean }) => {
    const once = async () =>
      fetch(url, {
        ...init,
        headers: { ...(init.headers ?? {}), ...(await authHeader(getToken, options)) },
      });
    return isGet ? getWithRetry(once, { onRetry }) : once();
  };
  const res = await send();
  if (res.status !== 401) return res;
  return send({ skipCache: true });
}

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export async function getReview(opts: {
  jobId: string;
  getToken: GetToken;
  /** Kalles foer hver pause ved kaldstart (TG-NEW-134). */
  onRetry?: () => void;
}): Promise<ReviewFetchResult> {
  const { jobId, getToken, onRetry } = opts;
  const url = `${API_BASE}/v1/jobs/${encodeURIComponent(jobId)}/review`;
  const res = await authedFetch(url, { method: "GET" }, getToken, onRetry);
  if (res.status === 200) {
    return { kind: "ok", review: normalizeReview(await readJson(res), jobId) };
  }
  if (res.status === 404) return { kind: "not_found" };
  if (res.status === 503) return { kind: "unavailable" };
  return { kind: "error", httpStatus: res.status };
}

/**
 * GET /v1/jobs/{id}/download (merking PR 4): det godkjente bildet med
 * AI-ikonet. Svaret tolkes av downloadMarkedImage i download.ts.
 */
export async function fetchJobDownload(opts: {
  jobId: string;
  getToken: GetToken;
}): Promise<Response> {
  const url = `${API_BASE}/v1/jobs/${encodeURIComponent(opts.jobId)}/download`;
  return authedFetch(url, { method: "GET" }, opts.getToken);
}

/**
 * GET /v1/jobs/{id}/privacy-download (dag 51): personvern-resultatet som PNG
 * med bytene uendret, bare for eieren. Ikke KI-endret, saa ingen merking;
 * aldri /download. Svaret tolkes av downloadPrivacyImage i download.ts.
 */
export async function fetchPrivacyDownload(opts: {
  jobId: string;
  getToken: GetToken;
}): Promise<Response> {
  const url = `${API_BASE}/v1/jobs/${encodeURIComponent(opts.jobId)}/privacy-download`;
  return authedFetch(url, { method: "GET" }, opts.getToken);
}

export interface DecisionRequest {
  action: DecisionAction;
  /** Valgfri, bare ved reject. Hoeyst REASON_MAX_LEN tegn. */
  reason?: string;
  /** Peissvar ved continue (2d-1b) og correct (2d-2a; utelatt = forrige svar). */
  fireplace_fire?: "yes" | "no";
  /** Bare ved correct (2d-2a). */
  overrides?: CorrectionOverrides;
  /** `version` fra review-svaret siden viser (TG-NEW-130); utelatt uten version. */
  expected_version?: number;
  /** Bare ved approve naar lysstyrke finnes (TG-NEW-147). */
  brightness_step?: BrightnessStep;
  /** Bare ved approve naar kontrollen ga `warning` (TG-NEW-199); ellers 422. */
  additions_acknowledged?: boolean;
  /** Bare ved correct, og bare de endrede valgene (TG-NEW-145). Utelatt: samme valg. */
  choices?: CorrectionChoices;
  /** «Marker og beskriv» ved correct (studio v2); aldri sammen med overrides, choices eller peissvar. */
  local?: LocalRequest;
}

/**
 * De gamle instruksene i «Marker og beskriv» (Slukk, Tenn, Fjern dette og
 * Legg til). Frontend sender dem ikke lenger, men review viser dem for runder
 * fra foer fritekst.
 */
export type LocalInstruction = "fire_out" | "light" | "remove" | "add";

/**
 * Instruksen i review: "text" for fritekst og "original" for «Som i
 * originalen» (nye runder), ellers en av de gamle.
 */
export type ReviewLocalInstruction = "text" | "original" | LocalInstruction;

/**
 * En endring i body (Dag 58): boksen med hjoernene i 0–1 i resultatets ramme
 * og hva som skal endres der (fritekst, 1–500 tegn), eller `mode: "original"`
 * uten tekst («Som i originalen», ORIGINAL_BYGG: pikslene hentes fra
 * originalen, uten modellkall). Ingen instruks.
 */
export type LocalEditRequest =
  | { shape: { shape: "box"; points: [number, number][] }; text: string }
  | { shape: { shape: "box"; points: [number, number][] }; mode: "original" };

/**
 * `local` i body (studio v2): 1–4 endringer, eller «Prøv igjen» paa endring k
 * i gjeldende runde. Aldri begge (backend: 400 local_invalid).
 */
export type LocalRequest = { edits: LocalEditRequest[] } | { retry: LocalEditNumber };

/**
 * Utfallet av POST /v1/jobs/{id}/decision:
 * - updated (200): avgjort, hent review paa nytt. «Avbryt» i et stopp
 *   (P2, Dag 56) har `quota_return`; `quotaReturn` er bare med da.
 * - poll (202): jobben kjoerer (continue); poll til awaiting_approval eller
 *   sluttstatus, hent saa review paa nytt.
 * - status_changed (409): noen andre har avgjort, eller siden viser en eldre
 *   versjon (TG-NEW-130); last paa nytt og vis melding.
 * - blocked (409 action_not_allowed/original_missing/correction_limit/
 *   media_deleted, 422 invalid_decision med eventuell override_code):
 *   vis melding. media_deleted (TG-NEW-117): bildene er slettet.
 *   additions_not_acknowledged (TG-NEW-199): krysset mangler ved advarsel.
 * - unavailable (503): archive_failed eller backend uten database; trygt aa
 *   proeve igjen.
 * - not_found (404), error (alt annet).
 */
export type DecisionOutcome =
  | { kind: "updated"; status: string | null; quotaReturn?: QuotaReturn }
  | { kind: "poll"; status: string | null }
  | { kind: "status_changed"; status: string | null }
  | { kind: "blocked"; code: string | null; fields: string[]; overrideCode: string | null }
  | { kind: "unavailable"; code: string | null }
  | { kind: "not_found" }
  | { kind: "error"; httpStatus: number };

/**
 * Ren tolkning av svaret. FastAPI pakker feil i {"detail": {...}}; formen
 * uten innpakning godtas ogsaa.
 */
/** 400-kodene for valgene i «Rett» (KONTRAKT_ENDRE_VALG §2). */
export const CHOICE_ERROR_CODES: ReadonlySet<string> = new Set([
  "invalid_choice",
  "choices_not_accepted",
  "choices_not_supported",
]);

/** 400-kodene for «Marker og beskriv» (BE-7b og studio v2), foer claim og 0 kr. */
export const LOCAL_ERROR_CODES: ReadonlySet<string> = new Set([
  "local_not_accepted",
  "local_exclusive",
  "local_not_supported",
  "local_invalid",
  "shape_not_supported",
  "shape_invalid",
  "instruction_invalid",
  "text_required",
  "text_too_long",
  "text_not_accepted",
  "edits_count",
  "edits_overlap",
  "retry_invalid",
]);

export function parseDecisionResponse(httpStatus: number, body: unknown): DecisionOutcome {
  const outer = isRecord(body) ? body : {};
  const inner = isRecord(outer.detail) ? outer.detail : outer;
  const code = stringOrNull(inner.code);
  const status = stringOrNull(inner.status);
  if (httpStatus === 200) {
    return "quota_return" in inner
      ? { kind: "updated", status, quotaReturn: parseQuotaReturn(inner.quota_return) }
      : { kind: "updated", status };
  }
  if (httpStatus === 202) return { kind: "poll", status };
  if (httpStatus === 404) return { kind: "not_found" };
  if (httpStatus === 409 && code === "status_changed") {
    return { kind: "status_changed", status };
  }
  if (httpStatus === 409 || httpStatus === 422) {
    return {
      kind: "blocked",
      code,
      fields: stringList(inner.fields),
      overrideCode: stringOrNull(inner.override_code),
    };
  }
  if (httpStatus === 400 && code !== null && (CHOICE_ERROR_CODES.has(code) || LOCAL_ERROR_CODES.has(code))) {
    // «Endre valg» (KONTRAKT_ENDRE_VALG §2): 400 foer claim, 0 kr. `field` sier hvilket valg.
    const field = stringOrNull(inner.field);
    return { kind: "blocked", code, fields: field === null ? [] : [field], overrideCode: null };
  }
  if (httpStatus === 503) return { kind: "unavailable", code };
  return { kind: "error", httpStatus };
}

export async function postDecision(opts: {
  jobId: string;
  decision: DecisionRequest;
  getToken: GetToken;
}): Promise<DecisionOutcome> {
  const { jobId, decision, getToken } = opts;
  const url = `${API_BASE}/v1/jobs/${encodeURIComponent(jobId)}/decision`;
  const res = await authedFetch(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(decision),
    },
    getToken
  );
  return parseDecisionResponse(res.status, await readJson(res));
}

// ---------------------------------------------------------------------------
// Tilbakemelding fra megleren (Dag 58): POST og GET /v1/jobs/{id}/feedback
// ---------------------------------------------------------------------------

/**
 * POST /v1/jobs/{id}/feedback (RAPPORT_FEEDBACK_BE §3): 201 er lagret, 400 er
 * ugyldig vurdering, knapp, tekst eller runde (koden i `detail.code`, f.eks.
 * `tag_invalid`). Alt annet (409 `action_not_allowed` og `feedback_not_allowed`,
 * 503) er en feil; tilbakemeldingen stopper aldri noe, saa kortet viser bare en linje.
 */
export async function postFeedback(opts: {
  jobId: string;
  body: FeedbackRequest;
  getToken: GetToken;
}): Promise<FeedbackResult> {
  const url = `${API_BASE}/v1/jobs/${encodeURIComponent(opts.jobId)}/feedback`;
  const res = await authedFetch(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(opts.body),
    },
    opts.getToken
  );
  if (res.status === 201) return { kind: "ok" };
  if (res.status === 400) return { kind: "invalid", code: errorCode(await readJson(res)) };
  return { kind: "error" };
}

/**
 * GET /v1/jobs/{id}/feedback: siste innsending fra `{feedback, tags_allowed}`
 * (RAPPORT_FEEDBACK_BE §3), eller null naar det ikke finnes noen
 * (`feedback: null` eller 404). Andre svar kaster, saa kalleren kan vise en
 * feil i stedet for aa sende uten forrige innsending. Knappene staar i
 * feedback.ts; `tags_allowed` brukes ikke.
 */
export async function getFeedback(opts: { jobId: string; getToken: GetToken }): Promise<JobFeedback | null> {
  const url = `${API_BASE}/v1/jobs/${encodeURIComponent(opts.jobId)}/feedback`;
  const res = await authedFetch(url, { method: "GET" }, opts.getToken);
  if (res.status === 404 || res.status === 204) return null;
  if (res.status !== 200) throw new Error(`getFeedback failed (${res.status})`);
  const body = await readJson(res);
  return parseFeedback(isRecord(body) ? body.feedback : null);
}
