"use client";

import { useId } from "react";
import { variantLabel, type CompareVariant } from "../../lib/compare";
import { t, type Locale } from "../../lib/i18n";
import { choiceClass, LABEL } from "./classes";

/**
 * «Sammenlign originalen med» (D2a): ett valg per variant, nyeste runde
 * foerst. Skjult naar det bare finnes en variant. Etikettene kan vaere lange,
 * saa knappene bryter linja paa smal skjerm.
 */
export function VariantPicker({
  variants,
  selectedId,
  onSelect,
  choices,
  locale,
}: {
  variants: CompareVariant[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Valgene i etiketten (admin, TG-NEW-193). */
  choices: boolean;
  locale: Locale;
}) {
  const headingId = useId();
  if (variants.length <= 1) return null;
  return (
    <div>
      <p id={headingId} className={`${LABEL} mb-2`}>
        {t(locale, "compare.with")}
      </p>
      <div className="flex flex-wrap gap-2" role="group" aria-labelledby={headingId}>
        {variants.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => onSelect(v.id)}
            aria-pressed={selectedId === v.id}
            className={choiceClass(selectedId === v.id, "rounded-button text-left")}
          >
            {variantLabel(locale, v, { choices })}
          </button>
        ))}
      </div>
    </div>
  );
}
