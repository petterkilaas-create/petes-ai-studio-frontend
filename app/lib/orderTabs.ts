import type { ReviewFraming, ReviewOrder } from "./api";
import { DATE_LOCALES } from "./dates.ts";
import { t, type Locale, type UiKey } from "./i18n/index.ts";
import { styleText } from "./styling.ts";

/**
 * Fanene per bestilling og rammevarselet paa godkjenningssiden (D-5c,
 * Petter 25.10, TG-NEW-249 og TG-NEW-260). Rene funksjoner, saa reglene kan
 * testes med node --test; bare type-import fra api.ts (den kaster ved import
 * naar NEXT_PUBLIC_API_BASE mangler).
 */

/** En fane: lenke til jobbens egen side, navnet, statusen og miniatyren. */
export interface OrderTab {
  jobId: string;
  href: string;
  label: string;
  statusKey: UiKey;
  /** Den merkede miniatyren, eller null (plassholder). */
  thumbUrl: string | null;
  /** Jobben siden viser (`aria-current="page"`). */
  current: boolean;
}

/** Lenken til godkjenningssiden for en jobb (som OpenReviewLink). */
export function reviewHref(jobId: string): string {
  return `/godkjenning/${encodeURIComponent(jobId)}`;
}

/**
 * Statusen paa fanen, bare ut fra `status` (Petter 25.10, AVVIK 1 A):
 * `order.jobs` har ingen `code`, saa en jobb megleren har avvist (`failed`),
 * staar som «Feilet» til backend sender koden (TG-NEW-262). `rejected` er
 * avslaget fra port 0. Ukjent status gir «Ukjent status».
 */
export function orderStatusKey(status: string): UiKey {
  switch (status) {
    case "queued":
    case "running":
      return "status.running";
    case "awaiting_approval":
    case "needs_review":
      return "status.awaitingApproval";
    case "succeeded":
      return "status.approved";
    case "rejected":
      return "status.rejected";
    case "failed":
      return "status.failed";
    default:
      return "status.unknown";
  }
}

/**
 * Fanene for bestillingen, i rekkefoelgen fra backend (eldst foerst). null
 * uten bestilling eller med faerre enn to jobber: da vises ingen rad.
 * Navnet er stilen (styleText); en ukjent stil heter «Digital styling».
 */
export function orderTabs(order: ReviewOrder | null, jobId: string, locale: Locale): OrderTab[] | null {
  if (order === null || order.jobs.length < 2) return null;
  return order.jobs.map((job) => ({
    jobId: job.jobId,
    href: reviewHref(job.jobId),
    label: styleText(locale, job.presetId) ?? t(locale, "service.virtual_stage"),
    statusKey: orderStatusKey(job.status),
    thumbUrl: job.thumbUrl,
    current: job.jobId === jobId,
  }));
}

/**
 * Grensen for rammevarselet, i prosent av KI-bildet utenfor originalfotoet
 * (TG-NEW-260, Petter 25.10). Bilder der kompositten er `ok`, har under 2 %;
 * i rammeproben (hytta med kjoekken) var det 22-41 %. Over grensen ber siden
 * megleren sammenligne utsnittet. Backend har ingen grense.
 */
export const FRAMING_WARN_PCT = 5;

/** Prosenten til varselet, eller null: umaalt, eller ikke over grensen. */
export function framingWarning(framing: ReviewFraming): number | null {
  if (!framing.measured || framing.outsidePct === null) return null;
  return framing.outsidePct > FRAMING_WARN_PCT ? framing.outsidePct : null;
}

/** Prosenten med hoeyst én desimal, paa brukerens spraak (8,3 paa nb, 8.3 paa en). */
export function formatPct(locale: Locale, pct: number): string {
  return pct.toLocaleString(DATE_LOCALES[locale], { maximumFractionDigits: 1 });
}

/** Teksten i varselet. */
export function framingText(locale: Locale, pct: number): string {
  return t(locale, "review.framing.warning", { pct: formatPct(locale, pct) });
}
