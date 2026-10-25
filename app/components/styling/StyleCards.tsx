"use client";

import { Check, Info } from "lucide-react";
import { STYLING_STYLES, styleShort, type StylingStyle } from "../../lib/styling";
import { MOODBOARDS } from "../../lib/moodboards";
import { t, type Locale } from "../../lib/i18n";
import { FOCUS } from "./classes";

/**
 * De 14 stilene som smaa fargekort (D-3 kompakt), i nr-rekkefoelge: en
 * stripe med de seks palettfargene og navnet. Tre knapper per kort, ved
 * siden av hverandre (ikke inni hverandre):
 * - selve kortet viser stilen i panelet (fokus, aria-current);
 * - i-knappen aapner moodboardet i utvidet format direkte (Petter 15.55),
 *   med trykkflate paa 44 px;
 * - haken velger eller fjerner stilen (aria-pressed; aria-disabled naar tre
 *   andre er valgt, F1). Fokus og valg er to ting.
 *
 * Valgt kort har moerk ramme og fylt hake. Med tre valgt dempes de andre.
 * PC: 7 per rad (to rader). Mobil: én rad som sveipes, ca. 2,5 kort synlig.
 */
export function StyleCards({
  styles,
  focus,
  atLimit,
  disabled,
  onFocus,
  onToggle,
  onOpen,
  locale,
}: {
  styles: readonly StylingStyle[];
  focus: StylingStyle;
  atLimit: boolean;
  disabled: boolean;
  onFocus: (style: StylingStyle) => void;
  onToggle: (style: StylingStyle) => void;
  /** Aapner moodboardet; knappen faar fokus tilbake naar dialogen lukkes. */
  onOpen: (style: StylingStyle, opener: HTMLElement) => void;
  locale: Locale;
}) {
  return (
    <ul className="-mx-1 flex snap-x snap-mandatory gap-2 overflow-x-auto px-1 pt-1 pb-2 md:mx-0 md:grid md:grid-cols-5 md:overflow-visible md:px-0 md:pb-0 lg:grid-cols-7">
      {STYLING_STYLES.map((style) => {
        const short = styleShort(style);
        const name = t(locale, `styling.style.${short}`);
        const on = styles.includes(style);
        const locked = atLimit && !on;
        const focused = focus === style;
        return (
          <li
            key={style}
            className={`relative h-[88px] w-[38%] shrink-0 snap-start overflow-hidden rounded-button border md:w-auto ${
              on ? "border-ink ring-1 ring-ink" : "border-line"
            } ${focused ? "bg-surface-2" : "bg-surface"} ${locked ? "opacity-60" : ""}`}
          >
            <button
              type="button"
              onClick={() => onFocus(style)}
              aria-label={t(locale, "styling.showStyle", { style: name })}
              aria-current={focused || undefined}
              className={`absolute inset-0 flex flex-col text-left text-ink ${FOCUS}`}
            >
              <span aria-hidden="true" className="flex h-3.5 w-full">
                {MOODBOARDS[style].palett.map((swatch) => (
                  <span key={swatch.hex + swatch.navn} className="flex-1" style={{ backgroundColor: swatch.hex }} />
                ))}
              </span>
              <span className={`line-clamp-2 px-2.5 pt-1.5 text-[13px] leading-tight ${focused ? "font-semibold" : "font-medium"}`}>
                {name}
              </span>
            </button>
            <button
              type="button"
              onClick={(e) => onOpen(style, e.currentTarget)}
              aria-label={t(locale, "styling.openMoodboardFor", { style: name })}
              className={`absolute bottom-0 left-0 flex size-11 items-center justify-center text-ink-2 hover:text-ink ${FOCUS}`}
            >
              <Info aria-hidden className="size-4" strokeWidth={1.8} />
            </button>
            <button
              type="button"
              onClick={() => onToggle(style)}
              disabled={disabled}
              aria-pressed={on}
              aria-disabled={locked || undefined}
              aria-label={t(locale, "styling.toggleStyle", { style: name })}
              className={`group absolute right-0 bottom-0 flex size-11 items-center justify-center disabled:cursor-not-allowed disabled:opacity-50 ${
                locked ? "cursor-not-allowed" : ""
              } ${FOCUS}`}
            >
              <span
                aria-hidden="true"
                className={`flex size-7 items-center justify-center rounded-md border-2 transition-colors ${
                  on
                    ? "border-primary bg-primary text-on-primary"
                    : locked
                      ? "border-line-strong bg-surface"
                      : "border-line-strong bg-surface group-hover:border-ink"
                }`}
              >
                {on && <Check className="size-4" strokeWidth={2.6} />}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
