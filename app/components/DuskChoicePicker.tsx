"use client";

import {
  changeSky,
  changeStyle,
  changeTime,
  DUSK_SKY_BY_TIME,
  DUSK_STYLES,
  DUSK_TIMES,
  STYLE_V2,
  type DuskChoice,
  type DuskStyle,
} from "../lib/dusk";
import { codeText, t, type Locale, type UiKey } from "../lib/i18n";

const OPTION =
  "min-h-11 px-4 py-2 rounded-pill text-sm border transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface";
// Valgt = primary, saa valget ikke bare vises med farge (aria-pressed i tillegg).
const ON = "bg-primary border-primary text-on-primary font-medium";
const OFF = "bg-surface border-line-strong text-ink-2 hover:bg-surface-2 hover:text-ink";
const LABEL = "text-sm font-medium text-ink block mb-3";

// Knappeteksten er egen ui-tekst: «(test)» staar bare her (TG-NEW-189).
const STYLE_BUTTON: Record<DuskStyle, UiKey> = {
  nordic_blue_hour_v1: "dusk.styleStandard",
  warm_dusk_v2: "dusk.styleWarm",
};

/**
 * Skumringsvalg i Express (2f-b): tidspunkt og himmel. Himmelknappene viser
 * bare de lovlige valgene for tidspunktet, saa et ugyldig par kan ikke velges.
 *
 * Stil v2 (TG-NEW-189): stilen velges foerst. Tid og himmel staar ogsaa med
 * varm skumring (de brukes hvis den ikke passer bildet), under en linje som
 * sier det. Linja ligger i en aria-live-boks som alltid finnes, saa
 * skjermlesere leser den opp naar teksten kommer.
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
  const warm = value.style === STYLE_V2;
  const starry = value.sky === "starry";
  return (
    <div className="border-t border-line pt-6 space-y-5">
      <p className={LABEL}>{t(locale, "dusk.title")}</p>
      <div>
        <p className="text-[13px] text-ink-2 mb-2">{t(locale, "dusk.style")}</p>
        <div className="flex flex-wrap gap-2" role="group" aria-label={t(locale, "dusk.style")}>
          {DUSK_STYLES.map((style) => (
            <button
              key={style}
              type="button"
              onClick={() => onChange(changeStyle(value, style))}
              disabled={disabled}
              aria-pressed={value.style === style}
              className={`${OPTION} ${value.style === style ? ON : OFF}`}
            >
              {t(locale, STYLE_BUTTON[style])}
            </button>
          ))}
        </div>
        <p className="text-[13px] text-ink-2 mt-2">{t(locale, "dusk.styleHint")}</p>
      </div>
      <div>
        {/* Alltid i treet (ikke display:none); tom har den ingen hoeyde. */}
        <p aria-live="polite" className={`text-[13px] text-ink${warm ? " mb-3" : ""}`}>
          {warm ? t(locale, "dusk.styleFallbackNote") : ""}
        </p>
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
        {/* Stjernehimmel (S4): bare en tekst, ingen sperre. Alltid i treet, som linja over. */}
        <p aria-live="polite" className={`text-[13px] text-ink${starry ? " mt-2" : ""}`}>
          {starry ? t(locale, "dusk.starryNote") : ""}
        </p>
      </div>
    </div>
  );
}
