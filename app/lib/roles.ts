import type { Capabilities, JobReviewDetail, JobScope, JobSummary } from "./api";
import type { UiKey } from "./i18n";

/**
 * Rene regler for roller i visningen (TG-NEW-127), skilt ut saa de kan
 * testes med node --test. Bare type-importer: api.ts kaster ved import naar
 * NEXT_PUBLIC_API_BASE mangler.
 *
 * Frontend faar aldri selve rollen (Petter 29.09). Den bruker
 * `capabilities.view_all` fra /me og `is_owner` per jobb; serveren sjekker
 * alt selv. Mangler feltene (eldre backend), oppfoerer siden seg som foer:
 * ingen bryter, og alt regnes som eget.
 */

/** Bryteren «Mine jobber / Alle brukere» vises bare naar /me gir view_all. */
export function showScopeToggle(caps: Capabilities | null): boolean {
  return caps?.viewAll === true;
}

/** Omfanget som sendes: «Alle brukere» bare naar bryteren vises. */
export function effectiveScope(caps: Capabilities | null, chosen: JobScope): JobScope {
  return showScopeToggle(caps) && chosen === "all" ? "all" : "mine";
}

/**
 * Teksten paa statusknappen for jobber som venter (Petter 29.09, valg A):
 * «Venter» naar alle brukeres jobber vises, ellers «Venter paa meg».
 */
export function waitingLabelKey(scope: JobScope): UiKey {
  return scope === "all" ? "history.waiting" : "history.waitingForMe";
}

/** Tomteksten for filteret over, med samme skille. */
export function emptyWaitingKey(scope: JobScope): UiKey {
  return scope === "all" ? "history.emptyWaitingAll" : "history.emptyWaiting";
}

/** Undertittelen paa /history. */
export function subtitleKey(scope: JobScope): UiKey {
  return scope === "all" ? "history.subtitleAll" : "history.subtitle";
}

/**
 * Merket for en annen brukers jobb: «Annen bruker» og eventuelt «Eier: …».
 * null for egne jobber, ogsaa naar feltet mangler.
 */
export function ownerBadge(
  job: Pick<JobSummary, "isOwner" | "ownerShort">
): { ownerShort: string | null } | null {
  return job.isOwner === false ? { ownerShort: job.ownerShort } : null;
}

/** Merket for en jobb avvist ved godkjenning: «av deg» eller «av eieren». */
export function rejectedLabelKey(job: Pick<JobSummary, "isOwner">): UiKey {
  return job.isOwner === false ? "history.rejectedByOwner" : "history.rejectedByYou";
}

/** Linja «Du ser en annen brukers jobb. Bare lesing.» paa godkjenningssiden. */
export function isReadOnlyOther(review: Pick<JobReviewDetail, "isOwner">): boolean {
  return review.isOwner === false;
}

/**
 * Hva /history gjoer ved feil fra listen. 403 scope_not_allowed og 422
 * invalid_scope: tilbake til «Mine jobber» med en kort melding (403 skjuler
 * ogsaa bryteren). Alt annet er en vanlig feil (null).
 */
export function scopeFallback(
  err: unknown
): { hideToggle: boolean; messageKey: UiKey } | null {
  if (typeof err !== "object" || err === null) return null;
  const { httpStatus, code } = err as { httpStatus?: unknown; code?: unknown };
  if (httpStatus === 403 && code === "scope_not_allowed") {
    return { hideToggle: true, messageKey: "history.scopeFallback" };
  }
  if (httpStatus === 422 && code === "invalid_scope") {
    return { hideToggle: false, messageKey: "history.scopeFallback" };
  }
  return null;
}

/**
 * «Detaljer» (analysen) og rått bilde paa godkjenningssiden (D2a/D2b, brief
 * §3 punkt 6): bare naar /me gir view_all, i dag bare admin. Redaktoeren
 * trenger et eget signal fra backend (Petter 01.10). Mangler svaret: false.
 */
export function showDetails(caps: Capabilities | null): boolean {
  return adminView(caps);
}

/**
 * Admin-visningen av godkjenningssiden (TG-NEW-193, Petter 10.10): samme
 * view_all-sjekk som «Detaljer». Uten den (megler, og redaktoer uten
 * view_all) skjules job-id, grunnen til at jobben venter, valgene i
 * rundeetiketten, usikre lys, peisen og «ikke brukt» om himmelen. Mangler
 * svaret: false.
 */
export function adminView(caps: Capabilities | null): boolean {
  return caps?.viewAll === true;
}
