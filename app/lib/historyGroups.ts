import type { JobSummary } from "./api";
import { formatDate } from "./dates.ts";
import { t, type Locale, type Message, type UiKey } from "./i18n/index.ts";
import { cardNote, type MediaView } from "./jobMedia.ts";
import { jobMessage } from "./jobMessage.ts";
import { failedLines } from "./notCreated.ts";
import { wishesSummaryText } from "./wishes.ts";
import { ownerBadge, rejectedLabelKey } from "./roles.ts";
import { canOpenReview, isRejectedByReviewer } from "./statusVariants.ts";
import { MAX_ORDER_JOBS, styleText } from "./styling.ts";
import { isAarstidPreset, seasonText } from "./aarstid.ts";

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

/*
 * Kortet for en bestilling (OrderCard, dag 55): ett kort i rutenettet med
 * stilene side om side i bildet, én linje per stil og én knapp. Jobbene er
 * i stilrekkefoelgen (eldst foerst), som fra groupHistory.
 */

/**
 * Tittelen: «Digital styling · 3 stiler». Antallet er jobbene som er lastet.
 * Rommet staar ikke med: jobblista sender det ikke (AVVIK 1, valg A).
 * En bestilling av aarstider (alle jobbene `aarstid_…`, TG-NEW-271) heter
 * «Årstider · 3 bilder».
 */
export function orderTitle(locale: Locale, jobs: readonly JobSummary[]): string {
  const n = jobs.length;
  if (n > 0 && jobs.every((j) => isAarstidPreset(j.presetId))) {
    const images = t(locale, n === 1 ? "aarstid.summary.images.1" : "aarstid.summary.images.n", { n });
    return [t(locale, "express.tool.aarstider.title"), images].join(" · ");
  }
  const styles = t(locale, n === 1 ? "styling.summary.styles.1" : "styling.summary.styles.n", { n });
  return [t(locale, "service.virtual_stage"), styles].join(" · ");
}

/** Dato og klokkeslett fra den eldste jobben (formatDate, som JobCard). */
export function orderDate(locale: Locale, jobs: readonly JobSummary[]): string {
  return formatDate(jobs[0]?.createdAt ?? null, locale);
}

/**
 * Knappen: jobben som venter (den foerste i stilrekkefoelgen), ellers den
 * foerste jobben. Teksten som paa JobCard (openLinkKey): «Åpne godkjenning»
 * naar en venter, ellers «Åpne». Godkjenningssiden viser fanene for hele
 * bestillingen. null bare uten jobber.
 */
export function orderOpen(jobs: readonly JobSummary[]): { jobId: string; labelKey: UiKey } | null {
  const waiting = jobs.find((j) => canOpenReview(j.status));
  const target = waiting ?? jobs[0];
  if (target === undefined) return null;
  return { jobId: target.jobId, labelKey: waiting !== undefined ? "history.openReview" : "history.open" };
}

/** En linje per stil: navnet, merket som paa JobCard og teksten under. */
export interface OrderLine {
  /** Stilnavnet alene («Funkis») eller aarstiden («Høst»); noe ukjent heter «Digital styling». */
  label: string;
  job: JobSummary;
  /** «Avvist av deg» eller «Avvist av eieren» i stedet for statusen (som JobCard). */
  rejectedKey: UiKey | null;
  /** Begrunnelsen naar megleren har avvist (som JobCard). */
  reason: string | null;
  /** Den korte meldingen (jobMessage), aldri raa `error`; null naar jobben er avvist av megleren. */
  message: Message | null;
  /** P3b: grunnene naar vi ikke laget bildet, og gratisbildet bare ved "returned" (failedLines). */
  lines: UiKey[];
  /** TG-NEW-263: «Ønsker: 2 av 3 tatt med» for stilen (planen lages per stil), eller null. Aldri tekst fra ønsket. */
  wishes: { key: UiKey; vars: Record<string, number> } | null;
}

export function orderLines(locale: Locale, jobs: readonly JobSummary[]): OrderLine[] {
  return jobs.map((job) => {
    const rejected = isRejectedByReviewer(job);
    return {
      label: styleText(locale, job.presetId) ?? seasonText(locale, job.presetId) ?? t(locale, "service.virtual_stage"),
      job,
      rejectedKey: rejected ? rejectedLabelKey(job) : null,
      reason: rejected && job.reason ? job.reason : null,
      message: rejected ? null : jobMessage(job.status, job.code),
      lines: failedLines(job),
      wishes: wishesSummaryText(job.wishesSummary),
    };
  });
}

/** «Ikke din» med eier én gang per kort (scope=all), eller null. */
export function orderOwner(jobs: readonly JobSummary[]): { ownerShort: string | null } | null {
  for (const job of jobs) {
    const other = ownerBadge(job);
    if (other !== null) return other;
  }
  return null;
}

/**
 * Merknaden om slettede bilder (cardNote) én gang per kort, naar den gjelder
 * minst én av jobbene. `thumbs` staar i samme rekkefoelge som `jobs`.
 */
export function orderNote(jobs: readonly JobSummary[], thumbs: readonly (string | null)[]): UiKey | null {
  for (const [i, job] of jobs.entries()) {
    const note = cardNote(job, thumbs[i] ?? null);
    if (note !== null) return note;
  }
  return null;
}

/** Rutene i bildet: hoeyst MAX_ORDER_JOBS, i stilrekkefoelgen. */
export function orderTiles<T>(items: readonly T[]): T[] {
  return items.slice(0, MAX_ORDER_JOBS);
}

/**
 * En rute i bildet: samme visning som paa JobCard (mediaView), men uten
 * tekst over bildet. Statusen staar i linja for stilen. Et slettet bilde
 * blir plassholderen.
 */
export function tileView(view: MediaView): MediaView {
  if (view.kind === "result") return view;
  if (view.kind === "original") return { ...view, overlay: null };
  return { kind: "placeholder", overlay: null };
}
