"use client";

import type { JobSummary, JobSummaryStatus } from "../lib/api";
import {
  isRejectedByReviewer,
  openLinkKey,
  REVIEWER_REJECTED_TONE,
  serviceLabelKey,
  statusVariant,
} from "../lib/statusVariants";
import { OpenReviewLink } from "./OpenReviewLink";
import { JobMedia } from "./JobMedia";
import { mediaView } from "../lib/jobMedia";
import { cardClass } from "./ui/Card";
import { Pill } from "./ui/Pill";
import { messageText, t, type Locale, type UiKey } from "../lib/i18n";
import { jobMessage } from "../lib/jobMessage";
import { useLocale } from "../lib/i18n/useLocale";
import { ownerBadge, rejectedLabelKey } from "../lib/roles";

/*
 * Kortet for en jobb: bildet (ventebildet), tjenesten, status, dato og
 * «Åpne godkjenning». Flyttet uendret fra /history (TG-NEW-153), saa
 * Historikk og /start viser jobbene likt.
 *
 * `thumb` er det merkede resultatbildet fra thumbSrc(job), valgt av siden
 * (Lekkasjen L2). Lekkasjevernet i previews.test.ts sjekker at sidene kaller
 * thumbSrc(job) selv.
 */

// Tjenestenavnene staar i ordlista (brief §7). Ukjente faller tilbake til en
// prettifisert utgave av den raa enum-verdien, saa nye tjenester rendres
// lesbart uten kode-endring her.
function serviceLabel(locale: Locale, service: string): string {
  const key = serviceLabelKey(service);
  if (key !== null) return t(locale, key);
  const pretty = service.replace(/_/g, " ");
  return pretty.charAt(0).toUpperCase() + pretty.slice(1);
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("nb-NO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Status-pill: frikoblet fra StatusBadge (som tar en annen status-union).
function StatusPill({
  status,
  service,
  rejectedKey = null,
}: {
  status: JobSummaryStatus;
  service: string;
  /** Avvist ved godkjenning: «av deg» eller «av eieren» (TG-NEW-127). */
  rejectedKey?: UiKey | null;
}) {
  const locale = useLocale();
  const v = rejectedKey !== null
    ? { labelKey: rejectedKey, tone: REVIEWER_REJECTED_TONE, pulse: false }
    : statusVariant(status, service);
  return (
    <Pill tone={v.tone} pulse={v.pulse}>
      {t(locale, v.labelKey)}
    </Pill>
  );
}

export function JobCard({ job, thumb }: { job: JobSummary; thumb: string | null }) {
  const locale = useLocale();
  const rejectedByYou = isRejectedByReviewer(job);
  const other = ownerBadge(job);
  const openKey = openLinkKey(job);
  // Kort melding ut fra status og `code`, aldri raa `error` (TG-NEW-121).
  // Avvist av megleren: merket sier det, og begrunnelsen vises under.
  const message = rejectedByYou ? null : jobMessage(job.status, job.code);

  return (
    <div className={cardClass("none", "flex flex-col overflow-hidden")}>
      {/* Ventebildet: resultatet (thumbSrc), ellers dagsbildet dempet med status, ellers plassholder. */}
      <JobMedia
        view={mediaView(job, thumb)}
        resultAlt={serviceLabel(locale, job.service)}
        locale={locale}
      />

      <div className="p-5 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <span className="font-medium text-ink text-[15px] truncate">
            {serviceLabel(locale, job.service)}
          </span>
          <StatusPill
            status={job.status}
            service={job.service}
            rejectedKey={rejectedByYou ? rejectedLabelKey(job) : null}
          />
        </div>
        <span className="text-ink-2 text-[13px]">
          {formatDate(job.createdAt)}
        </span>
        {other && (
          // TG-NEW-127: en annen brukers jobb (scope=all). Bare de 6 siste
          // tegnene i eierens id; navn og e-post krever Clerk secret key.
          <div className="flex flex-wrap items-center gap-2 text-[13px] text-ink-2">
            <Pill tone="neutral">{t(locale, "history.notYours")}</Pill>
            {other.ownerShort && (
              <span>
                {t(locale, "history.owner")}: <span className="font-mono">{other.ownerShort}</span>
              </span>
            )}
          </div>
        )}
        {message && (
          <p className="text-[13px] text-ink bg-surface-2 rounded-button p-3 leading-relaxed">
            {messageText(locale, message)}
          </p>
        )}
        {rejectedByYou && job.reason && (
          <p className="text-[13px] text-ink bg-surface-2 rounded-button p-3 leading-relaxed break-words">
            {t(locale, "review.reasonLabel")}: {job.reason}
          </p>
        )}
        {openKey && (
          <div>
            <OpenReviewLink jobId={job.jobId} labelKey={openKey} />
          </div>
        )}
      </div>
    </div>
  );
}
