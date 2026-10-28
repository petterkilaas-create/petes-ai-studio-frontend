"use client";

import { t, type Locale } from "../../lib/i18n";
import type { CandidatesView } from "../../lib/local";
import { buttonClass } from "../ui/Button";

const BTN_SECONDARY = buttonClass("secondary");

/**
 * De to forslagene fra «Marker og beskriv» (FE-3, Dag 58): side om side, paa
 * mobil under hverandre. Kandidaten i bruk har merkelappen «I bruk» (kandidat
 * 1 fra start); de andre har «Bruk denne», som sender `choose` (teller ikke
 * som runde). Bildene er de merkede forhaandsvisningene fra backend; null gir
 * en tekst i stedet for bildet.
 */
export function LocalCandidates({
  view,
  onChoose,
  locked,
  locale,
}: {
  view: CandidatesView;
  onChoose: (k: 1 | 2) => void;
  locked: boolean;
  locale: Locale;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-sm text-ink font-bold">{t(locale, "local.candidatesTitle")}</p>
        <p className="text-xs text-ink-2 mt-1">{t(locale, "local.candidatesHint")}</p>
      </div>
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {view.candidates.map((c) => {
          const inUse = c.k === view.chosen;
          const label = t(locale, "local.candidate", { k: c.k });
          return (
            <li
              key={c.k}
              className={`flex flex-col gap-2 rounded-button border p-2 ${
                inUse ? "border-primary" : "border-line"
              }`}
            >
              {c.previewUrl !== null ? (
                // eslint-disable-next-line @next/next/no-img-element -- forhaandsvisningen fra backend, som ellers paa siden
                <img src={c.previewUrl} alt={label} className="w-full h-auto rounded-button bg-surface-2" />
              ) : (
                <p className="flex aspect-[3/2] items-center justify-center rounded-button bg-surface-2 text-xs text-ink-2">
                  {t(locale, "local.noPreview")}
                </p>
              )}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm text-ink">{label}</span>
                {inUse ? (
                  <span className="text-xs font-medium text-primary">{t(locale, "local.inUse")}</span>
                ) : (
                  view.canChoose && (
                    <button type="button" onClick={() => onChoose(c.k)} disabled={locked} className={BTN_SECONDARY}>
                      {t(locale, "local.useThis")}
                    </button>
                  )
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
