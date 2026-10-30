"use client";

import { Check } from "lucide-react";
import { runStepKey, type RunStep } from "../../lib/listingText";
import { stepStates } from "../../lib/listingTextOrder";
import { Card } from "../ui/Card";
import { Pill } from "../ui/Pill";
import { t } from "../../lib/i18n";
import { useLocale } from "../../lib/i18n/useLocale";

/**
 * «Behandles» med trinnlista (TG-NEW-281, T2; K §0): Leser dokumentene ->
 * Ser paa bildene -> Velger vinkel -> Skriver -> Kontrollerer. Trinnet som
 * pagaar har `aria-current="step"`, og en levende region leser det opp naar
 * det skifter.
 */
export function ListingTextSteps({ step }: { step: RunStep | null }) {
  const locale = useLocale();
  const steps = stepStates(step);
  return (
    <Card className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <Pill tone="neutral" pulse>
          {t(locale, "assignment.status.processing")}
        </Pill>
        <p className="text-sm text-ink-2">{t(locale, "listingText.processing.hint")}</p>
      </div>
      <ol aria-label={t(locale, "listingText.processing.steps")} className="flex flex-col gap-3">
        {steps.map(({ step: s, state }) => (
          <li
            key={s}
            aria-current={state === "current" ? "step" : undefined}
            className={`flex items-center gap-3 text-sm ${state === "todo" ? "text-ink-2" : "text-ink"}`}
          >
            <span
              aria-hidden
              className={`flex size-6 shrink-0 items-center justify-center rounded-pill border ${
                state === "done" ? "border-green-fg bg-green-bg" : state === "current" ? "border-ink" : "border-line"
              }`}
            >
              {state === "done" && <Check className="size-3.5 text-green-fg" strokeWidth={2.5} />}
              {state === "current" && <span className="size-2 rounded-pill bg-ink animate-pulse motion-reduce:animate-none" />}
            </span>
            <span className={state === "current" ? "font-medium" : undefined}>{t(locale, runStepKey(s))}</span>
          </li>
        ))}
      </ol>
      <p role="status" className="sr-only">
        {step === null ? t(locale, "assignment.status.processing") : t(locale, runStepKey(step))}
      </p>
    </Card>
  );
}
