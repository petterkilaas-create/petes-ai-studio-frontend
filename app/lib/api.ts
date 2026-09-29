// Bare typer: api.ts har ingen runtime-importer (testes med node --test).
import type { DuskSky, DuskTime, ReviewDusk } from "./dusk";
import type { ReviewDisclosure } from "./disclosure";

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
 * force_scene_type=false, model=flux2_flex), og eksisterende sider som
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
  model?: "flux2_flex" | "gpt_image_2" | "nano_banana_pro";
  quality_tier?: string;
  /** Skumringsvalg (2f-b): sendes alltid begge for skumring, ellers aldri. */
  dusk_time?: DuskTime;
  dusk_sky?: DuskSky;
}

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
  /** Signert URL til resultatbildet (awaiting_approval, 2c-2). */
  result_url?: string;
  /** Grunner fra port 1 (needs_review, 2c-2). */
  reasons?: unknown;
  /** Meglerens egen begrunnelse ved rejected_by_reviewer (2d-1). */
  reason?: unknown;
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

export type SubmitResult =
  | { kind: "sync"; imageBlob: Blob; requestId: string }
  | { kind: "async"; jobId: string; service: string };

/**
 * Poll-resultat. Alt unntatt "pending" er terminalt — pollingen stopper.
 *
 * Kontrakt 2c-2 (godkjent av Petter Dag 29), begge HTTP 200 + JSON:
 * - awaiting_approval: {status, result_url} — bildet finnes, ikke godkjent.
 * - needs_review: {status, code, reasons} — port 1 stoppet, intet bilde.
 * Ukjent status (200-JSON eller 202) gir "unknown": aldri evig polling,
 * aldri roed feil.
 *
 * Kontrakt 2d-1a (Petter 28.09, alternativ B): jobb avvist av megleren er
 * HTTP 200 + JSON {status:"failed", code:"rejected_by_reviewer", reason}.
 * Det er en avgjoerelse, ikke en feil -> "rejected_by_reviewer".
 */
