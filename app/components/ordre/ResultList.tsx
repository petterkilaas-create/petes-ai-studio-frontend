"use client";

import Link from "next/link";
import type { AssignmentResult } from "../../lib/assignments";
import { resultStatusKey } from "../../lib/assignments";
import { resultLabel } from "../../lib/brett";
import { resultReviewHref, resultTone } from "../../lib/ordrer";
import { buttonClass } from "../ui/Button";
import { Pill } from "../ui/Pill";
import { t } from "../../lib/i18n";
import { useLocale } from "../../lib/i18n/useLocale";

/**
 * Resultatene paa et bilde (FE-3, K 2.3): tjenesten og valget, statusen som
 * tekst og versjonen, med lenke til godkjenningssiden for det som er til
 * godkjenning, trenger svar eller er godkjent. Kjeden virker slik uten
 * ordresiden (FE-4).
 */
export function ResultList({ results, number }: { results: readonly AssignmentResult[]; number: number }) {
  const locale = useLocale();
  if (results.length === 0) return null;
  return (
    <ul className="flex flex-col gap-2 border-t border-line pt-3" aria-label={t(locale, "orders.results.title")}>
      {results.map((result) => {
        const label = resultLabel(locale, result);
        const href = resultReviewHref(result);
        return (
          <li key={result.resultId} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span className="min-w-0 flex-1 text-ink">{label}</span>
            <Pill tone={resultTone(result.displayStatus)} pulse={result.displayStatus === "processing"}>
              {t(locale, resultStatusKey(result.displayStatus, result.previousVersion))}
            </Pill>
            <span className="text-[13px] text-ink-2">{t(locale, "orders.results.version", { n: result.version })}</span>
            {href !== null && (
              <Link
                href={href}
                aria-label={t(locale, "orders.results.openLabel", { label, n: number })}
                className={buttonClass("secondary", "px-4")}
              >
                {t(locale, "orders.results.open")}
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}
