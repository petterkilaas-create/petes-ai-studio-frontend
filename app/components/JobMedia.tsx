"use client";

import { Image as ImageIcon, LoaderCircle } from "lucide-react";
import type { MediaOverlay, MediaView } from "../lib/jobMedia";
import { t, type Locale } from "../lib/i18n";

/**
 * Bildeboksen paa et jobbkort (KONTRAKT_VENTEBILDE): resultatbildet, ellers
 * dagsbildet dempet med status oppå, ellers en rolig plassholder. Brukes i
 * Historikk og Express, og senere under «Pågår» paa /start.
 *
 * Fast boks (3:2, eller kvadrat i Express), saa kortet ikke hopper naar
 * bildet kommer. Tekst oppå bildet bare mens jobben lages og ved
 * peisspoersmaalet; ellers staar statusen i merket ved tittelen. Dagsbildet
 * faar aldri AI-merkelappen. Symbolet snurrer
 * rolig bare med CSS, og staar stille ved redusert bevegelse; statusen staar
 * alltid som tekst.
 */
export function JobMedia({
  view,
  resultAlt,
  locale,
  aspect = "wide",
  frame = "",
}: {
  view: MediaView;
  /** Alt-tekst for resultatbildet. */
  resultAlt: string;
  locale: Locale;
  aspect?: "wide" | "square";
  /** Ekstra klasser paa boksen (ramme og hjoerner). */
  frame?: string;
}) {
  const box = `relative w-full overflow-hidden bg-surface-2 ${aspect === "square" ? "aspect-square" : "aspect-[3/2]"}${
    frame ? ` ${frame}` : ""
  }`;

  if (view.kind === "result") {
    return (
      <div className={box}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={view.url} alt={resultAlt} loading="lazy" className="h-full w-full object-cover" />
      </div>
    );
  }

  return (
    <div className={box}>
      {view.kind === "original" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={view.url}
          alt={t(locale, "media.originalAlt")}
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover opacity-40"
        />
      )}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4">
        {view.kind === "placeholder" && !view.overlay?.working && (
          <ImageIcon aria-hidden="true" className="h-8 w-8 text-ink-2" />
        )}
        {view.overlay !== null && <StatusChip overlay={view.overlay} locale={locale} />}
      </div>
    </div>
  );
}

/** Statusteksten i en tett brikke, saa kontrasten holder uansett bilde. */
function StatusChip({ overlay, locale }: { overlay: MediaOverlay; locale: Locale }) {
  return (
    <span className="inline-flex max-w-full items-center gap-2 rounded-pill bg-surface px-3 py-1.5 text-center text-[13px] font-medium text-ink">
      {overlay.working && (
        <LoaderCircle
          aria-hidden="true"
          className="h-4 w-4 shrink-0 animate-[spin_2s_linear_infinite] motion-reduce:animate-none"
        />
      )}
      <span>{t(locale, overlay.key)}</span>
    </span>
  );
}
