"use client";

import { useState } from "react";
import type { Moods } from "../../../content/marketing/schema";
import { MarketingPicture } from "./MarketingPicture";
import { FOCUS } from "./classes";

/**
 * Valget av stemning (MS3): to grupper med valgknapper (aria-pressed), som
 * valgknappene i appen. Tab gaar mellom knappene, Enter og Space velger.
 * Bildet til valgt stemning vises ved siden av, med tidspunkt og navn under.
 * Er bildet en plassholder, staar «Eksempel kommer.» foran notatet.
 */
const SIZES = "(min-width: 1024px) 720px, 100vw";

function chipClass(selected: boolean): string {
  return `inline-flex min-h-11 items-center whitespace-nowrap rounded-pill border px-4 text-[15px] font-medium ${FOCUS} ${
    selected ? "border-ink bg-ink text-surface" : "border-line-strong bg-surface text-ink hover:bg-surface-2"
  }`;
}

export function MoodPicker({
  groups,
  defaultSky,
  fireplaceNote,
  placeholderCaption,
  placeholderTitle,
  pendingLabel,
}: {
  groups: Moods["groups"];
  defaultSky: string;
  fireplaceNote: string;
  placeholderCaption: string;
  placeholderTitle: string;
  pendingLabel: string;
}) {
  const [sky, setSky] = useState(defaultSky);
  const all = groups.flatMap((g) => g.items.map((item) => ({ ...item, group: g })));
  const mood = all.find((m) => m.sky === sky) ?? all[0];
  const caption = ["placeholder" in mood.picture ? placeholderCaption : null, mood.note ?? null]
    .filter((part): part is string => part !== null)
    .join(" ");

  return (
    <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
      <div className="flex flex-col gap-6">
        {groups.map((g) => (
          <div key={g.time} className="flex flex-col gap-3">
            <p className="m-0 text-[15px] font-semibold text-ink">{g.label}</p>
            <div role="group" aria-label={g.groupLabel} className="flex flex-wrap gap-2">
              {g.items.map((m) => (
                <button
                  key={m.sky}
                  type="button"
                  aria-pressed={m.sky === mood.sky}
                  onClick={() => setSky(m.sky)}
                  className={chipClass(m.sky === mood.sky)}
                >
                  {m.name}
                </button>
              ))}
            </div>
          </div>
        ))}
        <p className="m-0 text-[15px] leading-[1.55] text-ink-2">{fireplaceNote}</p>
      </div>
      <figure className="m-0 flex flex-col gap-2.5">
        <MarketingPicture
          picture={mood.picture}
          sizes={SIZES}
          placeholderTitle={placeholderTitle}
          pendingLabel={pendingLabel}
        />
        <figcaption className="flex flex-col gap-1 text-[14px] leading-[1.5]">
          <span className="font-medium text-ink">{`${mood.group.label} · ${mood.name}`}</span>
          {caption !== "" && <span className="text-ink-2">{caption}</span>}
        </figcaption>
      </figure>
    </div>
  );
}
