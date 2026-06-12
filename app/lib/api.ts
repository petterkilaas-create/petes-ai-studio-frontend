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
 * raatt `rejected_*:`-prefiks skal aldri vises i UI.
 */
export type RejectionReason = "interior" | "uncertain";

export interface Rejection {
  reason: RejectionReason;
  message: string;
}

/**
 * Parser `rejected_interior:` / `rejected_uncertain:`-prefiksene fra
 * backendens FAILED-detail (Dag 18-kontrakt).
 *
 * TG-NEW-70: naar backend faar strukturert error-form (kode + melding
 * i stedet for prefikset streng), er denne funksjonen DET ENESTE
 * stedet i frontend som skal endres. Ikke parse prefikser andre steder.
 */
export function parseRejection(detail: string): Rejection | null {
  const match = detail.match(/^rejected_(interior|uncertain):\s*([\s\S]*)$/);
  if (!match) return null;
  return {
    reason: match[1] as RejectionReason,
    message: match[2].trim(),
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

  if (res.status === 500) {
    // Gate-avslag (rejected_interior/rejected_uncertain) kommer i dag som
    // HTTP 500 med prefikset detail (TG-NEW-70 vil gi 4xx + strukturert
    // form senere). parseRejection skiller dem fra ekte pipeline-feil.
    const detail = await extractDetail(res);
    const rejection = parseRejection(detail);
    return rejection !== null
      ? { kind: "failed", detail, rejection }
      : { kind: "failed", detail };
  }

  const detail = await extractDetail(res);
  throw new Error(`pollJob failed (${res.status}): ${detail}`);
}
