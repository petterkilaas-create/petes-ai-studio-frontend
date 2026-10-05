import type { JobSummary } from "./api";
import { isWorking } from "./jobMedia.ts";

/**
 * Startsiden /start (TG-NEW-153, Petter 02.10 og 05.10): det som venter paa
 * megleren, siste jobber og tjenestene som snarveier. En ny bruker uten
 * jobber ser tjenestene foerst. Rene funksjoner, saa reglene kan testes med
 * node --test; bare type-import fra api.ts, som kaster ved import naar
 * NEXT_PUBLIC_API_BASE mangler.
 *
 * Bare kall som finnes: to GET /v1/jobs (egne jobber, aldri scope=all, ogsaa
 * for admin) og GET /v1/quota. Ingen «oppdrag»: en jobb er ett bilde.
 */

/** Kort under «Venter paa deg». Ett til hentes for aa vite om det er flere. */
export const WAITING_LIMIT = 4;

/** Kort under «Siste jobber». */
export const RECENT_LIMIT = 6;

/** Henting av siste jobber: nok til RECENT_LIMIT etter at de som venter, er tatt ut. */
export const RECENT_FETCH = RECENT_LIMIT + WAITING_LIMIT;

/** Henting av jobbene som venter: ett ekstra for «Se alle i Historikk». */
export const WAITING_FETCH = WAITING_LIMIT + 1;

/** Historikk med «Venter paa meg» valgt (Petter 05.10, AVVIK 8). */
export const HISTORY_PATH = "/history";
export const HISTORY_VIEW_PARAM = "vis";
export const HISTORY_VIEW_WAITING = "venter";
export const WAITING_HISTORY_HREF = `${HISTORY_PATH}?${HISTORY_VIEW_PARAM}=${HISTORY_VIEW_WAITING}`;

/** Om Historikk skal aapne med «Venter paa meg» valgt. Alt annet gir «Alle». */
export function waitingFromParam(value: string | null): boolean {
  return value === HISTORY_VIEW_WAITING;
}

/** Svarene fra de to hentingene, foer de vises. */
export type StartJobs =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "loaded"; waiting: JobSummary[]; recent: JobSummary[] };

export type StartView =
  | { kind: "loading" }
  /** Hentingen feilet: tjenestene og knappen virker, men brukeren regnes ikke som ny. */
  | { kind: "error" }
  /** Ingen jobber: tjenestene foerst. */
  | { kind: "new" }
  | { kind: "active"; waiting: JobSummary[]; moreWaiting: boolean; recent: JobSummary[] };

/**
 * Hva siden viser. En jobb som venter, staar bare under «Venter paa deg»,
 * ikke ogsaa under «Siste jobber».
 */
export function startView(jobs: StartJobs): StartView {
  if (jobs.kind !== "loaded") return jobs;
  if (jobs.waiting.length === 0 && jobs.recent.length === 0) return { kind: "new" };
  const waiting = jobs.waiting.slice(0, WAITING_LIMIT);
  const shown = new Set(waiting.map((j) => j.jobId));
  return {
    kind: "active",
    waiting,
    moreWaiting: jobs.waiting.length > WAITING_LIMIT,
    recent: jobs.recent.filter((j) => !shown.has(j.jobId)).slice(0, RECENT_LIMIT),
  };
}

/** Den automatiske hentingen (som i Historikk) gaar bare mens en jobb lages. */
export function anyWorking(jobs: StartJobs): boolean {
  return jobs.kind === "loaded" && [...jobs.waiting, ...jobs.recent].some((j) => isWorking(j.status));
}
