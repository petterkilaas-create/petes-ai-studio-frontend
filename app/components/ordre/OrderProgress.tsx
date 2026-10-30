"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, Check } from "lucide-react";
import {
  fillPercent,
  mobileNextText,
  mobileStepText,
  orderProgress,
  readLastStep,
  saveLastStep,
  sessionMemory,
  stepAria,
  stepName,
  stepSub,
  type OrderPage,
  type ProgressCounts,
  type ProgressStep,
} from "../../lib/orderProgress";
import type { NextState } from "../../lib/player";
import { Button, ButtonLink } from "../ui/Button";
import { FOCUS } from "../godkjenning/classes";
import { t } from "../../lib/i18n";
import { useLocale } from "../../lib/i18n/useLocale";

/**
 * Fremdriftslinja fast nederst i ordresidene (Dag 59, FREMDRIFT; skissene
 * Main, Mobil og Alle): de fem stegene, «Tilbake» og sidens hovedknapp.
 * Reglene (steget, lenkene, undertekstene) ligger i lib/orderProgress.ts.
 *
 * Siden lager hovedknappen selv (`primary`), med samme handling og samme
 * graa/aktiv-logikk som foer; linja plasserer den bare. Over linja staar en
 * tom blokk med linjas hoeyde (ResizeObserver), saa ingenting paa siden
 * skjules bak den.
 *
 * Fyllet glir fra forrige steg for ordren (sessionStorage) til dette;
 * `motion-reduce` slaar av glidingen. Linja har ingen tastaturhandler, saa
 * ←/→ i spilleren virker som foer. Under `md`: «Steg 2 av 5 · Tjenester»,
 * fem korte streker, underteksten for steget kunden staar paa (Petter ved
 * stopp 2), en «Tilbake»-pil og knappen i hele bredden.
 */
