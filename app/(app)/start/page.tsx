"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { ArrowRight, Plus } from "lucide-react";
import { listJobs, WAITING_FOR_ME_STATUSES } from "@/app/lib/api";
import { thumbSrc } from "@/app/lib/statusVariants";
import { mergeRefresh } from "@/app/lib/jobMedia";
import type { RefreshResult } from "@/app/lib/autoRefresh";
import { useAutoRefresh } from "@/app/hooks/useAutoRefresh";
import { useQuota } from "@/app/hooks/useQuota";
import { quotaView } from "@/app/lib/quota";
import { orderableTools, serviceHref, SERVICES_PATH } from "@/app/lib/services";
import {
  anyWorking,
  HISTORY_PATH,
  RECENT_FETCH,
  startView,
  WAITING_FETCH,
  WAITING_HISTORY_HREF,
  type StartJobs,
} from "@/app/lib/start";
import { DEFAULT_BRAND } from "@/app/lib/brand";
import { JobCard } from "@/app/components/JobCard";
import { QuotaNotice } from "@/app/components/QuotaNotice";
import { TOOL_ICONS } from "@/app/components/toolIcons";
import { Button, ButtonLink } from "@/app/components/ui/Button";
import { Card, cardClass } from "@/app/components/ui/Card";
import { PageHeader } from "@/app/components/ui/PageHeader";
import { t, type Locale } from "@/app/lib/i18n";
import { useLocale } from "@/app/lib/i18n/useLocale";

// Merket per foretak kommer med TG-NEW-128 (via resolveBrand).
const brand = DEFAULT_BRAND;

const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper";
const TEXT_LINK = `inline-flex min-h-11 items-center gap-1.5 rounded-button text-sm font-medium text-ink underline-offset-4 hover:underline ${FOCUS}`;
const SECTION_TITLE = "text-lg font-medium text-ink";
const JOB_GRID = "grid grid-cols-1 gap-6 sm:grid-cols-2";

/**
 * Startsiden (TG-NEW-153): «Ny bestilling», det som venter paa megleren,
 * siste jobber og tjenestene som snarveier. En ny bruker uten jobber ser
 * tjenestene foerst. Reglene ligger i lib/start.ts.
 *
 * Kallene: GET /v1/jobs to ganger (egne jobber, ogsaa for admin; «Alle
 * brukere» er i Historikk) og GET /v1/quota. Begge GET proever paa nytt ved
 * kaldstart (TG-NEW-134). Feiler jobbene, virker knappen og tjenestene.
 */
