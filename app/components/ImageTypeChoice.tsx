"use client";

import { choiceKey, type ImageTypeChoice as Choice } from "../lib/imageType";
import { t, type Locale } from "../lib/i18n";

// Samme knapper som himmelvalget i DuskChoicePicker.
const OPTION =
  "min-h-11 px-4 py-2 rounded-pill text-sm border transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface";
const ON = "bg-primary border-primary text-on-primary font-medium";
const OFF = "bg-surface border-line-strong text-ink-2 hover:bg-surface-2 hover:text-ink";
const LABEL = "text-sm font-medium text-ink block mb-1";

/**
 * «Hvor er bildet tatt?» (TG-NEW-268) i bestillingen for Kveldsbilde og Blå
 * himmel. Bare valgene tjenesten godtar (imageTypeChoices); «La analysen
 * avgjøre» er standard og sendes ikke. Valget gjelder bildet, ikke tjenesten.
 */
export function ImageTypeChoice({
  choices,
  value,
  onChange,
  disabled,
  locale,
}: {
  choices: readonly Choice[];
  value: Choice;
  onChange: (value: Choice) => void;
  disabled: boolean;
  locale: Locale;
}) {
  return (
    <div className="border-t border-line pt-6">
      <p className={LABEL}>{t(locale, "imageTypeChoice.title")}</p>
      <p className="text-[13px] text-ink-2 mb-3">{t(locale, "imageTypeChoice.help")}</p>
      <div className="flex flex-wrap gap-2" role="group" aria-label={t(locale, "imageTypeChoice.title")}>
        {choices.map((choice) => (
          <button
            key={choice}
            type="button"
            onClick={() => onChange(choice)}
            disabled={disabled}
            aria-pressed={value === choice}
            className={`${OPTION} ${value === choice ? ON : OFF}`}
          >
            {t(locale, choiceKey(choice))}
          </button>
        ))}
      </div>
    </div>
  );
}
