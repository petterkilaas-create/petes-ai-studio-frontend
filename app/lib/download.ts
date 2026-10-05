import type { JobReviewDetail } from "./api";
import type { UiKey } from "./i18n";
import { mediaDeleted } from "./review.ts";

/**
 * «Last ned merket bilde» (merking PR 4, TG-NEW-55). Backend leverer JPEG med
 * AI-ikonet fra GET /v1/jobs/{id}/download (KONTRAKT_MERKING_NEDLASTING.md).
 * Henting og lagring sendes inn, saa hjelperen kan testes uten nettleser.
 * En signert lenke med `download` virker ikke paa tvers av opphav, derfor
 * fetch med token -> blob -> <a download>.
 */

/**
 * Knappen vises bare for eieren, bare naar jobben er godkjent, og ikke naar
 * bildene er slettet (TG-NEW-117; statusen er da fortsatt succeeded).
 */
export function canDownload(review: Pick<JobReviewDetail, "status" | "isOwner" | "mediaDeletedAt">): boolean {
  return review.status === "succeeded" && review.isOwner === true && !mediaDeleted(review);
}

/**
 * Filnavnet lages i frontend (Content-Disposition er ikke eksponert i CORS):
 * kveldsbilde-ai_<de 8 foerste tegnene i jobId>.jpg. Bare a-z og 0-9 beholdes.
 */
export function downloadFileName(jobId: string): string {
  const short = jobId.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8);
  return short ? `kveldsbilde-ai_${short}.jpg` : "kveldsbilde-ai.jpg";
}

/** Kodene der fila selv mangler eller ikke kan merkes: brukeren boer kontakte oss. */
const BROKEN_CODES: ReadonlySet<string> = new Set(["result_missing", "result_mismatch", "render_failed"]);

/**
 * Kort melding ut fra svaret, aldri raa tekst fra backend (samme prinsipp
 * som TG-NEW-121). FastAPI pakker koden i {"detail": {...}}.
 */
export function downloadErrorKey(httpStatus: number, body: unknown): UiKey {
  const outer = isRecord(body) ? body : {};
  const inner = isRecord(outer.detail) ? outer.detail : outer;
  const code = typeof inner.code === "string" ? inner.code : null;
  if (httpStatus === 409 && code === "action_not_allowed") return "review.downloadNotAllowed";
  // TG-NEW-117: bildene er slettet.
  if (httpStatus === 410 && code === "media_deleted") return "review.downloadDeleted";
  if (code !== null && BROKEN_CODES.has(code)) return "review.downloadBroken";
  return "review.downloadFailed";
}

export type DownloadResult = { kind: "ok"; fileName: string } | { kind: "error"; key: UiKey };

export async function downloadMarkedImage(opts: {
  jobId: string;
  /** Henter svaret med token (fetchJobDownload i api.ts). */
  fetchFile: () => Promise<Response>;
  save?: (blob: Blob, fileName: string) => void;
}): Promise<DownloadResult> {
  const { jobId, fetchFile, save = saveBlob } = opts;
  let res: Response;
  try {
    res = await fetchFile();
  } catch {
    // Nettverksfeil eller manglende token.
    return { kind: "error", key: "review.downloadFailed" };
  }
  if (res.status !== 200) {
    return { kind: "error", key: downloadErrorKey(res.status, await readJson(res)) };
  }
  const fileName = downloadFileName(jobId);
  try {
    save(await res.blob(), fileName);
  } catch {
    return { kind: "error", key: "review.downloadFailed" };
  }
  return { kind: "ok", fileName };
}

/** Lagrer bloben som fil i nettleseren via en midlertidig <a download>. */
export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Gi nettleseren tid til aa starte nedlastingen foer URL-en frigis.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}