export default function Home() {
  const { getToken } = useAuth();
  const locale = useLocale();
  const quota = useQuota();

  const [jobs, setJobs] = useState<StartJobs>({ kind: "loading" });
  const [waking, setWaking] = useState(false);
  // Bare det siste svaret teller («Proev igjen» mens en henting pagaar).
  const requestRef = useRef(0);
  // Oekes ved hver full henting: den automatiske hentingen starter paa nytt.
  const [refreshEpoch, setRefreshEpoch] = useState(0);

  const fetchJobs = useCallback(async () => {
    const request = ++requestRef.current;
    const onRetry = () => {
      if (request === requestRef.current) setWaking(true);
    };
    try {
      const [waiting, recent] = await Promise.all([
        listJobs({ limit: WAITING_FETCH, statuses: WAITING_FOR_ME_STATUSES, getToken, onRetry }),
        listJobs({ limit: RECENT_FETCH, getToken, onRetry }),
      ]);
      if (request !== requestRef.current) return;
      setJobs({ kind: "loaded", waiting, recent });
      setRefreshEpoch((n) => n + 1);
    } catch {
      if (request === requestRef.current) setJobs({ kind: "error" });
    } finally {
      if (request === requestRef.current) setWaking(false);
    }
  }, [getToken]);

  useEffect(() => {
    void fetchJobs();
  }, [fetchJobs]);

  const retry = () => {
    setJobs({ kind: "loading" });
    void fetchJobs();
  };

  // Som i Historikk: stille henting mens en jobb lages (useAutoRefresh og
  // mergeRefresh, uendret). Uendrede kort beholder bildet sitt.
  const silentRefresh = useCallback(async (): Promise<RefreshResult> => {
    const request = requestRef.current;
    try {
      const [waiting, recent] = await Promise.all([
        listJobs({ limit: WAITING_FETCH, statuses: WAITING_FOR_ME_STATUSES, getToken }),
        listJobs({ limit: RECENT_FETCH, getToken }),
      ]);
      if (request !== requestRef.current) return { ok: true, working: false };
      setJobs((prev) =>
        prev.kind === "loaded"
          ? {
              kind: "loaded",
              waiting: mergeRefresh(prev.waiting, waiting, WAITING_FETCH),
              recent: mergeRefresh(prev.recent, recent, RECENT_FETCH),
            }
          : { kind: "loaded", waiting, recent }
      );
      // Statusene er de samme etter flettingen: listene er aldri lengre enn en henting.
      return { ok: true, working: anyWorking({ kind: "loaded", waiting, recent }) };
    } catch {
      return { ok: false, working: true };
    }
  }, [getToken]);

  useAutoRefresh(anyWorking(jobs), silentRefresh, refreshEpoch);

  const view = startView(jobs);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-8 md:px-8 md:py-12">
      <div className="flex flex-col gap-3">
        <PageHeader
          title={t(locale, "home.title", { brand: brand.displayName })}
          subtitle={view.kind === "new" ? t(locale, "home.intro") : undefined}
          actions={
            <ButtonLink href={SERVICES_PATH}>
              <Plus aria-hidden className="size-4" strokeWidth={2} />
              {t(locale, "start.newOrder")}
            </ButtonLink>
          }
        />
        {/* Telleren for gratisbilder bare naar kvoten er begrenset (ikke admin). */}
        <QuotaNotice view={quotaView(quota.quota)} locale={locale} />
      </div>

      {view.kind === "new" && <ServiceShortcuts locale={locale} lead />}

      {view.kind === "loading" && (
        <div className="flex flex-col items-center justify-center gap-4 py-12" role="status">
          <div className="size-8 animate-spin rounded-full border-4 border-line border-t-ink motion-reduce:animate-none" />
          <p className="text-sm text-ink-2">{t(locale, waking ? "net.waking" : "start.loading")}</p>
        </div>
      )}

      {view.kind === "error" && (
        <Card padding="lg" className="mx-auto w-full max-w-lg text-center">
          <p className="mb-2 font-medium text-red-fg">{t(locale, "start.loadErrorTitle")}</p>
          <p className="mb-6 text-sm text-ink-2">{t(locale, "history.loadError")}</p>
          <Button onClick={retry}>{t(locale, "review.retry")}</Button>
        </Card>
      )}

      {view.kind === "active" && (
        <>
          <section className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className={SECTION_TITLE}>{t(locale, "start.waiting.title")}</h2>
              {view.moreWaiting && (
                <Link href={WAITING_HISTORY_HREF} className={TEXT_LINK}>
                  {t(locale, "start.waiting.more")}
                  <ArrowRight aria-hidden className="size-4" />
                </Link>
              )}
            </div>
            {view.waiting.length === 0 ? (
              <p className="text-sm text-ink-2">{t(locale, "start.waiting.empty")}</p>
            ) : (
              <div className={`${JOB_GRID} lg:grid-cols-4`}>
                {view.waiting.map((job) => (
                  <JobCard key={job.jobId} job={job} thumb={thumbSrc(job)} />
                ))}
              </div>
            )}
          </section>

          {view.recent.length > 0 && (
            <section className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className={SECTION_TITLE}>{t(locale, "start.recent.title")}</h2>
                <Link href={HISTORY_PATH} className={TEXT_LINK}>
                  {t(locale, "start.recent.all")}
                  <ArrowRight aria-hidden className="size-4" />
                </Link>
              </div>
              <div className={`${JOB_GRID} lg:grid-cols-3`}>
                {view.recent.map((job) => (
                  <JobCard key={job.jobId} job={job} thumb={thumbSrc(job)} />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {view.kind !== "new" && <ServiceShortcuts locale={locale} />}
    </main>
  );
}

/**
 * Tjenestene som snarveier: bare de som kan bestilles (orderableTools, fra
 * ENABLED). Hver gaar til Tjenester med tjenesten valgt.
 */
function ServiceShortcuts({ locale, lead = false }: { locale: Locale; lead?: boolean }) {
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className={SECTION_TITLE}>{t(locale, "start.services.title")}</h2>
        {lead && <p className="mt-1 text-sm text-ink-2">{t(locale, "start.services.lead")}</p>}
      </div>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {orderableTools().map((tool) => {
          const Icon = TOOL_ICONS[tool.id];
          return (
            <Link
              key={tool.id}
              href={serviceHref(tool.id)}
              className={cardClass(
                "lg",
                `group flex h-full flex-col transition-colors hover:border-line-strong ${FOCUS}`
              )}
            >
              {Icon && (
                <span aria-hidden className="mb-6 flex size-11 items-center justify-center rounded-button bg-surface-2 text-ink">
                  <Icon className="size-5" strokeWidth={1.75} />
                </span>
              )}
              <h3 className="mb-2 text-lg font-medium text-ink">{t(locale, tool.titleKey)}</h3>
              <p className="mb-8 flex-1 text-sm leading-relaxed text-ink-2">{t(locale, tool.descKey)}</p>
              <span className="flex items-center gap-2 text-sm font-medium text-ink">
                {t(locale, "start.services.open")}
                <ArrowRight aria-hidden className="size-4 transition-transform group-hover:translate-x-1 motion-reduce:transition-none" />
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
