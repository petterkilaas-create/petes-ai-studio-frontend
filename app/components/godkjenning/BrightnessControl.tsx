"use client";

import { useEffect, useId } from "react";
import { isBrightnessStep, type BrightnessStep } from "../../lib/api";
import { BRIGHTNESS_MAX, BRIGHTNESS_MIN, stepName, type BrightnessView } from "../../lib/brightness";
import { t, type Locale } from "../../lib/i18n";
import { FOCUS } from "./classes";

/**
 * Lysstyrke med fem trinn (TG-NEW-147), rett under bildet. En innebygd
 * range gir piltaster, Home/End og skjermleser (aria-valuetext er trinnets
 * navn). Det valgte trinnet vises i det store bildet, fra backend
 * (`preview_url`), aldri med et CSS-filter.
 *
 * Laast naar en eldre runde er valgt (Petter 02.10, valg B) og mens et kall
 * pågår. De andre trinnene forhaandslastes naar hovedbildet er lastet.
 */
export function BrightnessControl({
  view,
  step,
  onChange,
  locked,
  preload,
  ready,
  locale,
}: {
  view: Extract<BrightnessView, { kind: "control" }>;
  step: BrightnessStep;
  onChange: (step: BrightnessStep) => void;
  /** Et kall pågår, eller siden poller. */
  locked: boolean;
  /** Lenkene til de andre trinnene. */
  preload: string[];
  /** Hovedbildet er lastet. */
  ready: boolean;
  locale: Locale;
}) {
  const headingId = useId();
  const name = stepName(locale, step);
  const preloadKey = preload.join("\n");

  useEffect(() => {
    if (!ready || preloadKey === "") return;
    for (const url of preloadKey.split("\n")) {
      const img = new Image();
      img.src = url;
    }
  }, [ready, preloadKey]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <p id={headingId} className="text-sm font-medium text-ink">
          {t(locale, "brightness.title")}
        </p>
        <p className="text-sm text-ink" aria-hidden="true">
          {name}
        </p>
      </div>
      <input
        type="range"
        min={BRIGHTNESS_MIN}
        max={BRIGHTNESS_MAX}
        step={1}
        value={step}
        onChange={(e) => {
          const next = Number(e.target.value);
          if (isBrightnessStep(next)) onChange(next);
        }}
        disabled={view.locked || locked}
        aria-labelledby={headingId}
        aria-valuetext={name}
        className={`h-11 w-full cursor-pointer rounded-button accent-primary disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS}`}
      />
      <div className="flex justify-between gap-3 text-[13px] text-ink-2" aria-hidden="true">
        <span>{stepName(locale, BRIGHTNESS_MIN)}</span>
        <span>{stepName(locale, BRIGHTNESS_MAX)}</span>
      </div>
      {view.locked && <p className="text-[13px] text-ink-2">{t(locale, "brightness.currentRoundOnly")}</p>}
    </div>
  );
}

/** Etter godkjenning: bare det godkjente trinnet, som tekst. */
export function BrightnessApproved({ step, locale }: { step: BrightnessStep; locale: Locale }) {
  return <p className="text-sm text-ink">{t(locale, "brightness.approved", { step: stepName(locale, step) })}</p>;
}
