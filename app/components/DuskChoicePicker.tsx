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
  "min-h-11 px-5 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest border transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[#009183] focus:ring-offset-2 focus:ring-offset-[#0f172a]";
const ON = "bg-[#009183] border-[#009183] text-white";
const OFF = "bg-transparent border-slate-700 text-slate-300 hover:border-slate-500 hover:text-white";
const LABEL = "text-[10px] font-black text-[#009183] uppercase tracking-[0.2em] block mb-3";

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
    <div className="border-t border-slate-800 pt-6 space-y-5">
      <p className={LABEL}>Step 3: {t(locale, "dusk.title")}</p>
      <div>
        <p className="text-xs text-slate-400 mb-2">{t(locale, "dusk.time")}</p>
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
        <p className="text-xs text-slate-400 mb-2">{t(locale, "dusk.sky")}</p>
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
        <p className="text-xs text-slate-500 mt-2">{t(locale, "dusk.hint")}</p>
      </div>
    </div>
  );
}