export type JobResult =
  | { kind: "pending"; status: "queued" | "running"; retryAfterMs?: number }
  | { kind: "done"; imageBlob: Blob; resultUrl?: string; jobId: string }
  | { kind: "awaiting_approval"; resultUrl: string; jobId: string }
  | { kind: "needs_review"; review: Review }
  | { kind: "unknown"; status: string | null; httpStatus: number }
  | { kind: "rejected_by_reviewer"; reason: string | null }
  | { kind: "failed"; detail: string; rejection?: Rejection };

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
    // Uten result_url er svaret et kontraktsbrudd — vis noeytralt, ikke
    // "Til kontroll" uten bilde.
    if (typeof data.result_url !== "string" || data.result_url === "") {
      return unknownStatus(data.status, 200);
    }
    return {
      kind: "awaiting_approval",
      resultUrl: data.result_url,
      jobId: data.job_id ?? jobId,
    };
  }
  if (data.status === "failed" && data.code === "rejected_by_reviewer") {
    return { kind: "rejected_by_reviewer", reason: nonEmptyString(data.reason) };
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
  getToken: GetToken;
}): Promise<SubmitResult> {
  const { service, image, params, getToken } = opts;

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

  const res = await fetch(`${API_BASE}/v1/process`, {
    method: "POST",
    headers: await authHeader(getToken),
    body: form,
  });

  if (res.status === 200) {
    const imageBlob = await res.blob();
    const requestId = res.headers.get("X-Request-ID") ?? "";
    return { kind: "sync", imageBlob, requestId };
  }

  if (res.status === 202) {
    const data = (await res.json()) as { job_id: string; service: string };
    return { kind: "async", jobId: data.job_id, service: data.service };
  }

  if (res.status === 400) {
    const detail = await extractDetail(res);
    throw new ValidationError(detail);
  }

  const detail = await extractDetail(res);
  throw new Error(`submitJob failed (${res.status}): ${detail}`);
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

  let res = await fetch(url, {
    method: "GET",
    headers: await authHeader(getToken),
  });

  // 401 = Clerk-tokenet har utloept (levetid ~60 s) — hent ferskt token
  // utenom cache og prov EN gang til. Vedvarende 401 faller gjennom til
  // den generiske feilgrenen nederst.
  if (res.status === 401) {
    res = await fetch(url, {
      method: "GET",
      headers: await authHeader(getToken, { skipCache: true }),
    });
  }

  if (res.status === 200) {
    // 200 baerer to terminal-former (TG-NEW-70): et ferdig resultatbilde
    // (binaert) ELLER en strukturert status-JSON. Gate-avslag kommer naa
    // som 200 + application/json med status="rejected"; et fullfoert
    // resultat er bildebytes. Content-Type skiller dem.
    const contentType = res.headers.get("Content-Type") ?? "";
    if (contentType.includes("application/json")) {
      // JSON-bytes tolkes aldri som bilde; ukjent status -> "unknown".
      const data = ((await res.json()) ?? {}) as JobStatusBody;
      return parseStatusBody(data, jobId);
    }

    const imageBlob = await res.blob();
    const resultUrl = res.headers.get("X-Result-URL") ?? undefined;
    const responseJobId = res.headers.get("X-Job-ID") ?? jobId;
    return { kind: "done", imageBlob, resultUrl, jobId: responseJobId };
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
  result_url: string | null;
  variant_urls: string[] | null;
  error: string | null;
  /** 2d-1a: kode for raden (rejected_by_reviewer, needs_review-koden) eller null. */
  code?: string | null;
  /** 2d-1a: meglerens begrunnelse ved rejected_by_reviewer, ellers null. */
  reason?: string | null;
  /** TG-NEW-127: false for en annen brukers jobb (scope=all). */
  is_owner?: boolean;
  /** TG-NEW-127: de 6 siste tegnene i eierens id, eller null. */
  owner_short?: string | null;
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
 * `resultUrl` er ferskt re-signert og settes for succeeded-rader (og,
 * fra 2c-3b, awaiting_approval-rader). En
 * gammel rad uten lagret bilde har `resultUrl: null` (ingen doed lenke) —
 * vis raden uten thumbnail, det er ikke en feil.
 */
export interface JobSummary {
  jobId: string;
  service: string;
  status: JobSummaryStatus;
  createdAt: string | null;
  resultUrl: string | null;
  variantUrls: string[] | null;
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
 * Foelger samme 401-retry som pollJob: Clerk-JWT lever ~60 s, saa et
 * utloept token hentes paa nytt med skipCache og kallet proeves EN gang til.
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
}): Promise<JobSummary[]> {
  const { limit, before, beforeId, statuses, scope, getToken } = opts;

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

  let res = await fetch(url, {
    method: "GET",
    headers: await authHeader(getToken),
  });

  // 401 = utloept Clerk-token — hent ferskt (skipCache) og proev EN gang til.
  if (res.status === 401) {
    res = await fetch(url, {
      method: "GET",
      headers: await authHeader(getToken, { skipCache: true }),
    });
  }

  if (res.status !== 200) {
    throw new ListJobsError(res.status, errorCode(await readJson(res)));
  }

  const rows = (await res.json()) as JobSummaryWire[];
  return rows.map((row) => ({
    jobId: row.job_id,
    service: row.service,
    status: normalizeSummaryStatus(row.status),
    createdAt: row.created_at,
    resultUrl: row.result_url,
    variantUrls: row.variant_urls,
    error: row.error,
    code: nonEmptyString(row.code),
    reason: nonEmptyString(row.reason),
    isOwner: row.is_owner !== false,
    ownerShort: nonEmptyString(row.owner_short),
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

const DECISION_ACTIONS: ReadonlySet<string> = new Set(["approve", "reject", "continue", "correct"]);

/** Maks lengde paa begrunnelsen (backend renser og sjekker igjen, 422 over). */
export const REASON_MAX_LEN = 500;

/**
 * Hva som gjelder for gjeldende bilde (2d-2a): approved/disabled for
 * godkjente, candidate/promoted for ustabile og avviste.
 */
export type LightState = "approved" | "disabled" | "candidate" | "promoted";

const LIGHT_STATES: ReadonlySet<string> = new Set(["approved", "disabled", "candidate", "promoted"]);

/** En lyskilde fra analysen. `type` og `reasonCode` er koder, `location` fritekst. */
export interface ReviewLight {
  /** Noekkel i UI (2d-2a): "L1" for godkjente, "r2:L3" for kandidater. Tolkes aldri. */
  key: string | null;
  id: string | null;
  /** Kjoeringen kandidaten kom fra (1 eller 2); null for godkjente. */
  run: number | null;
  type: string | null;
  location: string | null;
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
}

/** Body for «Rett»: hele avviket fra analysen, ikke endringen fra forrige runde. */
export interface CorrectionOverrides {
  promote: { run: number; id: string }[];
  disable: string[];
  add: never[];
}

export interface RunValue {
  value: string | null;
  runValues: string[];
}

/**
 * Det megleren trenger for aa avgjoere en jobb (GET /v1/jobs/{id}/review).
 * Bare koder og data; tekstene kommer fra ordlista (app/lib/i18n).
 */
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
  /** gate_review | fireplace_answer_missing | null */
  code: string | null;
  reasonCodes: string[];
  flagCodes: string[];
  /** Bare kjente handlinger; ukjente fra backend ignoreres. */
  allowedActions: DecisionAction[];
  validRuns: number;
  fireplace: { present: boolean; disagreement: boolean; answer: string | null };
  imageType: RunValue;
  skyVisibility: RunValue;
  /** Skumringsvalgene (2f-a); null naar backend ikke sender feltet. */
  dusk: ReviewDusk | null;
  /** Kodene til merketeksten (merking PR 1); null naar ikke skumring eller feltet mangler. */
  disclosure: ReviewDisclosure | null;
  lights: { approved: ReviewLight[]; unstable: ReviewLight[]; rejected: ReviewLight[] };
  correction: ReviewCorrection;
  images: {
    originalUrl: string | null;
    resultUrl: string | null;
    rawUrl: string | null;
    /** Bildet fra forrige runde, eller null foer foerste runde er ferdig. */
    previous: { round: number | null; resultUrl: string | null; rawUrl: string | null } | null;
  };
  decisions: { action: string | null; at: string | null; byRole: string | null; reason: string | null }[];
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

function toLight(raw: Record<string, unknown>): ReviewLight {
  const state = stringOrNull(raw.state);
  return {
    key: stringOrNull(raw.key),
    id: stringOrNull(raw.id),
    run: numberOrNull(raw.run),
    type: stringOrNull(raw.type),
    location: stringOrNull(raw.location),
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
    status: stringOrNull(raw.status),
  };
}

function toRunValue(raw: unknown): RunValue {
  const r = isRecord(raw) ? raw : {};
  return { value: stringOrNull(r.value), runValues: stringList(r.run_values) };
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
    imageType: toRunValue(r.image_type),
    skyVisibility: toRunValue(r.sky_visibility),
    dusk: toDusk(r.dusk),
    disclosure: toDisclosure(r.disclosure),
    lights: {
      approved: records(lights.approved).map(toLight),
      unstable: records(lights.unstable).map(toLight),
      rejected: records(lights.rejected).map(toLight),
    },
    correction: {
      roundsLeft: roundsLeft !== null && roundsLeft > 0 ? roundsLeft : 0,
      lastRoundFailed: correction.last_round_failed === true,
    },
    images: {
      originalUrl: stringOrNull(images.original_url),
      resultUrl: stringOrNull(images.result_url),
      rawUrl: stringOrNull(images.raw_url),
      previous:
        previous === null
          ? null
          : {
              round: numberOrNull(previous.round),
              resultUrl: stringOrNull(previous.result_url),
              rawUrl: stringOrNull(previous.raw_url),
            },
    },
    decisions: records(r.decisions).map((d) => ({
      action: stringOrNull(d.action),
      at: stringOrNull(d.at),
      byRole: stringOrNull(d.by_role),
      reason: stringOrNull(d.reason),
    })),
  };
}

export type ReviewFetchResult =
  | { kind: "ok"; review: JobReviewDetail }
  /** 404: ukjent, fremmed eller ikke en skumringsjobb (samme svar). */
  | { kind: "not_found" }
  /** 503: degradert modus i backend. */
  | { kind: "unavailable" }
  | { kind: "error"; httpStatus: number };

/** GET med samme 401-retry som pollJob/listJobs. */
async function authedFetch(
  url: string,
  init: RequestInit,
  getToken: GetToken
): Promise<Response> {
  const withAuth = async (options?: { skipCache?: boolean }) => ({
    ...init,
    headers: { ...(init.headers ?? {}), ...(await authHeader(getToken, options)) },
  });
  const res = await fetch(url, await withAuth());
  if (res.status !== 401) return res;
  return fetch(url, await withAuth({ skipCache: true }));
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
}): Promise<ReviewFetchResult> {
  const { jobId, getToken } = opts;
  const url = `${API_BASE}/v1/jobs/${encodeURIComponent(jobId)}/review`;
  const res = await authedFetch(url, { method: "GET" }, getToken);
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
}

/**
 * Utfallet av POST /v1/jobs/{id}/decision:
 * - updated (200): avgjort, hent review paa nytt.
 * - poll (202): jobben kjoerer (continue); poll til awaiting_approval eller
 *   sluttstatus, hent saa review paa nytt.
 * - status_changed (409): noen andre har avgjort, eller siden viser en eldre
 *   versjon (TG-NEW-130); last paa nytt og vis melding.
 * - blocked (409 action_not_allowed/original_missing/correction_limit,
 *   422 invalid_decision med eventuell override_code): vis melding.
 * - unavailable (503): archive_failed eller backend uten database; trygt aa
 *   proeve igjen.
 * - not_found (404), error (alt annet).
 */
export type DecisionOutcome =
  | { kind: "updated"; status: string | null }
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
export function parseDecisionResponse(httpStatus: number, body: unknown): DecisionOutcome {
  const outer = isRecord(body) ? body : {};
  const inner = isRecord(outer.detail) ? outer.detail : outer;
  const code = stringOrNull(inner.code);
  const status = stringOrNull(inner.status);
  if (httpStatus === 200) return { kind: "updated", status };
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
