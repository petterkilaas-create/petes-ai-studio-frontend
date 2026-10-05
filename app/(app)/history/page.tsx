"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@clerk/nextjs";
import {
  getCapabilities,
  listJobs,
  WAITING_FOR_ME_STATUSES,
  type Capabilities,
  type JobScope,
  type JobSummary,
  type JobSummaryStatus,
} from "@/app/lib/api";
import {
  thumbSrc,
  isRejectedByReviewer,
  openLinkKey,
  REVIEWER_REJECTED_TONE,
  serviceLabelKey,
  statusVariant,
} from "@/app/lib/statusVariants";
import { OpenReviewLink } from "@/app/components/OpenReviewLink";
import { JobMedia } from "@/app/components/JobMedia";
import { isWorking, mediaView, mergeRefresh } from "@/app/lib/jobMedia";
import type { RefreshResult } from "@/app/lib/autoRefresh";
import { useAutoRefresh } from "@/app/hooks/useAutoRefresh";
import { Button, ButtonLink } from "@/app/components/ui/Button";
import { Card, cardClass } from "@/app/components/ui/Card";
import { PageHeader } from "@/app/components/ui/PageHeader";
import { Pill } from "@/app/components/ui/Pill";
import { messageText, t, type Locale, type UiKey } from "@/app/lib/i18n";
import { jobMessage } from "@/app/lib/jobMessage";
import { useLocale } from "@/app/lib/i18n/useLocale";
import {
  effectiveScope,
  emptyWaitingKey,
  ownerBadge,
  rejectedLabelKey,
  scopeFallback,
  showScopeToggle,
  subtitleKey,
  waitingLabelKey,
} from "@/app/lib/roles";

// Sidestoerrelse pr. henting. before-cursoren pagineres paa createdAt fra
// siste rad (backendens kontrakt) — se loadMore().
const PAGE_SIZE = 20;

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

// Filterknapp (segment): valgt = primary, saa valget ikke bare vises med farge.
function segmentClass(selected: boolean): string {
  return `min-h-11 px-4 rounded-pill text-sm border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper ${
    selected
      ? "bg-primary border-primary text-on-primary font-medium"
      : "bg-surface border-line-strong text-ink-2 hover:text-ink hover:bg-surface-2"
  }`;
}

