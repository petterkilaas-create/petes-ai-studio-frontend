import type { JobReviewDetail, JobSummary } from "./api";
import type { UiKey } from "./i18n";
import { presetFileSlug } from "./presets.ts";
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
 * <slug>-ai_<de 8 foerste tegnene i jobId>.jpg. Bare a-z og 0-9 beholdes.
 * Slugen kommer fra oppskriften (G3, presets.ts): skumring og reserven
 * (ingen oppskrift) gir kveldsbilde, som foer.
 */
export function downloadFileName(jobId: string, presetId?: string | null): string {
  const slug = presetFileSlug(presetId);
  const short = jobId.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8);
  return short ? `${slug}-ai_${short}.jpg` : `${slug}-ai.jpg`;
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
  /** Oppskriften fra review-svaret (G3); bestemmer filnavnet. */
  presetId?: string | null;
  /** Filnavnet fra manifestet (FE-5, K 2.8); ellers lages det fra oppskriften. */
  fileName?: string | null;
  /** Henter svaret med token (fetchJobDownload i api.ts). */
  fetchFile: () => Promise<Response>;
  save?: (blob: Blob, fileName: string) => void;
}): Promise<DownloadResult> {
  const { jobId, presetId, fetchFile, save = saveBlob } = opts;
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
  const fileName = opts.fileName || downloadFileName(jobId, presetId);
  try {
    save(await res.blob(), fileName);
  } catch {
    return { kind: "error", key: "review.downloadFailed" };
  }
  return { kind: "ok", fileName };
}

/** Endelsen etter formatet backend svarer med. Sync-svaret er PNG i dag (main.py). */
const EXTENSIONS: Readonly<Record<string, string>> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

/**
 * Filnavnet for personvern-resultatet (dag 51): <originalnavn uten
 * endelse>-personvern.<endelse>. Tegn som ikke kan staa i et filnavn
 * fjernes; uten navn blir det «bilde».
 */
export function privacyFileName(originalName: string | null | undefined, mimeType: string): string {
  const base = (originalName ?? "").split(/[\\/]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  const stem = (dot > 0 ? base.slice(0, dot) : base)
    .replace(/[\u0000-\u001f<>:"|?*]/g, "")
    .trim();
  const ext = EXTENSIONS[mimeType.toLowerCase().split(";")[0].trim()] ?? "png";
  return `${stem || "bilde"}-personvern.${ext}`;
}

/**
 * Nedlastingen av personvern-resultatet, eller null naar knappen ikke skal
 * vises: bare privacy_blur, og bare med et resultat (sync-bloben fra
 * useProcessJob). Bildet er ikke KI-endret, saa det gaar ikke gjennom
 * /download med merking; bloben lagres direkte.
 */
export function privacyDownload(
  service: string | null | undefined,
  blob: Blob | null,
  originalName: string | null | undefined
): { blob: Blob; fileName: string } | null {
  if (service !== "privacy_blur" || blob === null) return null;
  return { blob, fileName: privacyFileName(originalName, blob.type) };
}

/**
 * «Last ned» paa personvern-kortet i Historikk og paa /start (dag 51): bare
 * egen privacy_blur som er ferdig, og ikke naar bildene er slettet
 * (TG-NEW-117). Backend avviser alt annet med 404, 409 eller 410.
 */
export function canDownloadPrivacy(
  job: Pick<JobSummary, "service" | "status" | "isOwner" | "mediaDeletedAt">
): boolean {
  return (
    job.service === "privacy_blur" &&
    job.status === "succeeded" &&
    job.isOwner === true &&
    !mediaDeleted(job)
  );
}

/**
 * Filnavnet fra Historikk: originalnavnet finnes ikke i listingen, saa
 * stammen er bilde-<de 8 foerste tegnene i jobId>, som i downloadFileName.
 */
export function privacyHistoryFileName(jobId: string, mimeType: string): string {
  const short = jobId.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8);
  return privacyFileName(short ? `bilde-${short}` : null, mimeType);
}

/** Som downloadMarkedImage, men mot privacy-download og med PNG-navnet. */
export async function downloadPrivacyImage(opts: {
  jobId: string;
  /** Henter svaret med token (fetchPrivacyDownload i api.ts). */
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
  let fileName: string;
  try {
    const blob = await res.blob();
    fileName = privacyHistoryFileName(jobId, blob.type);
    save(blob, fileName);
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
