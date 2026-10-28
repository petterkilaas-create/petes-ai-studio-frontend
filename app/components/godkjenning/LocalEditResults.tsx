"use client";

import { Check } from "lucide-react";
import type { LocalEditNumber } from "../../lib/api";
import { codeText, t, type Locale } from "../../lib/i18n";
import { LOCAL_INSTRUCTION_KEYS, type EditResultRow } from "../../lib/local";
import { buttonClass } from "../ui/Button";

const BTN_SECONDARY = buttonClass("secondary", "min-h-11");

/**
 * Lista etter en lokal runde (studio v2, Dag 58): én rad per endring med
 * samme nummer som boksen i bildet, ✓ eller feilmeldingen, og «Prøv igjen»
 * (ny runde som bare gjoer den endringen paa nytt; teller som runde). Peker
 * man paa en rad, lyser boksen opp i sammenligningen (`activeK`).
 */
export function LocalEditResults({
  rows,
  activeK,
  onActive,
  onRetry,
  locked,
  locale,
}: {
  rows: EditResultRow[];
  activeK: LocalEditNumber | null;
  onActive: (k: LocalEditNumber | null) => void;
  onRetry: (k: LocalEditNumber) => void;
  locked: boolean;
  locale: Locale;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-ink font-bold">{t(locale, "local.resultsTitle")}</p>
      <ol aria-label={t(locale, "local.resultsTitle")} className="flex flex-col gap-2">
        {rows.map((row) => {
          const label = row.instruction === null ? t(locale, "local.editTitle", { n: row.k }) : t(locale, LOCAL_INSTRUCTION_KEYS[row.instruction]);
          const active = activeK === row.k;
          return (
            <li
              key={row.k}
              onPointerEnter={(e) => e.pointerType === "mouse" && onActive(row.k)}
              onPointerLeave={(e) => e.pointerType === "mouse" && onActive(null)}
              onFocus={() => onActive(row.k)}
              className={`flex flex-wrap items-center justify-between gap-2 rounded-button border p-3 ${
                active ? "border-primary bg-surface-2" : "border-line"
              }`}
            >
              <div className="flex min-w-0 items-start gap-2">
                <span
                  aria-hidden="true"
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-pill text-sm font-semibold text-surface ${
                    active ? "bg-primary" : "bg-ink"
                  }`}
                >
                  {row.k}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">
                    <span className="sr-only">{t(locale, "local.editTitle", { n: row.k })}: </span>
                    {label}
                  </p>
                  {row.ok ? (
                    <p className="flex items-center gap-1 text-xs text-ink-2">
                      <Check aria-hidden="true" className="h-4 w-4 text-primary" />
                      {t(locale, "local.editDone")}
                    </p>
                  ) : (
                    <p className="text-xs text-amber-fg">{codeText(locale, "localEditError", row.code)}</p>
                  )}
                </div>
              </div>
              {row.canRetry && (
                <button type="button" onClick={() => onRetry(row.k)} disabled={locked} className={BTN_SECONDARY}>
                  {t(locale, "local.retry")}
                </button>
              )}
            </li>
          );
        })}
      </ol>
      <p className="text-xs text-ink-2">{t(locale, "local.retryHint")}</p>
    </div>
  );
}
