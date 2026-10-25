"use client";

import { useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";
import { boardText, type MoodboardStyle } from "../../lib/moodboards";
import { t, type Locale } from "../../lib/i18n";
import { DecorDots } from "./DecorDots";
import { SvgArt, SvgDefs } from "./SvgArt";
import { FOCUS } from "./classes";

/**
 * Hele moodboardet i utvidet format (D-3 kompakt, Petter 15.54): en <dialog>
 * med showModal(), som lysboksen (Esc lukker, fokusfelle, oeverste lag).
 * Nesten fullskjerm. Paa PC staar moodboardet paa et lerret paa 1200 × 860
 * som i moodboard-filene, skalert saa det fyller vinduet. Blir skalaen under
 * 0,6 (mobil, smalt vindu), stables delene i stedet og dialogen ruller, saa
 * teksten ikke blir uleselig liten.
 *
 * Alle delene: kategori, navn, setning, «Tenk på», anbefalt pynt, seks fliser
 * (den foerste stor), seks moebelkort, paletten, «Passer for» og «Unngå».
 * Tegningene er pynt (aria-hidden); navnene og tekstene er det som leses.
 * Ingen «Cowork anbefaler» eller «Reserve» (interne merker i kildene).
 */

const CANVAS_W = 1200;
const CANVAS_H = 860;
/** Under denne skalaen stables moodboardet (RAPPORT_D3, kompakt). */
const MIN_SCALE = 0.6;

export function MoodboardDialog({
  board,
  name,
  onClose,
  locale,
}: {
  board: MoodboardStyle;
  /** Navnet fra ordlista (stilnavn_v3). */
  name: string;
  onClose: () => void;
  locale: Locale;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  // 0 til flaten er maalt: da vises ingenting, saa oppsettet ikke blinker.
  const [scale, setScale] = useState(0);

  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    dialog.showModal();
    const close = () => onCloseRef.current();
    dialog.addEventListener("close", close);
    return () => {
      dialog.removeEventListener("close", close);
      if (dialog.open) dialog.close();
    };
  }, []);

  useEffect(() => {
    const el = stageRef.current;
    if (el === null) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setScale(Math.min(width / CANVAS_W, height / CANVAS_H));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const measured = scale !== 0;
  const wide = scale >= MIN_SCALE;

  return (
    <dialog
      ref={dialogRef}
      aria-label={t(locale, "styling.moodboardLabel", { style: name })}
      className="m-auto h-[96dvh] max-h-none w-[96vw] max-w-none overflow-hidden overscroll-contain rounded-card bg-paper p-0 text-ink backdrop:bg-ink/60"
    >
      <div className="flex h-full flex-col">
        <div className="flex shrink-0 justify-end p-2">
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            aria-label={t(locale, "lightbox.close")}
            className={`inline-flex size-11 items-center justify-center rounded-pill bg-surface text-ink hover:bg-surface-2 ${FOCUS}`}
          >
            <X aria-hidden className="size-5" />
          </button>
        </div>
        <div
          ref={stageRef}
          className={`min-h-0 flex-1 px-3 pb-3 sm:px-4 sm:pb-4 ${wide ? "overflow-hidden" : "overflow-y-auto"}`}
        >
          {measured &&
            (wide ? (
              <div className="mx-auto" style={{ width: CANVAS_W * scale, height: CANVAS_H * scale }}>
                <div style={{ width: CANVAS_W, height: CANVAS_H, transform: `scale(${scale})`, transformOrigin: "top left" }}>
                  <MoodboardSheet board={board} name={name} wide locale={locale} />
                </div>
              </div>
            ) : (
              <MoodboardSheet board={board} name={name} wide={false} locale={locale} />
            ))}
        </div>
      </div>
    </dialog>
  );
}

/** Klassene for lerretet (1200 × 860, som moodboard-filene) og for stablet visning. */
const LAYOUT = {
  wide: {
    sheet: "flex h-full flex-col gap-[22px] px-11 py-10",
    head: "flex items-start justify-between gap-8",
    title: "font-display text-[58px] font-normal leading-none",
    meta: "flex shrink-0 flex-col items-end gap-2.5 text-sm",
    middle: "flex h-[470px] gap-6",
    tiles: "grid w-[540px] shrink-0 grid-cols-3 grid-rows-3 gap-2",
    tileSmall: "",
    furniture: "flex min-w-0 flex-1 flex-col gap-2.5",
    bigSvg: "h-24 w-full",
    smallSvg: "h-auto w-[84px] shrink-0",
    caption: "text-[13px] leading-snug",
    bottom: "flex items-start gap-7",
    palette: "grid shrink-0 grid-cols-[repeat(6,86px)] gap-2",
    swatch: "h-[46px]",
    texts: "flex min-w-0 flex-col gap-2.5 text-sm leading-relaxed",
  },
  narrow: {
    sheet: "flex flex-col gap-4",
    head: "flex flex-col gap-3",
    title: "font-display text-[34px] font-normal leading-none",
    meta: "flex flex-col gap-1.5 text-sm",
    middle: "flex flex-col gap-3",
    tiles: "grid grid-cols-3 gap-2",
    tileSmall: "aspect-[3/2]",
    furniture: "flex flex-col gap-2",
    bigSvg: "h-16 w-full",
    smallSvg: "h-auto w-14 shrink-0",
    caption: "text-xs leading-snug",
    bottom: "flex flex-col gap-4",
    palette: "grid grid-cols-3 gap-2",
    swatch: "h-9",
    texts: "flex flex-col gap-2 text-sm leading-relaxed",
  },
} as const;

export function MoodboardSheet({
  board,
  name,
  wide,
  locale,
}: {
  board: MoodboardStyle;
  name: string;
  wide: boolean;
  locale: Locale;
}) {
  const c = wide ? LAYOUT.wide : LAYOUT.narrow;
  // Prefikset gjoer moenster-id-ene unike paa siden (SvgArt).
  const prefix = `mb${useId().replace(/[^A-Za-z0-9_-]/g, "")}`;
  const big = board.mobler.slice(0, 4);
  const small = board.mobler.slice(4);
  return (
    <div className={`relative text-ink ${c.sheet}`}>
      <SvgDefs defs={board.defs} prefix={prefix} />

      <div className={c.head}>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink-2">
            {board.nr} · {boardText(board.kategori)}
          </span>
          <h2 className={c.title}>{name}</h2>
          <p className="text-base text-ink">{boardText(board.setning)}</p>
        </div>
        <div className={c.meta}>
          <p>
            <span className="text-ink-2">{t(locale, "styling.thinkOf")}</span> {boardText(board.tenkPaa)}
          </p>
          <p className="flex items-center gap-2">
            <span className="text-ink-2">{t(locale, "styling.decorDots")}</span>
            <DecorDots filled={board.pynt} of={5} label={t(locale, "styling.decorDotsValue", { n: board.pynt })} />
          </p>
        </div>
      </div>

      <div className={c.middle}>
        <ul aria-label={t(locale, "styling.materials")} className={c.tiles}>
          {board.materialer.map((tile, i) => (
            <li
              key={i}
              className={`relative min-h-0 overflow-hidden rounded-xl ${i === 0 ? "col-span-2 row-span-2" : c.tileSmall}`}
            >
              <SvgArt node={tile.svg} prefix={prefix} className="absolute inset-0 size-full" />
              <span className="absolute bottom-2.5 left-2.5 max-w-[calc(100%-1.25rem)] rounded-pill bg-surface/90 px-2.5 py-1 text-xs font-medium leading-tight">
                {boardText(tile.navn)}
              </span>
            </li>
          ))}
        </ul>
        <div role="list" aria-label={t(locale, "styling.furniture")} className={c.furniture}>
          <div className="grid grid-cols-2 gap-2.5">
            {big.map((item, i) => (
              <figure
                key={i}
                role="listitem"
                className="m-0 flex flex-col gap-1.5 rounded-xl border border-line bg-surface px-3.5 py-3"
              >
                <SvgArt node={item.svg} prefix={prefix} className={c.bigSvg} />
                <figcaption className={c.caption}>
                  <b className="font-semibold">{boardText(item.etikett)}:</b> {boardText(item.tekst)}
                </figcaption>
              </figure>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            {small.map((item, i) => (
              <figure
                key={i}
                role="listitem"
                className="m-0 flex items-center gap-3 rounded-xl border border-line bg-surface px-3.5 py-3"
              >
                <SvgArt node={item.svg} prefix={prefix} className={c.smallSvg} />
                <figcaption className={c.caption}>
                  <b className="font-semibold">{boardText(item.etikett)}:</b> {boardText(item.tekst)}
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </div>

      <div className={c.bottom}>
        <ul aria-label={t(locale, "styling.palette")} className={c.palette}>
          {board.palett.map((swatch) => (
            <li key={swatch.hex + swatch.navn} className="flex min-w-0 flex-col gap-1">
              <span
                aria-hidden="true"
                className={`rounded-lg border border-line ${c.swatch}`}
                style={{ backgroundColor: swatch.hex }}
              />
              <span className="text-xs font-medium leading-tight">{boardText(swatch.navn)}</span>
              <span className="text-xs tabular-nums text-ink-2">{swatch.hex}</span>
            </li>
          ))}
        </ul>
        <div className={c.texts}>
          <p>
            <b className="font-semibold">{t(locale, "styling.fits")}:</b> {boardText(board.passerFor)}
          </p>
          <p>
            <b className="font-semibold">{t(locale, "styling.avoid")}:</b> {boardText(board.unnga)}
          </p>
        </div>
      </div>
    </div>
  );
}
