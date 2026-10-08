"use client";

import { useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { ChevronsLeftRight } from "lucide-react";
import { t, type Locale } from "../../lib/i18n";
import { SLIDER_START, sliderKey, valueFromPointer } from "../../lib/slider";
import { choiceClass, FOCUS, LABEL } from "./classes";

/**
 * Originalen mot AI-bildet (D2a, brief §4): Slider · Side ved side · Kun
 * resultat. AI-ikonet staar nede til venstre i bildet og dekkes av
 * originalen i slideren, saa resultatsiden har en egen «AI»-merkelapp
 * (brief §3 punkt 4). Merkelappen ligger under originalen og dekkes av den.
 *
 * Slideren (WCAG 2.5.7): kan dras, men ogsaa styres med tastaturet og med
 * klikk eller trykk paa sporet. Paa mobil ruller siden fortsatt loddrett
 * (touch-action: pan-y).
 *
 * «Vis lampene i bildet» (TG-NEW-166, valg 1 B og 2 A): knappen staar sammen
 * med visningsknappene og viser `lightsView` (originalen med markoerer) i
 * stedet for glideren. Siden lager visningen; denne fila importerer den ikke,
 * saa markoerene aldri tegnes paa glideren.
 */

type Mode = "slider" | "side" | "result";

const MODES: { mode: Mode; key: "compare.mode.slider" | "compare.mode.side" | "compare.mode.result" }[] = [
  { mode: "slider", key: "compare.mode.slider" },
  { mode: "side", key: "compare.mode.side" },
  { mode: "result", key: "compare.mode.result" },
];

const FRAME = "block w-full h-auto rounded-button border border-line";
const CHIP =
  "pointer-events-none absolute top-3 rounded-pill bg-surface px-2.5 py-1 text-[13px] font-medium text-ink";

function OriginalImage({ url, locale }: { url: string | null; locale: Locale }) {
  if (url === null) {
    return (
      <div className="aspect-[3/2] w-full rounded-button border border-dashed border-line-strong bg-surface-2 flex items-center justify-center text-ink-2 text-sm">
        {t(locale, "review.noImage")}
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={t(locale, "compare.altOriginal")} className={FRAME} />;
}

function ResultImage({
  url,
  alt,
  placeholder,
  onLoad,
}: {
  url: string | null;
  alt: string;
  placeholder: ReactNode;
  onLoad?: () => void;
}) {
  if (url === null) return <>{placeholder}</>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={alt} className={FRAME} onLoad={onLoad} />;
}

function Slider({
  originalUrl,
  aiUrl,
  resultAlt,
  onResultLoad,
  locale,
}: {
  originalUrl: string;
  aiUrl: string;
  resultAlt: string;
  onResultLoad?: () => void;
  locale: Locale;
}) {
  const [value, setValue] = useState(SLIDER_START);
  const trackRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const moveTo = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (rect) setValue(valueFromPointer(clientX, rect.left, rect.width));
  };

  // Klikk eller trykk paa sporet flytter skillet dit (ikke bare dra).
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    moveTo(e.clientX);
    handleRef.current?.focus({ preventScroll: true });
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (dragging.current) moveTo(e.clientX);
  };
  const stopDrag = () => {
    dragging.current = false;
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const next = sliderKey(value, e.key, e.shiftKey);
    if (next === null) return;
    e.preventDefault();
    setValue(next);
  };

  return (
    <div
      ref={trackRef}
      className="relative overflow-hidden rounded-button border border-line bg-surface-2 touch-pan-y select-none cursor-ew-resize"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={stopDrag}
      onPointerCancel={stopDrag}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={aiUrl} alt={resultAlt} draggable={false} className="block w-full h-auto" onLoad={onResultLoad} />
      <span className={`${CHIP} right-3`}>{t(locale, "compare.ai")}</span>
      <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - value}% 0 0)` }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={originalUrl}
          alt={t(locale, "compare.altOriginal")}
          draggable={false}
          className="absolute inset-0 h-full w-full object-cover"
        />
        <span className={`${CHIP} left-3`}>{t(locale, "review.original")}</span>
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-surface"
        style={{ left: `${value}%` }}
      />
      <div
        ref={handleRef}
        role="slider"
        tabIndex={0}
        aria-label={t(locale, "compare.sliderLabel")}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
        aria-valuetext={t(locale, "compare.sliderValue", { n: value })}
        onKeyDown={onKeyDown}
        className={`absolute top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-line-strong bg-surface text-ink ${FOCUS}`}
        style={{ left: `${value}%` }}
      >
        <ChevronsLeftRight aria-hidden="true" className="h-5 w-5" />
      </div>
    </div>
  );
}

export function CompareViewer({
  originalUrl,
  result,
  placeholder,
  onResultLoad,
  lightsView = null,
  locale,
}: {
  originalUrl: string | null;
  /** null: ingen runde ennaa (needs_review), bare originalen vises. url null gir plassholder. */
  result: { url: string | null; label: string } | null;
  /** Vises naar den merkede forhaandsvisningen mangler (Lekkasjen L2). */
  placeholder: ReactNode;
  /** Resultatbildet er lastet (TG-NEW-147: da forhaandslastes de andre trinnene). */
  onResultLoad?: () => void;
  /** Originalen med markoerer (TG-NEW-166); null skjuler knappen. */
  lightsView?: ReactNode;
  locale: Locale;
}) {
  const [mode, setMode] = useState<Mode>("slider");
  const [lightsOn, setLightsOn] = useState(false);
  const showLights = lightsOn && lightsView !== null;

  const lightsButton =
    lightsView === null ? null : (
      <button
        type="button"
        onClick={() => setLightsOn(!lightsOn)}
        aria-pressed={showLights}
        className={choiceClass(showLights, "rounded-pill")}
      >
        {t(locale, "markers.show")}
      </button>
    );

  if (result === null) {
    if (lightsButton === null) return <OriginalImage url={originalUrl} locale={locale} />;
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2" role="group" aria-label={t(locale, "compare.mode")}>
          {lightsButton}
        </div>
        {showLights ? lightsView : <OriginalImage url={originalUrl} locale={locale} />}
      </div>
    );
  }

  const resultAlt = t(locale, "compare.altResult", { label: result.label });
  // Slideren trenger begge bildene; ellers vises de side ved side.
  const canSlide = originalUrl !== null && result.url !== null;
  const shown: Mode = mode === "slider" && !canSlide ? "side" : mode;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label={t(locale, "compare.mode")}>
        {MODES.map(({ mode: m, key }) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMode(m);
              setLightsOn(false);
            }}
            disabled={m === "slider" && !canSlide}
            aria-pressed={!showLights && shown === m}
            className={choiceClass(!showLights && shown === m, "rounded-pill disabled:cursor-not-allowed disabled:opacity-50")}
          >
            {t(locale, key)}
          </button>
        ))}
        {lightsButton}
      </div>

      {showLights && lightsView}

      {!showLights && shown === "slider" && originalUrl !== null && result.url !== null && (
        <Slider
          originalUrl={originalUrl}
          aiUrl={result.url}
          resultAlt={resultAlt}
          onResultLoad={onResultLoad}
          locale={locale}
        />
      )}

      {!showLights && shown === "side" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className={`${LABEL} mb-2`}>{t(locale, "review.original")}</p>
            <OriginalImage url={originalUrl} locale={locale} />
          </div>
          <div>
            <p className={`${LABEL} mb-2`}>{t(locale, "review.result")}</p>
            <ResultImage url={result.url} alt={resultAlt} placeholder={placeholder} onLoad={onResultLoad} />
          </div>
        </div>
      )}

      {!showLights && shown === "result" && (
        <ResultImage url={result.url} alt={resultAlt} placeholder={placeholder} onLoad={onResultLoad} />
      )}
    </div>
  );
}
