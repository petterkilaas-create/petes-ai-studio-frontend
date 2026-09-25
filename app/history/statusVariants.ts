import type { JobSummaryStatus } from "../lib/api";

export interface StatusVariant {
  label: string;
  cls: string;
  pulse?: boolean;
}

const VARIANTS: Record<JobSummaryStatus, StatusVariant> = {
  succeeded: {
    label: "Fullført",
    cls: "bg-green-900/30 text-green-400 border-green-500/20",
  },
  failed: {
    label: "Feilet",
    cls: "bg-red-900/30 text-red-400 border-red-500/20",
  },
  rejected: {
    label: "Avvist",
    cls: "bg-amber-900/30 text-amber-400 border-amber-500/20",
  },
  queued: {
    label: "I kø",
    cls: "bg-yellow-900/30 text-yellow-400 border-yellow-500/20",
    pulse: true,
  },
  running: {
    label: "Kjører",
    cls: "bg-yellow-900/30 text-yellow-400 border-yellow-500/20",
    pulse: true,
  },
  awaiting_approval: {
    label: "Til kontroll",
    cls: "bg-sky-900/30 text-sky-300 border-sky-500/20",
  },
  needs_review: {
    label: "Til gjennomgang",
    cls: "bg-slate-800/60 text-slate-300 border-slate-500/30",
  },
  unknown: {
    label: "Ukjent status",
    cls: "bg-slate-800/60 text-slate-400 border-slate-500/30",
  },
};

/**
 * Pill-variant for en status. listJobs normaliserer allerede ukjente
 * verdier til "unknown"; oppslaget faller i tillegg tilbake ved kjoeretid,
 * saa /history aldri krasjer paa en verdi backend legger til senere.
 */
export function statusVariant(status: string): StatusVariant {
  // hasOwn: "toString"/"__proto__" skal ikke treffe prototypen.
  return Object.hasOwn(VARIANTS, status)
    ? VARIANTS[status as JobSummaryStatus]
    : VARIANTS.unknown;
}

/** Statuser der resultatbildet finnes og kan vises som thumbnail. */
export function hasResultImage(status: string): boolean {
  return status === "succeeded" || status === "awaiting_approval";
}