function JobCard({ job }: { job: JobSummary }) {
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
        view={mediaView(job, thumbSrc(job))}
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

export default function HistoryPage() {
  const { getToken } = useAuth();
  const locale = useLocale();

  // «Venter paa meg» (2d-1): ?status=awaiting_approval,needs_review.
  const [waitingOnly, setWaitingOnly] = useState(false);
  const statuses = waitingOnly ? WAITING_FOR_ME_STATUSES : undefined;

  // TG-NEW-127: bryteren «Mine jobber / Alle brukere» vises bare naar /me gir
  // view_all. Uten svar (null) eller ved feil: ingen bryter, egne jobber.
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [chosenScope, setChosenScope] = useState<JobScope>("mine");
  const scope = effectiveScope(caps, chosenScope);
  const [scopeNotice, setScopeNotice] = useState<UiKey | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getCapabilities({ getToken }).then((c) => {
      if (!cancelled) setCaps(c);
    });
    return () => {
      cancelled = true;
    };
  }, [getToken]);

  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  // Kaldstart (TG-NEW-134): listJobs proever paa nytt, og spinneren viser en rolig tekst.
  const [waking, setWaking] = useState(false);

  // Bytte av filter mens en henting pagaar: bare det siste svaret teller.
  const requestRef = useRef(0);
  // Oekes ved hver full henting («Oppdater», filter): den automatiske
  // hentingen starter telleren paa nytt.
  const [refreshEpoch, setRefreshEpoch] = useState(0);

  const loadInitial = useCallback(async () => {
    const request = ++requestRef.current;
    setLoading(true);
    setError(null);
    setWaking(false);
    const onRetry = () => {
      if (request === requestRef.current) setWaking(true);
    };
    try {
      const rows = await listJobs({ limit: PAGE_SIZE, statuses, scope, getToken, onRetry });
      if (request !== requestRef.current) return;
      setJobs(rows);
      setHasMore(rows.length === PAGE_SIZE);
      setRefreshEpoch((n) => n + 1);
    } catch (err) {
      if (request !== requestRef.current) return;
      // 403/422 for scope: tilbake til «Mine jobber» med en kort melding.
      // Bytte av scope gir ny loadInitial via avhengighetene under.
      const fallback = scopeFallback(err);
      if (fallback !== null) {
        if (fallback.hideToggle) setCaps({ viewAll: false });
        setChosenScope("mine");
        setScopeNotice(fallback.messageKey);
        return;
      }
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (request === requestRef.current) {
        setLoading(false);
        setWaking(false);
      }
    }
  }, [getToken, statuses, scope]);

  useEffect(() => {
    void loadInitial();
  }, [loadInitial]);

  // Ventebildet: stille henting av foerste side mens jobber lages (5 s,
  // tak 10 min, pause naar fanen er skjult). Ingen spinner; sider fra
  // «Last inn flere» beholdes, og uendrede kort beholder bildet sitt.
  const silentRefresh = useCallback(async (): Promise<RefreshResult> => {
    const request = requestRef.current;
    try {
      const rows = await listJobs({ limit: PAGE_SIZE, statuses, scope, getToken });
      // Filteret er byttet: den nye hentingen tar over.
      if (request !== requestRef.current) return { ok: true, working: false };
      setJobs((prev) => mergeRefresh(prev, rows, PAGE_SIZE));
      return { ok: true, working: rows.some((j) => isWorking(j.status)) };
    } catch {
      return { ok: false, working: true };
    }
  }, [getToken, statuses, scope]);

  useAutoRefresh(!loading && jobs.some((j) => isWorking(j.status)), silentRefresh, refreshEpoch);

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
        scope,
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
  }, [jobs, getToken, statuses, scope]);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 md:px-8 md:py-12">
      <div className="mb-8">
        <PageHeader
          title={t(locale, "history.title")}
          subtitle={t(locale, subtitleKey(scope))}
          actions={
            <>
              {showScopeToggle(caps) && (
                <div className="flex gap-1" role="group">
                  {(["mine", "all"] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => {
                        setChosenScope(s);
                        setScopeNotice(null);
                      }}
                      aria-pressed={scope === s}
                      className={segmentClass(scope === s)}
                    >
                      {t(locale, s === "all" ? "history.scope.all" : "history.scope.mine")}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex gap-1" role="group">
                {([false, true] as const).map((waiting) => (
                  <button
                    key={String(waiting)}
                    type="button"
                    onClick={() => setWaitingOnly(waiting)}
                    aria-pressed={waitingOnly === waiting}
                    className={segmentClass(waitingOnly === waiting)}
                  >
                    {t(locale, waiting ? waitingLabelKey(scope) : "history.all")}
                  </button>
                ))}
              </div>
              <Button variant="secondary" onClick={() => void loadInitial()} disabled={loading}>
                {t(locale, "action.refresh")}
              </Button>
            </>
          }
        />
      </div>

      {scopeNotice && (
        <p className="text-sm text-amber-fg bg-amber-bg rounded-button p-3 mb-6" role="status">
          {t(locale, scopeNotice)}
        </p>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4" role="status">
          <div className="w-8 h-8 border-4 border-line border-t-ink rounded-full animate-spin motion-reduce:animate-none" />
          <p className="text-ink-2 text-sm">{t(locale, waking ? "net.waking" : "history.loading")}</p>
        </div>
      ) : error && jobs.length === 0 ? (
        <Card padding="lg" className="text-center max-w-lg mx-auto">
          <p className="text-red-fg font-medium mb-2">{t(locale, "history.loadErrorTitle")}</p>
          <p className="text-ink-2 text-sm mb-6 break-words">{t(locale, "history.loadError")}</p>
          <Button onClick={() => void loadInitial()}>{t(locale, "review.retry")}</Button>
        </Card>
      ) : jobs.length === 0 && waitingOnly ? (
        <Card padding="lg" className="text-center max-w-lg mx-auto">
          <p className="text-ink font-medium text-lg">{t(locale, emptyWaitingKey(scope))}</p>
        </Card>
      ) : jobs.length === 0 ? (
        <Card padding="lg" className="text-center max-w-lg mx-auto">
          <p className="text-ink font-medium text-lg mb-2">{t(locale, "history.emptyTitle")}</p>
          <p className="text-ink-2 text-sm mb-8">{t(locale, "history.emptyBody")}</p>
          <ButtonLink href="/express">{t(locale, "history.toExpress")}</ButtonLink>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-10">
            {jobs.map((job) => (
              <JobCard key={job.jobId} job={job} />
            ))}
          </div>

          {error && (
            <p className="text-center text-sm text-red-fg mb-6 break-words">
              {t(locale, "history.loadError")}
            </p>
          )}

          {hasMore && (
            <div className="flex justify-center pb-20">
              <Button variant="secondary" onClick={() => void loadMore()} disabled={loadingMore}>
                {t(locale, loadingMore ? "history.loadingMore" : "history.loadMore")}
              </Button>
            </div>
          )}
        </>
      )}
    </main>
  );
}
