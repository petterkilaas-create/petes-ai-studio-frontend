import type { JobSummary } from "./api";
import type { UiKey } from "./i18n/index.ts";
import { hasResultImage } from "./statusVariants.ts";

/**
 * Ventebildet (KONTRAKT_VENTEBILDE): hva bildeboksen paa et jobbkort viser.
 * Rene funksjoner, saa de kan testes med node --test; bare type-import fra
 * api.ts, som kaster ved import naar NEXT_PUBLIC_API_BASE mangler.
 *
 * Rekkefoelgen: det merkede resultatbildet (`thumbSrc`), ellers dagsbildet
 * dempet, ellers en rolig plassholder.
 *
 * Originalen er aldri resultatet: dagsbildet brukes bare naar resultatet
 * mangler OG statusen ikke har resultatbilde, og det faar aldri AI-merkelapp.
 * Ingen tilbakefall fra resultat til original (samme regel som Lekkasjen L2).
 *
 * Tekst oppå bildet bare naar den gir noe merket ved tittelen ikke gir:
 * mens jobben lages og ved peisspoersmaalet (opprydding, Petter 02.10).
 * Ellers staar statusen bare i merket.
 */

/** Statusteksten oppå bildet. `working`: det rolige animerte symbolet vises. */
export interface MediaOverlay {
  key: UiKey;
  working: boolean;
}

export type MediaView =
  | { kind: "result"; url: string }
  | { kind: "original"; url: string; overlay: MediaOverlay | null }
  | { kind: "placeholder"; overlay: MediaOverlay | null };

/** Jobben lages (i koe eller i arbeid). */
export function isWorking(status: string): boolean {
  return status === "queued" || status === "running";
}

/** Peiskodene fra port 1 (Petter 02.10, valg B: ogsaa fireplace_answer_missing). */
const FIREPLACE_CODES: ReadonlySet<string> = new Set([
  "fireplace_present",
  "fireplace_disagreement",
  "fireplace_answer_missing",
]);

/** «Lager kveldsbilde …» etter tjenesten, fra ordlista. Ukjent tjeneste: «Lager bildet …». */
export function workingKey(service: string | null | undefined): UiKey {
  switch (service) {
    case "scene_transform":
      return "media.working.scene_transform";
    case "privacy_blur":
      return "media.working.privacy_blur";
    default:
      return "media.working.generic";
  }
}

/**
 * Teksten oppå bildet for et kort uten resultatbilde, eller null: bare mens
 * jobben lages og ved peisspoersmaalet. Avvist, feilet og de andre
 * statusene staar i merket ved tittelen, ikke to ganger.
 */
export function overlayFor(job: Pick<JobSummary, "status" | "service" | "code">): MediaOverlay | null {
  if (isWorking(job.status)) return { key: workingKey(job.service), working: true };
  if (job.status === "needs_review" && job.code !== null && FIREPLACE_CODES.has(job.code)) {
    return { key: "media.fireplaceQuestion", working: false };
  }
  return null;
}

/**
 * Bildeboksen for et kort. `thumb` er det merkede resultatbildet fra
 * `thumbSrc(job)` (Lekkasjen L2); finnes det, vises det og ingenting annet.
 */
export function mediaView(
  job: Pick<JobSummary, "status" | "service" | "code" | "originalThumbUrl">,
  thumb: string | null
): MediaView {
  if (thumb !== null) return { kind: "result", url: thumb };
  const overlay = overlayFor(job);
  if (!hasResultImage(job.status) && job.originalThumbUrl !== null) {
    return { kind: "original", url: job.originalThumbUrl, overlay };
  }
  return { kind: "placeholder", overlay };
}

/** Express mens jobben lages: plassholderen med symbolet (Petter 02.10, valg A). */
export function workingView(service: string | null | undefined): MediaView {
  return { kind: "placeholder", overlay: { key: workingKey(service), working: true } };
}

/**
 * Automatisk henting i Historikk: kortet bytter bare rad naar det kortet
 * viser, er endret. Signerte lenker er nye ved hver henting, saa uendrede
 * rader beholdes for aa unngaa at bildene lastes paa nytt hvert 5. sekund.
 * Filnavn tolkes aldri; bare om lenkene finnes.
 */
function sameView(a: JobSummary, b: JobSummary): boolean {
  return (
    a.status === b.status &&
    a.service === b.service &&
    a.code === b.code &&
    a.reason === b.reason &&
    a.isOwner === b.isOwner &&
    a.ownerShort === b.ownerShort &&
    a.createdAt === b.createdAt &&
    (a.thumbUrl === null) === (b.thumbUrl === null) &&
    (a.originalThumbUrl === null) === (b.originalThumbUrl === null)
  );
}

/**
 * Ny foerste side flettet inn i lista: foerste side byttes ut (rader som er
 * borte fra filteret, forsvinner), sider fra «Last inn flere» beholdes, og
 * ingen jobb staar to ganger.
 */
export function mergeRefresh(prev: JobSummary[], fresh: JobSummary[], pageSize: number): JobSummary[] {
  const prevById = new Map(prev.map((j) => [j.jobId, j]));
  const freshIds = new Set(fresh.map((j) => j.jobId));
  const firstPage = fresh.map((f) => {
    const p = prevById.get(f.jobId);
    return p !== undefined && sameView(p, f) ? p : f;
  });
  const rest = prev.slice(pageSize).filter((j) => !freshIds.has(j.jobId));
  return [...firstPage, ...rest];
}
