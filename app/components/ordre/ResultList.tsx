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
 *
 * FE-3c: navnet staar paa egen linje i full bredde og brytes som vanlig tekst;
 * under staar statusen, versjonen og «Åpne» i én rad som brytes ved behov.
 * «Åpne» har ordren med som `?fra=`, saa godkjenningssiden lenker tilbake hit.
 */
export function ResultList({
  results,
  number,
  assignmentId,
}: {
  results: readonly AssignmentResult[];
  number: number;
  assignmentId: string;
}) {
  const locale = useLocale();
  if (results.length === 0) return null;
  return (
    <ul className="flex flex-col gap-3 border-t border-line pt-3" aria-label={t(locale, "orders.results.title")}>
      {results.map((result) => {
        const label = resultLabel(locale, result);
        const href = resultReviewHref(result, assignmentId);
        return (
          <li key={result.resultId} className="flex min-w-0 flex-col gap-1.5 text-sm">
            <p className="break-words text-ink">{label}</p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <Pill tone={resultTone(result.displayStatus)} pulse={result.displayStatus === "processing"}>
                {t(locale, resultStatusKey(result.displayStatus, result.previousVersion))}
              </Pill>
              <span className="whitespace-nowrap text-[13px] text-ink-2">
                {t(locale, "orders.results.version", { n: result.version })}
              </span>
              {href !== null && (
                <Link
                  href={href}
                  aria-label={t(locale, "orders.results.openLabel", { label, n: number })}
                  className={buttonClass("secondary", "px-4")}
                >
                  {t(locale, "orders.results.open")}
                </Link>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
