"use client";

import type { JobSummary } from "../lib/api";
import { StatusPill } from "./JobCard";
import { OpenReviewLink } from "./OpenReviewLink";
import { JobMedia } from "./JobMedia";
import { mediaView } from "../lib/jobMedia";
import {
  orderDate,
  orderLines,
  orderNote,
  orderOpen,
  orderOwner,
  orderTiles,
  orderTitle,
  tileView,
} from "../lib/historyGroups";
import { cardClass } from "./ui/Card";
import { Pill } from "./ui/Pill";
import { messageText, t } from "../lib/i18n";
import { useLocale } from "../lib/i18n/useLocale";

/*
 * Kortet for en bestilling (dag 55, TG-NEW-262): én rute i rutenettet, samme
 * bredde som JobCard. Bildet har stilene side om side, saa kommer tittelen,
 * én linje per stil med merket og én knapp til godkjenningssiden, som viser
 * fanene for hele bestillingen. Reglene ligger i lib/historyGroups.ts.
 *
 * `thumbs` er de merkede resultatbildene fra thumbSrc(job), i samme
 * rekkefoelge som `jobs`, valgt av siden (Lekkasjen L2).
 */

// Rutene i bildet: to eller tre (MAX_ORDER_JOBS), med en tynn skillelinje.
const TILE_COLS: Record<number, string> = { 1: "grid-cols-1", 2: "grid-cols-2", 3: "grid-cols-3" };

export function OrderCard({ jobs, thumbs }: { jobs: JobSummary[]; thumbs: (string | null)[] }) {
  const locale = useLocale();
  const lines = orderLines(locale, jobs);
  const tiles = orderTiles(lines);
  const open = orderOpen(jobs);
  const other = orderOwner(jobs);
  const note = orderNote(jobs, thumbs);

  return (
    <div className={cardClass("none", "flex flex-col overflow-hidden")}>
      <div className={`grid aspect-[3/2] gap-px bg-line ${TILE_COLS[tiles.length] ?? "grid-cols-3"}`}>
        {tiles.map((line, i) => (
          <JobMedia
            key={line.job.jobId}
            view={tileView(mediaView(line.job, thumbs[i] ?? null))}
            resultAlt={line.label}
            locale={locale}
            aspect="fill"
          />
        ))}
      </div>

      <div className="p-5 flex flex-col gap-3">
        <span className="font-medium text-ink text-[15px] truncate">{orderTitle(locale, jobs)}</span>
        <span className="text-ink-2 text-[13px]">{orderDate(locale, jobs)}</span>
        {note !== null && (
          // TG-NEW-117: miniatyren finnes, men bildene i full stoerrelse er slettet.
          <span className="text-ink-2 text-[13px]">{t(locale, note)}</span>
        )}
        {other && (
          // TG-NEW-127: en annen brukers bestilling (scope=all), én gang per kort.
          <div className="flex flex-wrap items-center gap-2 text-[13px] text-ink-2">
            <Pill tone="neutral">{t(locale, "history.notYours")}</Pill>
            {other.ownerShort && (
              <span>
                {t(locale, "history.owner")}: <span className="font-mono">{other.ownerShort}</span>
              </span>
            )}
          </div>
        )}
        <ul className="flex flex-col gap-2">
          {lines.map((line) => (
            <li key={line.job.jobId} className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate text-[14px] text-ink">{line.label}</span>
                <StatusPill status={line.job.status} service={line.job.service} rejectedKey={line.rejectedKey} />
              </div>
              {line.reason !== null && (
                <p className="text-[13px] text-ink-2 leading-relaxed break-words">
                  {t(locale, "review.reasonLabel")}: {line.reason}
                </p>
              )}
              {line.message !== null && (
                <p className="text-[13px] text-ink-2 leading-relaxed">{messageText(locale, line.message)}</p>
              )}
            </li>
          ))}
        </ul>
        {open !== null && (
          <div>
            <OpenReviewLink jobId={open.jobId} labelKey={open.labelKey} />
          </div>
        )}
      </div>
    </div>
  );
}
