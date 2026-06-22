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

export type JobResult =
  | { kind: "pending"; status: "queued" | "running"; retryAfterMs?: number }
  | { kind: "done"; imageBlob: Blob; resultUrl?: string; jobId: string }
  | { kind: "failed"; detail: string; rejection?: Rejection };

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
      const data = (await res.json()) as JobStatusBody;
      if (data.status === "rejected") {
        const rejection = parseRejection(data);
        const detail = data.message ?? data.code ?? "rejected";
        return rejection !== null
          ? { kind: "failed", detail, rejection }
          : { kind: "failed", detail };
      }
      // Uventet status-JSON paa 200 uten rejected — behandle som feil
      // i stedet for aa tolke JSON-bytes som et bilde.
      return { kind: "failed", detail: data.message ?? JSON.stringify(data) };
    }

    const imageBlob = await res.blob();
    const resultUrl = res.headers.get("X-Result-URL") ?? undefined;
    const responseJobId = res.headers.get("X-Job-ID") ?? jobId;
    return { kind: "done", imageBlob, resultUrl, jobId: responseJobId };
  }

  if (res.status === 202) {
    const retryAfterMs = parseRetryAfterMs(res);
    const data = (await res.json()) as { status: "queued" | "running" };
    return { kind: "pending", status: data.status, retryAfterMs };
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
  | "rejected";

/**
 * En rad i jobb-historikken (GET /v1/jobs, TG-NEW-74 PR #76).
 *
 * Kontrakts-asymmetri vs. pollJob, viktig: listingen baerer KUN en flat
 * `error`-streng for failed/rejected (allerede bruker-rettet og prefiks-
 * fri). Den har IKKE `code`/`classifier` slik singular poll har — saa
 * History-siden viser `error` raatt som tekst og kjoerer IKKE
 * parseRejection paa disse radene.
 *
 * `resultUrl` er ferskt re-signert og settes kun for succeeded-rader. En
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
  getToken: GetToken;
}): Promise<JobSummary[]> {
  const { limit, before, beforeId, getToken } = opts;

  const params = new URLSearchParams();
  if (limit !== undefined) params.set("limit", String(limit));
  if (before !== undefined) params.set("before", before);
  if (beforeId !== undefined) params.set("before_id", beforeId);
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
    const detail = await extractDetail(res);
    throw new Error(`listJobs failed (${res.status}): ${detail}`);
  }

  const rows = (await res.json()) as JobSummaryWire[];
  return rows.map((row) => ({
    jobId: row.job_id,
    service: row.service,
    status: row.status as JobSummaryStatus,
    createdAt: row.created_at,
    resultUrl: row.result_url,
    variantUrls: row.variant_urls,
    error: row.error,
  }));
}
