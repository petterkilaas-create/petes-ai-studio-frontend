"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@clerk/nextjs";
import {
  listJobs,
  WAITING_FOR_ME_STATUSES,
  type JobSummary,
  type JobSummaryStatus,
} from "../lib/api";
import {
  canOpenReview,
  hasResultImage,
  isRejectedByReviewer,
  REVIEWER_REJECTED_CLS,
  statusVariant,
} from "./statusVariants";
import { OpenReviewLink } from "../components/OpenReviewLink";
import { messageText, t } from "../lib/i18n";
import { jobMessage } from "../lib/jobMessage";
import { useLocale } from "../lib/i18n/useLocale";

// Sidestoerrelse pr. henting. before-cursoren pagineres paa createdAt fra
// siste rad (backendens kontrakt) — se loadMore().
const PAGE_SIZE = 20;

// Bruker-rettede tjenestenavn. Ukjente faller tilbake til en prettifisert
// utgave av den raa enum-verdien, saa nye tjenester rendres lesbart uten
// kode-endring her.
const SERVICE_LABELS: Record<string, string> = {
  scene_transform: "Scene-transformasjon",
  magic_cleanup: "Magic cleanup",
  privacy_blur: "Personvern-sløring",
  virtual_stage: "Virtuell staging",
};

function serviceLabel(service: string): string {
  const known = SERVICE_LABELS[service];
  if (known) return known;
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

// Status-pill: visuelt identisk med husets badge-moenster, men frikoblet fra
// StatusBadge (som tar en annen status-union — se PR-notat).
function StatusPill({
  status,
  rejectedByYou = false,
}: {
  status: JobSummaryStatus;
  rejectedByYou?: boolean;
}) {
  const locale = useLocale();
  const v = rejectedByYou
    ? { label: t(locale, "history.rejectedByYou"), cls: REVIEWER_REJECTED_CLS, pulse: false }
    : statusVariant(status);
  return (
    <span
      className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${v.cls} ${
        v.pulse ? "animate-pulse motion-reduce:animate-none" : ""
      }`}
    >
      {v.label}
    </span>
  );
}

function JobCard({ job }: { job: JobSummary }) {
  const locale = useLocale();
  const hasThumb = hasResultImage(job.status) && job.resultUrl !== null;
  const rejectedByYou = isRejectedByReviewer(job);
  // Kort melding ut fra status og `code`, aldri raa `error` (TG-NEW-121).
  // Avvist av megleren: merket sier det, og begrunnelsen vises under.
  const message = rejectedByYou ? null : jobMessage(job.status, job.code);

  return (
    <div className="flex flex-col bg-[#0f172a] border border-slate-800 rounded-3xl shadow-xl overflow-hidden">
      <div className="relative aspect-[3/2] bg-[#0B1120] flex items-center justify-center">
        {hasThumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={job.resultUrl as string}
            alt={serviceLabel(job.service)}
            loading="lazy"
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="text-slate-600 text-[10px] font-bold uppercase tracking-widest">
            Ingen forhåndsvisning
          </span>
        )}
      </div>

      <div className="p-5 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <span className="font-bold text-white text-sm truncate">
            {serviceLabel(job.service)}
          </span>
          <StatusPill status={job.status} rejectedByYou={rejectedByYou} />
        </div>
        <span className="text-slate-400 text-xs">
          {formatDate(job.createdAt)}
        </span>
        {message && (
          <p className="text-xs text-slate-300 bg-[#0B1120] border border-slate-800 rounded-xl p-3 leading-relaxed">
            {messageText(locale, message)}
          </p>
        )}
        {rejectedByYou && job.reason && (
          <p className="text-xs text-slate-300 bg-[#0B1120] border border-slate-800 rounded-xl p-3 leading-relaxed break-words">
            {t(locale, "review.reasonLabel")}: {job.reason}
          </p>
        )}
        {canOpenReview(job.status) && (
          <div>
            <OpenReviewLink jobId={job.jobId} labelKey="history.openReview" />
          </div>
        )}
      </div>
    </div>
  );
}

export default function HistoryPage() {
  const { getToken } = useAuth();
  const locale = useLocale();

  // «Venter paa meg» (2d-1): ?status=awaiting_approval,needs_review.
  const [waitingOnly, setWaitingOnly] = useState(false);
  const statuses = waitingOnly ? WAITING_FOR_ME_STATUSES : undefined;

  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  // Bytte av filter mens en henting pagaar: bare det siste svaret teller.
  const requestRef = useRef(0);

  const loadInitial = useCallback(async () => {
    const request = ++requestRef.current;
    setLoading(true);
    setError(null);
    try {
      const rows = await listJobs({ limit: PAGE_SIZE, statuses, getToken });
      if (request !== requestRef.current) return;
      setJobs(rows);
      setHasMore(rows.length === PAGE_SIZE);
    } catch (err) {
      if (request !== requestRef.current) return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }, [getToken, statuses]);

  useEffect(() => {
    void loadInitial();
  }, [loadInitial]);

  const loadMore = useCallback(async () => {
    // Keyset-cursor (TG-NEW-79): plukk SISTE rad med gyldig tidsstempel og
    // send BAADE createdAt og jobId — de maa komme fra samme rad. Backend
    // pagineres paa (created_at, job_id), saa rader med delt created_at paa
    // sidegrensen tapes ikke. Finnes ingen slik rad → ikke flere sider.
    const cursorRow =
      [...jobs].reverse().find((j) => j.createdAt !== null) ?? null;
    if (cursorRow === null) {
      setHasMore(false);
      return;
    }
    const request = requestRef.current;
    setLoadingMore(true);
    setError(null);
    try {
      const rows = await listJobs({
        limit: PAGE_SIZE,
        before: cursorRow.createdAt as string,
        beforeId: cursorRow.jobId,
        statuses,
        getToken,
      });
      // Filteret er byttet mens vi hentet: forkast siden.
      if (request !== requestRef.current) return;
      // Defensiv dedup paa jobId: tie-breaker-gapet i cursoren (kjent
      // backend-grense) skal aldri kunne gi en dobbel rad i UI-et.
      setJobs((prev) => {
        const seen = new Set(prev.map((j) => j.jobId));
        const fresh = rows.filter((j) => !seen.has(j.jobId));
        return [...prev, ...fresh];
      });
      setHasMore(rows.length === PAGE_SIZE);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingMore(false);
    }
  }, [jobs, getToken, statuses]);

  return (
    <div className="flex flex-col bg-[#0B1120] text-white min-h-screen font-sans">
      <main className="max-w-6xl mx-auto w-full p-8 flex-1">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-black text-white uppercase tracking-widest mb-2">
              Historikk
            </h1>
            <p className="text-slate-400 text-sm">
              Alle jobbene dine, nyeste først.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1" role="group">
              {([false, true] as const).map((waiting) => (
                <button
                  key={String(waiting)}
                  onClick={() => setWaitingOnly(waiting)}
                  aria-pressed={waitingOnly === waiting}
                  className={`px-4 py-2.5 rounded-full text-[10px] font-bold uppercase tracking-widest border transition-colors focus:outline-none focus:ring-2 focus:ring-[#009183] focus:ring-offset-2 focus:ring-offset-[#0B1120] ${
                    waitingOnly === waiting
                      ? "bg-slate-800 border-slate-500 text-white"
                      : "border-slate-700 text-slate-400 hover:text-white"
                  }`}
                >
                  {t(locale, waiting ? "history.waitingForMe" : "history.all")}
                </button>
              ))}
            </div>
            <button
              onClick={() => void loadInitial()}
              disabled={loading}
              className="px-5 py-2.5 bg-[#009183] hover:bg-[#00b09f] text-white rounded-full text-[10px] font-black uppercase tracking-widest transition-colors shadow-[0_0_15px_rgba(0,145,131,0.3)] disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[#009183] focus:ring-offset-2 focus:ring-offset-[#0B1120]"
            >
              Oppdater
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="w-8 h-8 border-4 border-[#009183]/30 border-t-[#009183] rounded-full animate-spin motion-reduce:animate-none" />
            <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">
              Laster historikk…
            </p>
          </div>
        ) : error && jobs.length === 0 ? (
          <div className="bg-[#0f172a] border border-red-900/40 rounded-3xl p-10 text-center max-w-lg mx-auto">
            <p className="text-red-400 font-bold text-sm mb-2 uppercase tracking-widest">
              Kunne ikke hente historikk
            </p>
            <p className="text-slate-400 text-xs mb-6 break-words">
              {t(locale, "history.loadError")}
            </p>
            <button
              onClick={() => void loadInitial()}
              className="px-6 py-3 bg-[#009183] hover:bg-[#00b09f] text-white rounded-full text-[10px] font-black uppercase tracking-widest transition-colors focus:outline-none focus:ring-2 focus:ring-[#009183] focus:ring-offset-2 focus:ring-offset-[#0B1120]"
            >
              Prøv igjen
            </button>
          </div>
        ) : jobs.length === 0 && waitingOnly ? (
          <div className="bg-[#0f172a] border border-slate-800 rounded-3xl p-16 text-center max-w-lg mx-auto">
            <p className="text-white font-bold text-lg">
              {t(locale, "history.emptyWaiting")}
            </p>
          </div>
        ) : jobs.length === 0 ? (
          <div className="bg-[#0f172a] border border-slate-800 rounded-3xl p-16 text-center max-w-lg mx-auto">
            <p className="text-white font-bold text-lg mb-2">Ingen jobber enda</p>
            <p className="text-slate-400 text-sm mb-8">
              Kjør din første transformasjon, så dukker den opp her.
            </p>
            <a
              href="/express"
              className="inline-block px-6 py-3 bg-[#009183] hover:bg-[#00b09f] text-white rounded-full text-[10px] font-black uppercase tracking-widest transition-colors shadow-[0_0_15px_rgba(0,145,131,0.3)] focus:outline-none focus:ring-2 focus:ring-[#009183] focus:ring-offset-2 focus:ring-offset-[#0B1120]"
            >
              Gå til Express
            </a>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-10">
              {jobs.map((job) => (
                <JobCard key={job.jobId} job={job} />
              ))}
            </div>

            {error && (
              <p className="text-center text-xs text-red-400 mb-6 break-words">
                {t(locale, "history.loadError")}
              </p>
            )}

            {hasMore && (
              <div className="flex justify-center pb-20">
                <button
                  onClick={() => void loadMore()}
                  disabled={loadingMore}
                  className="px-8 py-3 bg-transparent border border-slate-700 text-slate-300 rounded-full text-[10px] font-bold uppercase tracking-widest hover:bg-slate-800 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[#009183] focus:ring-offset-2 focus:ring-offset-[#0B1120]"
                >
                  {loadingMore ? "Laster…" : "Last inn flere"}
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
