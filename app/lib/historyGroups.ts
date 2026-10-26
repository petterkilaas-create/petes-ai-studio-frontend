import type { JobSummary } from "./api";
import { formatDay } from "./dates.ts";
import { t, type Locale } from "./i18n/index.ts";

/**
 * Historikken per bestilling (TG-NEW-262). Rene funksjoner, saa reglene kan
 * testes med node --test; bare type-import fra api.ts (den kaster ved import
 * naar NEXT_PUBLIC_API_BASE mangler).
 *
 * Grupperingen gjelder det som er lastet. Siden kaller groupHistory over hele
 * lista ved hver render, saa kommer resten av en bestilling paa neste side
 * («Last inn flere»), havner den i samme gruppe uten egen tilstand.
 */

/** En oppfoering i Historikken: en jobb som i dag, eller en bestilling. */
export type HistoryEntry =
  | { kind: "job"; job: JobSummary }
  | { kind: "order"; orderId: string; jobs: JobSummary[] };

/**
 * Oppfoeringene i rekkefoelgen fra lista (nyeste foerst). En bestilling blir
 * en gruppe foerst naar minst to jobber med samme `orderId` er lastet (som
 * fanene paa godkjenningssiden); én jobb vises som i dag. Gruppa staar der
 * den nyeste jobben i bestillingen staar, og jobbene i gruppa staar eldst
 * foerst (stilrekkefoelgen, som fanene). Jobber uten `orderId` er enkeltjobber.
 */
export function groupHistory(jobs: readonly JobSummary[]): HistoryEntry[] {
  const byOrder = new Map<string, JobSummary[]>();
  for (const job of jobs) {
    if (job.orderId === null) continue;
    const list = byOrder.get(job.orderId);
    if (list === undefined) byOrder.set(job.orderId, [job]);
    else list.push(job);
  }
  const entries: HistoryEntry[] = [];
  const placed = new Set<string>();
  for (const job of jobs) {
    const group = job.orderId === null ? undefined : byOrder.get(job.orderId);
    if (job.orderId === null || group === undefined || group.length < 2) {
      entries.push({ kind: "job", job });
      continue;
    }
    if (placed.has(job.orderId)) continue;
    placed.add(job.orderId);
    entries.push({ kind: "order", orderId: job.orderId, jobs: [...group].reverse() });
  }
  return entries;
}

/**
 * Overskriften paa en bestilling: «Digital styling · 3 stiler · 26. okt.
 * 2026». Datoen er fra den eldste jobben; antallet er jobbene som er lastet.
 * Rommet staar ikke med: jobblista sender det ikke (AVVIK 1, valg A).
 */
export function orderHeading(locale: Locale, jobs: readonly JobSummary[]): string {
  const n = jobs.length;
  const styles = t(locale, n === 1 ? "styling.summary.styles.1" : "styling.summary.styles.n", { n });
  const day = formatDay(jobs[0]?.createdAt ?? null, locale);
  return [t(locale, "service.virtual_stage"), styles, day].join(" · ");
}
