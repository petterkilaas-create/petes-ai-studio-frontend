"use client";

import { useRef, useState } from "react";
import { DECOR_LEVELS, STYLING_STYLES, styleShort, type DecorLevel, type StylingStyle } from "../../lib/styling";
import { MOODBOARDS } from "../../lib/moodboards";
import { t, type Locale } from "../../lib/i18n";
import { StyleCards } from "./StyleCards";
import { MoodboardDialog } from "./Moodboard";
import { DecorDots } from "./DecorDots";

const OPTION =
  "min-h-11 px-4 py-2 rounded-pill text-sm border transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface";
const ON = "bg-primary border-primary text-on-primary font-medium";
const OFF = "bg-surface border-line-strong text-ink-2 hover:bg-surface-2 hover:text-ink";
const LABEL = "text-sm font-medium text-ink";

/** Prikkene i pyntknappene: ●○○ Lite, ●●○ Middels, ●●● Mye (som i bestillingen). */
const DECOR_DOTS: Record<DecorLevel, number> = { 1: 1, 3: 2, 5: 3 };

/**
 * Stil og pyntnivå i «Rett» for Digital styling («Endre valg», TG-NEW-145,
 * FE-a). Byggesteinene fra StylingChoicePicker: stilkortene (kompakt, to per
 * rad) med moodboardet bak i-knappen, og pyntknappene. Romtypen og ønskene
 * kan ikke endres (kontrakten), saa de vises ikke.
 *
 * Én stil, ikke flervalg: et trykk paa kortet eller haken velger stilen.
 * `styles` er stilene som vises (correctionStyles: uten stilene som er andre
 * jobber i bestillingen, V-b). Dagens stil er forvalgt; er den ikke blant de
 * 14 (en eldre stil), er ingen valgt. Pyntnivået har «Anbefalt for stilen»
 * (null) i tillegg til Lite, Middels og Mye, saa et bilde laget med stilens
 * eget nivå kan vises som valgt.
 */
export function StylingCorrectionPicker({
  styles,
  style,
  decor,
  onStyle,
  onDecor,
  disabled,
  locale,
}: {
  styles: readonly StylingStyle[];
  style: StylingStyle | null;
  decor: DecorLevel | null;
  onStyle: (style: StylingStyle) => void;
  onDecor: (decor: DecorLevel | null) => void;
  disabled: boolean;
  locale: Locale;
}) {
  const [sheet, setSheet] = useState<StylingStyle | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const hidden = styles.length < STYLING_STYLES.length;
  const select = (next: StylingStyle) => {
    if (!disabled) onStyle(next);
  };
  return (
    <div className="space-y-4">
      <div>
        <p className={`${LABEL} mb-1`}>{t(locale, "correct.style")}</p>
        {hidden && <p className="text-[13px] text-ink-2 mb-2">{t(locale, "correct.styleHint")}</p>}
        <div role="group" aria-label={t(locale, "correct.style")}>
          <StyleCards
            styles={style === null ? [] : [style]}
            focus={style}
            atLimit={false}
            disabled={disabled}
            onFocus={select}
            onToggle={select}
            onOpen={(s, from) => {
              opener.current = from;
              setSheet(s);
            }}
            shown={styles}
            compact
            locale={locale}
          />
        </div>
        {sheet !== null && (
          <MoodboardDialog
            board={MOODBOARDS[sheet]}
            name={t(locale, `styling.style.${styleShort(sheet)}`)}
            onClose={() => {
              setSheet(null);
              opener.current?.focus();
            }}
            locale={locale}
          />
        )}
      </div>
      <div>
        <p className={`${LABEL} mb-2`}>{t(locale, "styling.decor")}</p>
        <div className="flex flex-wrap gap-2" role="group" aria-label={t(locale, "styling.decor")}>
          {[null, ...DECOR_LEVELS].map((level) => (
            <button
              key={level ?? "default"}
              type="button"
              onClick={() => onDecor(level)}
              disabled={disabled}
              aria-pressed={decor === level}
              className={`${OPTION} ${decor === level ? ON : OFF} inline-flex items-center gap-2`}
            >
              {level !== null && <DecorDots filled={DECOR_DOTS[level]} of={3} />}
              {t(locale, `styling.decorLevel.${level ?? "default"}`)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
