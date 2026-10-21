"use client";

import { FURNISH_AS_CHOICES, type StylingChoice } from "../lib/styling";
import { codeText, t, type Locale } from "../lib/i18n";

const OPTION =
  "min-h-11 px-4 py-2 rounded-pill text-sm border transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface";
// Valgt = primary, saa valget ikke bare vises med farge (aria-pressed i tillegg).
const ON = "bg-primary border-primary text-on-primary font-medium";
const OFF = "bg-surface border-line-strong text-ink-2 hover:bg-surface-2 hover:text-ink";
const LABEL = "text-sm font-medium text-ink block mb-3";

/**
 * Valgene for Digital styling (S2-f), etter malen i DuskChoicePicker:
 * romtypen («Møbler som …», sju valg ved lansering) og bekreftelsen av at
 * rommet er tomt (Petter 3A). Uten romtype og kryss er «Bestill» av
 * (stylingParams gir null). Ingen tekst eller spoersmaal under romvalget
 * (Cowork 21.10).
 */
export function StylingChoicePicker({
  value,
  onChange,
  disabled,
  locale,
}: {
  value: StylingChoice;
  onChange: (value: StylingChoice) => void;
  disabled: boolean;
  locale: Locale;
}) {
  return (
    <div className="border-t border-line pt-6 space-y-5">
      <div>
        <p className={LABEL}>{t(locale, "styling.furnishAs")}</p>
        <div className="flex flex-wrap gap-2" role="group" aria-label={t(locale, "styling.furnishAs")}>
          {FURNISH_AS_CHOICES.map((room) => (
            <button
              key={room}
              type="button"
              onClick={() => onChange({ ...value, furnishAs: room })}
              disabled={disabled}
              aria-pressed={value.furnishAs === room}
              className={`${OPTION} ${value.furnishAs === room ? ON : OFF}`}
            >
              {codeText(locale, "furnishAs", room)}
            </button>
          ))}
        </div>
      </div>
      <label className={`flex min-h-11 items-center gap-3 text-sm select-none ${disabled ? "text-ink-2 cursor-not-allowed" : "text-ink cursor-pointer"}`}>
        <input
          type="checkbox"
          checked={value.roomEmpty}
          onChange={(e) => onChange({ ...value, roomEmpty: e.target.checked })}
          disabled={disabled}
          className="size-5 accent-primary disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        />
        <span>{t(locale, "styling.roomEmpty")}</span>
      </label>
    </div>
  );
}
