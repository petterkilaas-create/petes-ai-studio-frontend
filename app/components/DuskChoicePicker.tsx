"use client";

import {
  changeSky,
  changeTime,
  DUSK_SKY_BY_TIME,
  DUSK_TIMES,
  type DuskChoice,
} from "../lib/dusk";
import { codeText, t, type Locale } from "../lib/i18n";

const OPTION =
  "min-h-11 px-4 py-2 rounded-pill text-sm border transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface";
// Valgt = primary, saa valget ikke bare vises med farge (aria-pressed i tillegg).
const ON = "bg-primary border-primary text-on-primary font-medium";
const OFF = "bg-surface border-line-strong text-ink-2 hover:bg-surface-2 hover:text-ink";
const LABEL = "text-sm font-medium text-ink block mb-3";

/**
 * Skumringsvalg i Express (2f-b): tidspunkt og himmel. Himmelknappene viser
 * bare de lovlige valgene for tidspunktet, saa et ugyldig par kan ikke velges.
 */
export function DuskChoicePicker({
  value,
  onChange,
  disabled,
  locale,
}: {
  value: DuskChoice;
  onChange: (value: DuskChoice) => void;
  disabled: boolean;
  locale: Locale;
}) {
  return (
    <div className="border-t border-line pt-6 space-y-5">
      <p className={LABEL}>Step 3: {t(locale, "dusk.title")}</p>
      <div>
        <p className="text-[13px] text-ink-2 mb-2">{t(locale, "dusk.time")}</p>
        <div className="flex flex-wrap gap-2" role="group" aria-label={t(locale, "dusk.time")}>
          {DUSK_TIMES.map((time) => (
            <button
              key={time}
              type="button"
              onClick={() => onChange(changeTime(value, time))}
              disabled={disabled}
              aria-pressed={value.time === time}
              className={`${OPTION} ${value.time === time ? ON : OFF}`}
            >
              {codeText(locale, "duskTime", time)}
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="text-[13px] text-ink-2 mb-2">{t(locale, "dusk.sky")}</p>
        <div className="flex flex-wrap gap-2" role="group" aria-label={t(locale, "dusk.sky")}>
          {DUSK_SKY_BY_TIME[value.time].map((sky) => (
            <button
              key={sky}
              type="button"
              onClick={() => onChange(changeSky(value, sky))}
              disabled={disabled}
              aria-pressed={value.sky === sky}
              className={`${OPTION} ${value.sky === sky ? ON : OFF}`}
            >
              {codeText(locale, "duskSky", sky)}
            </button>
          ))}
        </div>
        <p className="text-[13px] text-ink-2 mt-2">{t(locale, "dusk.hint")}</p>
      </div>
    </div>
  );
}
