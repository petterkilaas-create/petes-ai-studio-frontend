"use client";

import { useId } from "react";
import { Check } from "lucide-react";
import {
  chooseSource,
  MAX_SEASONS,
  SEASONS,
  seasonKey,
  SOURCE_SEASONS,
  targetsFor,
  toggleSeason,
  type AarstidChoice,
} from "../lib/aarstid";
import { t, type Locale } from "../lib/i18n";

const OPTION =
  "min-h-11 px-4 py-2 rounded-pill text-sm border transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface";
// Valgt = primary, saa valget ikke bare vises med farge (aria-pressed i tillegg).
const ON = "bg-primary border-primary text-on-primary font-medium";
const OFF = "bg-surface border-line-strong text-ink-2 hover:bg-surface-2 hover:text-ink";
const LOCKED = "bg-surface border-line text-ink-2 opacity-60 cursor-not-allowed";
const LABEL = "text-sm font-medium text-ink";

/**
 * Valgene for Aarstider (TG-NEW-271, Dag 57): 1 · når bildet er tatt
 * (Sommer, Høst, Vår; paakrevd, ingen forhaandsvalgt, vinter vises ikke),
 * 2 · aarstidene megleren vil se (flervalg, hoeyst tre, bare de lovlige for
 * kilden og aldri samme som kilden) og 3 · bildetypen, bare «Utendørs».
 * Uten kilde og aarstid er «Bestill» av (aarstidParams gir null); den faste
 * bestillingslinja staar paa siden.
 *
 * Flervalget foelger stilkortene (F1): med tre valgt er resten aria-disabled,
 * de blir i Tab-rekkefoelgen og leses som utilgjengelige, og gruppen peker
 * paa hjelpelinja («Velg én til tre»). En valgt aarstid kan alltid velges bort.
 */
export function AarstidChoicePicker({
  value,
  onChange,
  disabled,
  locale,
}: {
  value: AarstidChoice;
  onChange: (value: AarstidChoice) => void;
  disabled: boolean;
  locale: Locale;
}) {
  const sourceHelpId = useId();
  const seasonsHelpId = useId();
  const typeHelpId = useId();
  const targets = targetsFor(value.source);
  const atLimit = value.seasons.length >= MAX_SEASONS;
  const toggle = (season: (typeof SEASONS)[number]) => {
    const on = value.seasons.includes(season);
    if (!on && atLimit) return;
    onChange(toggleSeason(value, season));
  };
  return (
    <div className="border-t border-line pt-6 space-y-5">
      <div>
        <div className="mb-2.5 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <p className={LABEL}>
            <span className="text-ink-2">1 · </span>
            {t(locale, "aarstid.source")}
          </p>
          <p id={sourceHelpId} className="text-sm text-ink-2">{t(locale, "aarstid.sourceHelp")}</p>
        </div>
        <div
          className="flex flex-wrap gap-2"
          role="group"
          aria-label={t(locale, "aarstid.source")}
          aria-describedby={sourceHelpId}
        >
          {SOURCE_SEASONS.map((source) => (
            <button
              key={source}
              type="button"
              onClick={() => onChange(chooseSource(value, source))}
              disabled={disabled}
              aria-pressed={value.source === source}
              className={`${OPTION} ${value.source === source ? ON : OFF}`}
            >
              {t(locale, seasonKey(source))}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-2.5 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <p className={LABEL}>
            <span className="text-ink-2">2 · </span>
            {t(locale, "aarstid.seasons")}
          </p>
          <p id={seasonsHelpId} className="text-sm text-ink-2">
            {t(locale, value.source === null ? "aarstid.seasonsNoSource" : "aarstid.seasonsHelp")}
          </p>
        </div>
        {targets.length > 0 && (
          <div
            className="flex flex-wrap gap-2"
            role="group"
            aria-label={t(locale, "aarstid.seasons")}
            aria-describedby={seasonsHelpId}
          >
            {targets.map((season) => {
              const on = value.seasons.includes(season);
              const locked = atLimit && !on;
              return (
                <button
                  key={season}
                  type="button"
                  onClick={() => toggle(season)}
                  disabled={disabled}
                  aria-pressed={on}
                  aria-disabled={locked || undefined}
                  className={`${OPTION} ${on ? ON : locked ? LOCKED : OFF} inline-flex items-center gap-2`}
                >
                  <span
                    aria-hidden="true"
                    className={`flex size-5 items-center justify-center rounded-md border-2 ${
                      on ? "border-on-primary" : "border-line-strong"
                    }`}
                  >
                    {on && <Check className="size-3.5" strokeWidth={2.6} />}
                  </span>
                  {t(locale, seasonKey(season))}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <div className="mb-2.5 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <p className={LABEL}>
            <span className="text-ink-2">3 · </span>
            {t(locale, "aarstid.imageType")}
          </p>
          <p id={typeHelpId} className="text-sm text-ink-2">{t(locale, "aarstid.imageTypeHelp")}</p>
        </div>
        {/* Det eneste valget backend godtar for aarstider; alltid valgt og sendt. */}
        <div className="flex flex-wrap gap-2" role="group" aria-label={t(locale, "aarstid.imageType")} aria-describedby={typeHelpId}>
          <button type="button" aria-pressed="true" aria-disabled="true" className={`${OPTION} ${ON} cursor-default`}>
            {t(locale, "imageTypeChoice.exterior")}
          </button>
        </div>
      </div>

      <p className="text-sm text-ink-2">{t(locale, "aarstid.orderNote")}</p>
    </div>
  );
}
