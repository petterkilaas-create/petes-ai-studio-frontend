"use client";

import Image, { type StaticImageData } from "next/image";
import {
  changeSky,
  changeStyle,
  DUSK_STYLES,
  skyChoices,
  STYLE_SUMMER,
  type DuskChoice,
  type DuskStyle,
} from "../lib/dusk";
import { codeText, t, type Locale } from "../lib/i18n";
import { FOCUS, TAG } from "./styling/classes";

const OPTION =
  "min-h-11 px-4 py-2 rounded-pill text-sm border transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface";
// Valgt = primary, saa valget ikke bare vises med farge (aria-pressed i tillegg).
const ON = "bg-primary border-primary text-on-primary font-medium";
const OFF = "bg-surface border-line-strong text-ink-2 hover:bg-surface-2 hover:text-ink";
const LABEL = "text-sm font-medium text-ink block mb-3";

// Valgt kort: samme ramme som stilkortene i Digital styling (StyleCards).
const CARD =
  "flex h-full w-full flex-col overflow-hidden rounded-button border bg-surface text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50";
const CARD_ON = "border-ink ring-1 ring-ink";
const CARD_OFF = "border-line hover:bg-surface-2";

// To kort per rad paa mobil, fire fra md (siden er hoeyst max-w-6xl).
const SIZES = "(min-width: 768px) 270px, 50vw";

/**
 * Stilkortene for Kveldsbilde (Dag 55, TG-NEW-259): fire kort med
 * eksempelbilde, AI-lappen, navnet og én linje tekst. Ett trykk velger
 * stilen; tidspunktet foelger kortet (dusk.ts). Himmelknappene finnes bare
 * under Blå time, saa et ugyldig valg ikke kan lages.
 *
 * Merknaden for Lys sommerkveld ligger i en aria-live-boks som alltid
 * finnes, saa skjermlesere leser den opp naar teksten kommer.
 *
 * Bildene kommer som prop fra siden (duskImages.ts), fordi node --test ikke
 * kan laste .jpg.
 */
export function DuskChoicePicker({
  value,
  onChange,
  disabled,
  images,
  locale,
}: {
  value: DuskChoice;
  onChange: (value: DuskChoice) => void;
  disabled: boolean;
  images: Record<DuskStyle, StaticImageData>;
  locale: Locale;
}) {
  const summer = value.style === STYLE_SUMMER;
  const skies = skyChoices(value.style);
  return (
    <div className="border-t border-line pt-6 space-y-4">
      <p className={LABEL}>{t(locale, "dusk.title")}</p>
      <ul className="grid grid-cols-2 gap-2 md:grid-cols-4" aria-label={t(locale, "dusk.style")}>
        {DUSK_STYLES.map((style) => {
          const name = codeText(locale, "duskStyle", style);
          const on = value.style === style;
          return (
            <li key={style}>
              <button
                type="button"
                onClick={() => onChange(changeStyle(value, style))}
                disabled={disabled}
                aria-pressed={on}
                className={`${CARD} ${on ? CARD_ON : CARD_OFF} ${FOCUS}`}
              >
                <span className="relative block aspect-[3/2] w-full bg-surface-2">
                  <Image
                    src={images[style]}
                    alt={t(locale, "dusk.exampleAlt", { style: name })}
                    fill
                    sizes={SIZES}
                    className="object-cover"
                  />
                  <span aria-hidden="true" className={TAG}>
                    {t(locale, "compare.ai")}
                  </span>
                </span>
                <span className="flex flex-col gap-1 px-2.5 pt-2 pb-3">
                  <span className={`text-sm text-ink ${on ? "font-semibold" : "font-medium"}`}>{name}</span>
                  <span className="text-[13px] leading-snug text-ink-2">{t(locale, `dusk.cardText.${style}`)}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <div>
        <p className="text-[13px] text-ink-2">{t(locale, "dusk.cardsHint")}</p>
        {/* Alltid i treet (ikke display:none); tom har den ingen hoeyde. */}
        <p aria-live="polite" className={`text-[13px] text-ink${summer ? " mt-2" : ""}`}>
          {summer ? t(locale, "dusk.summerNote") : ""}
        </p>
      </div>
      {skies.length > 0 && (
        <div>
          <p className="text-[13px] text-ink-2 mb-2">{t(locale, "dusk.sky")}</p>
          <div className="flex flex-wrap gap-2" role="group" aria-label={t(locale, "dusk.sky")}>
            {skies.map((sky) => (
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
      )}
    </div>
  );
}
