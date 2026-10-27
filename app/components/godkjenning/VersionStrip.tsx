"use client";

import { useId } from "react";
import { stripLabel, stripShown, type StripEntry } from "../../lib/compare";
import { t, type Locale } from "../../lib/i18n";
import { FOCUS, LABEL } from "./classes";

/**
 * Versjonsstripa (FE-c, Dag 57): originalen foerst, saa versjonene eldst
 * foerst, hver med miniatyr og etikett («Original», «Versjon 1», «Versjon 2
 * · nå»). Erstatter VariantPicker paa siden og i lysboksen. Skjult naar det
 * bare finnes én versjon. Bare visning: valget sendes aldri til backend.
 *
 * Miniatyren er forhaandsvisningen skalert ned med CSS (lastes lat); mangler
 * lenken, vises en tom flate, aldri en annen lenke. Etiketten er teksten
 * skjermlesere leser, saa bildet har tom alt.
 */
export function VersionStrip({
  strip,
  selectedId,
  onSelect,
  choices,
  presetId,
  locale,
}: {
  strip: StripEntry[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Valgene i etiketten (admin, TG-NEW-193). */
  choices: boolean;
  /** Oppskriften: styling viser stilen i parentes i stedet for skumringsvalgene (B2). */
  presetId: string | null;
  locale: Locale;
}) {
  const headingId = useId();
  if (!stripShown(strip)) return null;
  return (
    <div>
      <p id={headingId} className={`${LABEL} mb-2`}>
        {t(locale, "compare.versions")}
      </p>
      <div className="flex flex-wrap gap-2" role="group" aria-labelledby={headingId}>
        {strip.map((entry) => {
          const selected = selectedId === entry.id;
          return (
            <button
              key={entry.id}
              type="button"
              onClick={() => onSelect(entry.id)}
              aria-pressed={selected}
              className={`inline-flex min-h-11 max-w-full items-center gap-2 rounded-button border bg-surface py-1 pl-1 pr-3 text-left text-[13px] text-ink transition-colors ${FOCUS} ${
                selected ? "border-ink ring-1 ring-ink font-semibold" : "border-line-strong hover:bg-surface-2"
              }`}
            >
              {entry.url !== null ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={entry.url}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  draggable={false}
                  className="h-9 w-[54px] shrink-0 rounded-[5px] object-cover"
                />
              ) : (
                <span aria-hidden="true" className="h-9 w-[54px] shrink-0 rounded-[5px] bg-surface-2" />
              )}
              <span className="min-w-0 break-words">{stripLabel(locale, entry, { choices, presetId })}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