export function OrderProgress({
  page,
  assignment,
  draftCount,
  servicesNow = null,
  primary = null,
}: {
  page: OrderPage;
  /** Ordren, eller null paa /ordrer/ny. */
  assignment: { id: string; counts: ProgressCounts } | null;
  /** Antall elementer i utkastet paa brettet (draftCount i lib). */
  draftCount: number;
  /** Underteksten paa Tjenester: totalsText fra brettet. */
  servicesNow?: string | null;
  /** Hovedknappen for siden, eller null. */
  primary?: ReactNode;
}) {
  const locale = useLocale();
  const view = orderProgress(page, assignment, draftCount);
  const { current } = view;
  const id = assignment?.id ?? null;
  const counts = assignment?.counts ?? null;

  // Fyllet starter paa forrige steg for ordren og glir til dette etter foerste tegning.
  const [from] = useState(() => (id === null ? null : readLastStep(sessionMemory(), id)));
  const [glided, setGlided] = useState(false);
  useEffect(() => {
    if (id !== null) saveLastStep(sessionMemory(), id, current);
  }, [id, current]);
  useEffect(() => {
    if (from === null || from === current) return;
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setGlided(true));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [from, current]);
  const shown = glided || from === null ? current : from;

  // Bunnmargen: like hoey som linja (den kan bryte over flere linjer).
  const barRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const el = barRef.current;
    if (el === null || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setHeight(el.offsetHeight));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const currentStep = view.steps[current - 1];
  const currentSub = stepSub(locale, currentStep, current, counts, servicesNow);

  return (
    <>
      <div aria-hidden style={{ height }} />
      <div
        ref={barRef}
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface shadow-[0_-8px_24px_color-mix(in_srgb,var(--color-ink)_6%,transparent)]"
      >
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:flex-row md:items-center md:gap-10 md:px-8 md:pt-[18px] md:pb-[calc(22px+env(safe-area-inset-bottom))]">
          <nav aria-label={t(locale, "progress.label")} className="min-w-0 md:max-w-[760px] md:flex-1">
            <div className="relative hidden md:block">
              <div aria-hidden className="absolute inset-x-[10%] top-[13px] h-0.5 rounded-pill bg-line">
                <div
                  className="h-0.5 rounded-pill bg-ink transition-[width] duration-[450ms] ease-[cubic-bezier(0.2,0.7,0.2,1)] motion-reduce:transition-none"
                  style={{ width: `${fillPercent(shown)}%` }}
                />
              </div>
              <ol className="relative grid grid-cols-5">
                {view.steps.map((step) => (
                  <li key={step.id} className="flex min-w-0 justify-center">
                    <StepItem step={step} sub={stepSub(locale, step, current, counts, servicesNow)} />
                  </li>
                ))}
              </ol>
            </div>

            <div className="flex flex-col gap-2 md:hidden">
              <p className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 text-sm text-ink-2">
                  {mobileStepText(locale, current)}
                  {" · "}
                  <span className="font-semibold text-ink">{stepName(locale, currentStep.id)}</span>
                </span>
                <span className="shrink-0 text-xs text-ink-2">{mobileNextText(locale, current)}</span>
              </p>
              <ol className="grid grid-cols-5 gap-1">
                {view.steps.map((step) => (
                  <li
                    key={step.id}
                    aria-current={step.state === "current" ? "step" : undefined}
                    className={`h-1 rounded-pill transition-colors duration-[350ms] motion-reduce:transition-none ${
                      step.n <= shown ? "bg-ink" : "bg-line"
                    }`}
                  >
                    <span className="sr-only">{stepAria(locale, step)}</span>
                  </li>
                ))}
              </ol>
              {currentSub !== null && <p className="text-xs leading-4 text-ink-2">{currentSub}</p>}
            </div>
          </nav>

          {(view.backHref !== null || primary !== null) && (
            <div className="flex items-center gap-2 md:ml-auto md:shrink-0 md:gap-3">
              {view.backHref !== null && (
                <>
                  <Link
                    href={view.backHref}
                    aria-label={t(locale, "action.back")}
                    className={`inline-flex size-12 shrink-0 items-center justify-center rounded-button border border-line-strong bg-surface text-ink hover:bg-surface-2 md:hidden ${FOCUS}`}
                  >
                    <ArrowLeft aria-hidden className="size-[18px]" strokeWidth={2} />
                  </Link>
                  <ButtonLink variant="secondary" href={view.backHref} className="hidden md:inline-flex">
                    {t(locale, "action.back")}
                  </ButtonLink>
                </>
              )}
              {primary !== null && (
                <div className="flex min-w-0 flex-1 *:min-h-12 *:w-full md:flex-none md:*:min-h-11 md:*:w-auto">{primary}</div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/** Ett steg paa PC: sirkelen, navnet og underteksten. Ferdige og naadde steg med lenke er lenker. */
function StepItem({ step, sub }: { step: ProgressStep; sub: string | null }) {
  const locale = useLocale();
  const label = stepName(locale, step.id);
  const content = (
    <>
      <span aria-hidden className={nodeClass(step.state)}>
        {step.state === "done" && <Check className="size-3.5" strokeWidth={3} />}
        {step.state === "current" && <span className="size-2.5 rounded-pill bg-ink" />}
        {(step.state === "reached" || step.state === "todo") && step.n}
      </span>
      <span aria-hidden className={labelClass(step.state)}>
        {label}
      </span>
      <span className="sr-only">{stepAria(locale, step)}</span>
      <span className="min-h-4 text-xs leading-4 text-ink-2">{sub}</span>
    </>
  );
  const box = "flex min-w-0 flex-col items-center gap-2 px-1 text-center";
  if (step.href !== null) {
    return (
      <Link href={step.href} className={`${box} rounded-button ${FOCUS}`}>
        {content}
      </Link>
    );
  }
  return (
    <div className={box} aria-current={step.state === "current" ? "step" : undefined}>
      {content}
    </div>
  );
}

function nodeClass(state: ProgressStep["state"]): string {
  const base =
    "flex size-7 items-center justify-center rounded-pill text-xs font-medium transition-[background-color,border-color,box-shadow] duration-300 motion-reduce:transition-none";
  if (state === "done") return `${base} border-2 border-ink bg-ink text-surface`;
  if (state === "current") return `${base} border-2 border-ink bg-surface text-ink ring-[5px] ring-surface-2`;
  if (state === "reached") return `${base} border-2 border-ink bg-surface text-ink`;
  return `${base} border-[1.5px] border-line-strong bg-surface text-ink-2`;
}

function labelClass(state: ProgressStep["state"]): string {
  if (state === "current") return "text-sm leading-[18px] font-semibold text-ink";
  if (state === "done" || state === "reached") return "text-sm leading-[18px] font-medium text-ink";
  return "text-sm leading-[18px] text-ink-2";
}

/**
 * Hovedknappen paa Godkjenning (spilleren og bildesiden etter start), fra
 * nextState, som spillerens «Neste til godkjenning» foer: neste som venter
 * (`onNext` i spilleren, `nextHref` paa bildesiden), graa «Ingen flere nå,
 * N behandles», «Gå til nedlasting», eller graa «Ingen flere til godkjenning
 * nå» (stopp 1, valg 4A).
 */
export function ApprovalNextButton({
  state,
  nextLabel,
  onNext,
  nextHref,
  deliveryHref,
}: {
  state: NextState;
  /** «Stue · Kveldsbilde» for neste, til skjermleseren. */
  nextLabel: string;
  onNext?: () => void;
  nextHref?: string;
  deliveryHref: string;
}) {
  const locale = useLocale();
  if (state.kind === "next") {
    const aria = t(locale, "player.next", { label: nextLabel });
    return nextHref !== undefined ? (
      <ButtonLink href={nextHref} aria-label={aria}>
        {t(locale, "player.nextToReview")}
      </ButtonLink>
    ) : (
      <Button onClick={onNext} aria-label={aria}>
        {t(locale, "player.nextToReview")}
      </Button>
    );
  }
  if (state.kind === "waiting") return <Button disabled>{t(locale, "player.waiting", { n: state.processing })}</Button>;
  if (state.kind === "all_reviewed") return <ButtonLink href={deliveryHref}>{t(locale, "progress.toDownload")}</ButtonLink>;
  return <Button disabled>{t(locale, "player.noneWaiting")}</Button>;
}
