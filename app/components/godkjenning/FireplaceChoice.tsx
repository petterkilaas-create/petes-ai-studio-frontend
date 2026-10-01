"use client";

import { FIREPLACE_OPTIONS, type FireplaceAnswer } from "../../lib/review";
import { t, type Locale } from "../../lib/i18n";
import { buttonClass } from "../ui/Button";

const BTN_PRIMARY = buttonClass("primary");
const BTN_SECONDARY = buttonClass("secondary");

/**
 * Peisspoersmaalet med Tent/Ikke tent (2d-2d). Brukes baade for «Send
 * videre» og i rettingen. Linja under knappene sier at «Ikke tent» slukker
 * ild i originalen; den staar utenfor knappene saa de holder seg korte paa mobil.
 */
export function FireplaceChoice({
  answer,
  onChange,
  disabled,
  locale,
}: {
  answer: FireplaceAnswer;
  onChange: (answer: "yes" | "no") => void;
  disabled: boolean;
  locale: Locale;
}) {
  return (
    <div>
      <p className="text-sm text-ink font-bold mb-2">{t(locale, "action.fireplaceQuestion")}</p>
      <div className="flex flex-wrap gap-2" role="group">
        {FIREPLACE_OPTIONS.map((option) => (
          <button
            key={option.value}
            onClick={() => onChange(option.value)}
            disabled={disabled}
            aria-pressed={answer === option.value}
            className={answer === option.value ? BTN_PRIMARY : BTN_SECONDARY}
          >
            {t(locale, option.key)}
          </button>
        ))}
      </div>
      <p className="text-xs text-ink-2 mt-2">{t(locale, "action.fireplaceNotLitHint")}</p>
    </div>
  );
}
