import type { JobSummary, JobSummaryStatus } from "../../lib/api";
import type { UiKey } from "../../lib/i18n";

/** Fargen paa statuspillen (samme navn som tonene i components/ui/Pill). */
export type StatusTone = "amber" | "green" | "neutral" | "red";

export interface StatusVariant {
  /** Ordet fra ordlista (brief §7): ett ord per status. */
  labelKey: UiKey;
  tone: StatusTone;
  pulse?: boolean;
}

const VARIANTS: Record<JobSummaryStatus, StatusVariant> = {
  // «Ferdig» for tjenester uten godkjenning; kveldsbildet: se statusVariant.
  succeeded: { labelKey: "status.done", tone: "green" },
  failed: { labelKey: "status.failed", tone: "red" },
  rejected: { labelKey: "status.rejected", tone: "neutral" },
  queued: { labelKey: "status.queued", tone: "neutral", pulse: true },
  running: { labelKey: "status.running", tone: "neutral", pulse: true },
  awaiting_approval: { labelKey: "status.awaitingApproval", tone: "amber" },
  // Samme ord som awaiting_approval (Petter 01.10): samme filter og samme side.
  needs_review: { labelKey: "status.awaitingApproval", tone: "amber" },
  unknown: { labelKey: "status.unknown", tone: "neutral" },
};

/**
 * Pill-variant for en status. listJobs normaliserer allerede ukjente
 * verdier til "unknown"; oppslaget faller i tillegg tilbake ved kjoeretid,
 * saa /history aldri krasjer paa en verdi backend legger til senere.
 *
 * succeeded heter «Godkjent» for kveldsbildet (scene_transform), som bare
 * blir ferdig ved godkjenning, og «Ferdig» for andre tjenester (Skjul
 * ansikter og skilt har ingen godkjenning). Petter 01.10.
 */
export function statusVariant(status: string, service?: string): StatusVariant {
  // hasOwn: "toString"/"__proto__" skal ikke treffe prototypen.
  const v = Object.hasOwn(VARIANTS, status)
    ? VARIANTS[status as JobSummaryStatus]
    : VARIANTS.unknown;
  if (status === "succeeded" && service === "scene_transform") {
    return { ...v, labelKey: "status.approved" };
  }
  return v;
}

/** Tjenestenavnet fra ordlista (brief §7), eller null for ukjent tjeneste. */
export function serviceLabelKey(service: string): UiKey | null {
  switch (service) {
    case "scene_transform":
      return "service.scene_transform";
    case "privacy_blur":
      return "service.privacy_blur";
    case "magic_cleanup":
      return "service.magic_cleanup";
    case "virtual_stage":
      return "service.virtual_stage";
    default:
      return null;
  }
}

/** Statuser der resultatbildet finnes og kan vises som thumbnail. */
export function hasResultImage(status: string): boolean {
  return status === "succeeded" || status === "awaiting_approval";
}

/**
 * Miniatyren kortet viser (Lekkasjen L2): bare den merkede `thumbUrl`, og
 * bare for statuser med resultatbilde. null gir kortet uten bilde («Ingen
 * forhåndsvisning»).
 */
export function thumbSrc(job: Pick<JobSummary, "status" | "thumbUrl">): string | null {
  return hasResultImage(job.status) ? job.thumbUrl : null;
}

/** Farge for «Avvist av deg» (2d-1): noeytral, ikke roed. Teksten kommer fra ordlista. */
export const REVIEWER_REJECTED_TONE: StatusTone = "neutral";

/**
 * Jobb avvist av megleren selv (2d-1a): kjennes paa `code` fra listingen,
 * aldri ved aa tolke `error`-teksten (Petter 28.09, valg B).
 */
export function isRejectedByReviewer(job: { status: string; code: string | null }): boolean {
  return job.status === "failed" && job.code === "rejected_by_reviewer";
}

/** Statuser der kortet lenker til godkjenningssiden («Åpne godkjenning»). */
export function canOpenReview(status: string): boolean {
  return status === "awaiting_approval" || status === "needs_review";
}

/**
 * Lenken til godkjenningssiden paa et kort, eller null:
 * - «Åpne godkjenning» for awaiting_approval/needs_review (som foer).
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
