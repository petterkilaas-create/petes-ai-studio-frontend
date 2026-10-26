"use client";

import Image, { type StaticImageData } from "next/image";
import { Check, Maximize2 } from "lucide-react";
import { boardText, type MoodboardStyle } from "../../lib/moodboards";
import { DEFAULT_BRAND } from "../../lib/brand";
import { t, type Locale } from "../../lib/i18n";
import { DecorDots } from "./DecorDots";
import { FOCUS, LOCKED, TAG } from "./classes";

/**
 * Utstillingsvinduet for stilen i fokus (D-3 kompakt, ca. 420 px paa PC):
 * eksempelbildet stort til venstre (3:2, med AI-lappen og teksten under), og
 * til hoeyre navn og kategori, setningen, paletten som seks prikker, fire
 * materialer som brikker, anbefalt pynt, «Tenk på», «Passer for» og «Unngå»,
 * knappen som velger eller fjerner stilen og «Åpne moodboard». Mobil: bildet
 * oeverst og teksten under.
 *
 * Eksempelbildet er en plassholder (stilproben i referansestua 13861317).
 * Innholdet i moodboardet er bare paa norsk.
 */

const SIZES = "(min-width: 1024px) 490px, 100vw";

/** Antall materialer som brikker; resten staar i moodboardet. */
const CHIPS = 4;

export function StyleFocusPanel({
  board,
  name,
  image,
  on,
  locked,
  disabled,
  onToggle,
  onOpen,
  locale,
}: {
  board: MoodboardStyle;
  /** Navnet fra ordlista (stilnavn_v3). */
  name: string;
  image: StaticImageData;
  on: boolean;
  /** Tre er valgt og denne er ikke blant dem (F1). */
  locked: boolean;
  disabled: boolean;
  onToggle: () => void;
  onOpen: (opener: HTMLElement) => void;
  locale: Locale;
}) {
  return (
    <section
      aria-label={t(locale, "styling.moodboardLabel", { style: name })}
      className="grid gap-4 rounded-card border border-line p-3 sm:p-4 lg:grid-cols-2 lg:gap-5"
    >
      <figure className="m-0 flex flex-col gap-2">
        <div className="relative aspect-[3/2] overflow-hidden rounded-button bg-surface-2">
          <Image
            src={image}
            alt={t(locale, "styling.exampleAlt", { brand: DEFAULT_BRAND.displayName, style: name })}
            fill
            sizes={SIZES}
            className="object-cover"
          />
          <span className={TAG}>{t(locale, "compare.ai")}</span>
        </div>
        <figcaption className="text-[13px] leading-snug text-ink-2">
          <b className="font-semibold text-ink">{t(locale, "styling.example", { brand: DEFAULT_BRAND.displayName })}:</b>{" "}
          {t(locale, "styling.exampleCaption")}
        </figcaption>
      </figure>

      <div className="flex min-w-0 flex-col gap-2.5">
        <div className="flex flex-col gap-1">
          <span className="text-[13px] font-medium text-ink-2">{boardText(board.kategori)}</span>
          <h3 className="font-display text-[32px] font-normal leading-none text-ink">{name}</h3>
          <p className="text-sm leading-snug text-ink">{boardText(board.setning)}</p>
        </div>

        <ul aria-label={t(locale, "styling.palette")} className="flex gap-1.5">
          {board.palett.map((swatch) => (
            <li key={swatch.hex + swatch.navn}>
              <span
                title={boardText(swatch.navn)}
                className="block size-5 rounded-pill border border-line"
                style={{ backgroundColor: swatch.hex }}
              >
                <span className="sr-only">{boardText(swatch.navn)}</span>
              </span>
            </li>
          ))}
        </ul>

        <ul aria-label={t(locale, "styling.materials")} className="flex flex-wrap gap-1.5">
          {board.materialer.slice(0, CHIPS).map((tile) => (
            <li key={tile.navn} className="rounded-pill bg-surface-2 px-2.5 py-1 text-xs text-ink">
              {boardText(tile.navn)}
            </li>
          ))}
        </ul>

        <div className="flex flex-col gap-1.5 text-[13px] leading-snug text-ink-2">
          <p className="flex items-center gap-2">
            <b className="font-semibold text-ink">{t(locale, "styling.decorDots")}:</b>
            <DecorDots filled={board.pynt} of={5} label={t(locale, "styling.decorDotsValue", { n: board.pynt })} />
          </p>
          <p>
            <b className="font-semibold text-ink">{t(locale, "styling.thinkOf")}:</b> {boardText(board.tenkPaa)}
          </p>
          <p>
            <b className="font-semibold text-ink">{t(locale, "styling.fits")}:</b> {boardText(board.passerFor)}
          </p>
          <p>
            <b className="font-semibold text-ink">{t(locale, "styling.avoid")}:</b> {boardText(board.unnga)}
          </p>
        </div>

        <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
          <button
            type="button"
            onClick={onToggle}
            disabled={disabled}
            aria-pressed={on}
            aria-disabled={locked || undefined}
            className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-button border px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS} ${
              on
                ? "border-green-fg/25 bg-green-bg text-green-fg"
                : locked
                  ? LOCKED
                  : "border-primary bg-primary text-on-primary"
            }`}
          >
            {on && <Check aria-hidden className="size-4" strokeWidth={2.4} />}
            {t(locale, on ? "styling.remove" : "styling.pick", { style: name })}
          </button>
          <button
            type="button"
            onClick={(e) => onOpen(e.currentTarget)}
            className={`inline-flex min-h-11 items-center gap-2 rounded-button border border-line-strong bg-surface px-4 text-sm font-medium text-ink hover:bg-surface-2 ${FOCUS}`}
          >
            <Maximize2 aria-hidden className="size-4" strokeWidth={1.8} />
            {t(locale, "styling.openMoodboard")}
          </button>
        </div>
      </div>
    </section>
  );
}
