"use client";

import { useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { ChevronsLeftRight, Eye, Maximize2 } from "lucide-react";
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
 *
 * «Vis mulige tillegg» (TG-NEW-199 PR 4) virker paa samme maate med
 * `additionsView` (resultatbildet med boksene fra kontrollen). De to
 * visningene utelukker hverandre.
 *
 * «Hold for original» (D-5a): mens knappen holdes inne (trykk og hold, eller
 * mellomrom paa tastaturet), vises originalen i stedet for AI-bildet i
 * slideren og i «Kun resultat». Slipp, og AI-bildet er tilbake; skillet
 * staar der det sto. «Forstørr» aapner lysboksen (`onExpand`, siden har den).
 * Begge krever begge bildene.
 *
 * Studio v2 (Dag 58): `base` bytter originalen i glideren og «Side ved side»
 * med et annet bilde (forrige versjon, D1), med egen merkelapp. «Hold for
 * original» viser fortsatt originalen. `marks` (boksene fra endringene)
 * tegnes over hele bildet i glideren og over resultatet ellers.
 */

type Mode = "slider" | "side" | "result";
type Overlay = "lights" | "additions" | null;

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

/** Bildet til venstre i glideren og «Side ved side»: originalen, eller `base` (forrige versjon). */
export type CompareBase = { url: string; label: string; alt: string };

function Slider({
  originalUrl,
  base,
  aiUrl,
  resultAlt,
  onResultLoad,
  full,
  marks,
  locale,
}: {
  originalUrl: string;
  base: CompareBase | null;
  aiUrl: string;
  resultAlt: string;
  onResultLoad?: () => void;
  /** «Hold for original»: hele originalen, uten skillet. Verdien beholdes. */
  full: boolean;
  marks: ReactNode;
  locale: Locale;
}) {
  // «Hold for original» viser alltid originalen, ogsaa naar glideren sammenligner med forrige versjon.
  const left =
    base === null || full
      ? { url: originalUrl, label: t(locale, "review.original"), alt: t(locale, "compare.altOriginal") }
      : base;
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
      <div className="absolute inset-0" style={{ clipPath: `inset(0 ${full ? 0 : 100 - value}% 0 0)` }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={left.url}
          alt={left.alt}
          draggable={false}
          className="absolute inset-0 h-full w-full object-cover"
        />
        <span className={`${CHIP} left-3`}>{left.label}</span>
      </div>
      {marks}
      {!full && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-surface"
          style={{ left: `${value}%` }}
        />
      )}
      <div
        ref={handleRef}
        hidden={full}
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

/**
 * «Hold for original»: holdes inne med trykk (pekeren fanges, saa slipp
 * utenfor knappen ogsaa teller) eller med mellomrom. Mister knappen fokus
 * eller pekeren, slippes den.
 */
function HoldButton({ holding, onHold, locale }: { holding: boolean; onHold: (on: boolean) => void; locale: Locale }) {
  return (
    <button
      type="button"
      aria-pressed={holding}
      onPointerDown={(e) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        onHold(true);
      }}
      onPointerUp={() => onHold(false)}
      onPointerCancel={() => onHold(false)}
      onLostPointerCapture={() => onHold(false)}
      onKeyDown={(e) => {
        if (e.key !== " ") return;
        e.preventDefault();
        if (!e.repeat) onHold(true);
      }}
      onKeyUp={(e) => {
        if (e.key !== " ") return;
        e.preventDefault();
        onHold(false);
      }}
      onBlur={() => onHold(false)}
      onContextMenu={(e) => e.preventDefault()}
      className={choiceClass(holding, "rounded-pill inline-flex items-center gap-2 touch-none select-none [-webkit-touch-callout:none]")}
    >
      <Eye aria-hidden="true" className="h-4 w-4" />
      {t(locale, "compare.hold")}
    </button>
  );
}

export function CompareViewer({
  originalUrl,
  result,
  placeholder,
  onResultLoad,
  lightsView = null,
  additionsView = null,
  onExpand,
  base = null,
  marks = null,
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
  /** Resultatbildet med boksene fra kontrollen av tillegg (TG-NEW-199); null skjuler knappen. */
  additionsView?: ReactNode;
  /** Aapner lysboksen (D-5b1); uten den vises ikke «Forstørr». */
  onExpand?: () => void;
  /** Studio v2: forrige versjon i stedet for originalen til venstre; null gir originalen. */
  base?: CompareBase | null;
  /** Studio v2: boksene over bildet (pointer-events-none, 0–1 i resultatets ramme). */
  marks?: ReactNode;
  locale: Locale;
}) {
  const [mode, setMode] = useState<Mode>("slider");
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [holding, setHolding] = useState(false);
  const showLights = overlay === "lights" && lightsView !== null;
  const showAdditions = overlay === "additions" && additionsView !== null;
  const toggle = (o: Exclude<Overlay, null>) => setOverlay(overlay === o ? null : o);

  const lightsButton =
    lightsView === null ? null : (
      <button
        type="button"
        onClick={() => toggle("lights")}
        aria-pressed={showLights}
        className={choiceClass(showLights, "rounded-pill")}
      >
        {t(locale, "markers.show")}
      </button>
    );

  const additionsButton =
    additionsView === null ? null : (
      <button
        type="button"
        onClick={() => toggle("additions")}
        aria-pressed={showAdditions}
        className={choiceClass(showAdditions, "rounded-pill")}
      >
        {t(locale, "additions.show")}
      </button>
    );

  if (result === null) {
    if (lightsButton === null && additionsButton === null) return <OriginalImage url={originalUrl} locale={locale} />;
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2" role="group" aria-label={t(locale, "compare.mode")}>
          {lightsButton}
          {additionsButton}
        </div>
        {showLights ? lightsView : showAdditions ? additionsView : <OriginalImage url={originalUrl} locale={locale} />}
      </div>
    );
  }

  const resultAlt = t(locale, "compare.altResult", { label: result.label });
  // Slideren trenger begge bildene; ellers vises de side ved side.
  const canSlide = originalUrl !== null && result.url !== null;
  const shown: Mode = mode === "slider" && !canSlide ? "side" : mode;
  const plain = !showLights && !showAdditions;
  const holdShown = canSlide && plain && shown !== "side";
  const held = holding && holdShown;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label={t(locale, "compare.mode")}>
        {MODES.map(({ mode: m, key }) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMode(m);
              setOverlay(null);
            }}
            disabled={m === "slider" && !canSlide}
            aria-pressed={!showLights && !showAdditions && shown === m}
            className={choiceClass(
              !showLights && !showAdditions && shown === m,
              "rounded-pill disabled:cursor-not-allowed disabled:opacity-50"
            )}
          >
            {t(locale, key)}
          </button>
        ))}
        {lightsButton}
        {additionsButton}
      </div>

      {showLights && lightsView}
      {showAdditions && additionsView}

      {!showLights && !showAdditions && shown === "slider" && originalUrl !== null && result.url !== null && (
        <Slider
          originalUrl={originalUrl}
          base={base}
          aiUrl={result.url}
          resultAlt={resultAlt}
          onResultLoad={onResultLoad}
          full={held}
          marks={held ? null : marks}
          locale={locale}
        />
      )}

      {!showLights && !showAdditions && shown === "side" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className={`${LABEL} mb-2`}>{base === null ? t(locale, "review.original") : base.label}</p>
            {base === null ? (
              <OriginalImage url={originalUrl} locale={locale} />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={base.url} alt={base.alt} className={FRAME} />
            )}
          </div>
          <div>
            <p className={`${LABEL} mb-2`}>{t(locale, "review.result")}</p>
            <div className="relative">
              <ResultImage url={result.url} alt={resultAlt} placeholder={placeholder} onLoad={onResultLoad} />
              {result.url !== null && marks}
            </div>
          </div>
        </div>
      )}

      {!showLights && !showAdditions && shown === "result" && (
        <div className="relative">
          <ResultImage url={result.url} alt={resultAlt} placeholder={placeholder} onLoad={onResultLoad} />
          {!held && result.url !== null && marks}
          {held && originalUrl !== null && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={originalUrl}
                alt={t(locale, "compare.altOriginal")}
                className="absolute inset-0 h-full w-full rounded-button border border-line object-cover"
              />
              <span className={`${CHIP} left-3`}>{t(locale, "review.original")}</span>
            </>
          )}
        </div>
      )}

      {(holdShown || (canSlide && onExpand !== undefined)) && (
        <div className="flex flex-wrap gap-2">
          {holdShown && <HoldButton holding={held} onHold={setHolding} locale={locale} />}
          {canSlide && onExpand !== undefined && (
            <button type="button" onClick={onExpand} className={choiceClass(false, "rounded-pill inline-flex items-center gap-2")}>
              <Maximize2 aria-hidden="true" className="h-4 w-4" />
              {t(locale, "compare.expand")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
