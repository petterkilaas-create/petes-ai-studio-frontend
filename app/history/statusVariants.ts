import type { JobSummary, JobSummaryStatus } from "../lib/api";
import type { UiKey } from "../lib/i18n";

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

/**
 * Miniatyren kortet viser (Lekkasjen L2): bare den merkede `thumbUrl`, og
 * bare for statuser med resultatbilde. null gir kortet uten bilde («Ingen
 * forhåndsvisning»), aldri resultUrl/variantUrls.
 */
export function thumbSrc(job: Pick<JobSummary, "status" | "thumbUrl">): string | null {
  return hasResultImage(job.status) ? job.thumbUrl : null;
}

/** Farge for «Avvist av deg» (2d-1): noeytral, ikke roed. Teksten kommer fra ordlista. */
export const REVIEWER_REJECTED_CLS = "bg-slate-800/60 text-slate-300 border-slate-500/30";

/**
 * Jobb avvist av megleren selv (2d-1a): kjennes paa `code` fra listingen,
 * aldri ved aa tolke `error`-teksten (Petter 28.09, valg B).
 */
export function isRejectedByReviewer(job: { status: string; code: string | null }): boolean {
  return job.status === "failed" && job.code === "rejected_by_reviewer";
}

/** Statuser der kortet lenker til godkjenningssiden («Åpne kontroll»). */
export function canOpenReview(status: string): boolean {
  return status === "awaiting_approval" || status === "needs_review";
}

/**
 * Lenken til godkjenningssiden paa et kort, eller null:
 * - «Åpne kontroll» for awaiting_approval/needs_review (som foer).
 * - «Åpne» for egne godkjente skumringsjobber (merking PR 4), der
 *   «Last ned merket bilde» og «Tekst til annonsen» ligger. Andre tjenester
 *   har ingen godkjenningsside (backend gir 404), og admin kan ikke laste
 *   ned andres bilder.
 */
export function openLinkKey(job: Pick<JobSummary, "status" | "service" | "isOwner">): UiKey | null {
  if (canOpenReview(job.status)) return "history.openReview";
  if (job.status === "succeeded" && job.service === "scene_transform" && job.isOwner !== false) {
    return "history.open";
  }
  return null;
}
