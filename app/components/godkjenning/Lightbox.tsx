"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { ChevronsLeftRight, Minus, Plus, RotateCcw, X } from "lucide-react";
import { t, type Locale } from "../../lib/i18n";
import { SLIDER_START, sliderKey, valueFromPointer } from "../../lib/slider";
import {
  centerAt,
  fitBox,
  imageSplit,
  isDoubleTap,
  mapFrame,
  panBy,
  panKey,
  pinchPoint,
  pinchView,
  sideLayout,
  VIEW_START,
  viewTransform,
  ZOOM_MAX,
  ZOOM_MIN,
  zoomKey,
  zoomStep,
  type Pinch,
  type Point,
  type Tap,
  type View,
} from "../../lib/zoom";
import { choiceClass, FOCUS } from "./classes";

/**
 * Lysboksen (D-5b1 PC, D-5b2 mobil): mørk fullskjerm med Slider · Side ved
 * side · Kun resultat, zoom 100–200 % (Petter 25.10, §5 b), et kart som
 * flytter utsnittet, og rundene (`rounds`, siden lager velgeren). Velges en
 * runde uten merket forhaandsvisning, vises plassholderen (Lekkasjen L2).
 *
 * En innebygd <dialog> med showModal(): Esc, fokusfelle og øverste lag uten
 * egen kode. Ikke Fullscreen-API-et (iPhone Safari har det ikke for
 * elementer); dialogen fyller skjermen.
 *
 * Tastene lyttes paa dialogen: «+» og «−» zoomer, 0 tilbakestiller,
 * piltastene flytter skillet (sliderKey; uten skillet flytter de utsnittet),
 * og Esc lukker. I kartet flytter piltastene utsnittet.
 *
 * Mobil: dra i skillet, to fingre zoomer og flytter, dobbelttrykk
 * tilbakestiller. Pointer Events og touch-action: none i visningen.
 * Bevegelsen settes rett paa elementene via ref i requestAnimationFrame,
 * ikke via React-state for hver bevegelse; tallene (prosent og skillet for
 * skjermlesere) oppdateres naar bevegelsen slutter.
 */

type Mode = "slider" | "side" | "result";

const MODES: { mode: Mode; key: "compare.mode.slider" | "compare.mode.side" | "compare.mode.result" }[] = [
  { mode: "slider", key: "compare.mode.slider" },
  { mode: "side", key: "compare.mode.side" },
  { mode: "result", key: "compare.mode.result" },
];

const GAP = 16;
const MAP_WIDTH = 160;
const IMG = "absolute inset-0 h-full w-full object-cover";
const CHIP =
  "pointer-events-none absolute top-3 rounded-pill bg-surface px-2.5 py-1 text-[13px] font-medium text-ink";
const ICON_BUTTON = `inline-flex h-11 w-11 items-center justify-center rounded-pill text-ink hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40 ${FOCUS}`;

type Gesture =
  | { kind: "divider"; rect: DOMRect }
  | { kind: "pan"; rect: DOMRect; start: View; x: number; y: number }
  | { kind: "pinch"; rect: DOMRect; start: View; from: Pinch };

export function Lightbox({
  originalUrl,
  aiUrl,
  aiAlt,
  placeholder,
  rounds,
  onClose,
  locale,
}: {
  originalUrl: string;
  /** null: runden har ingen merket forhaandsvisning, og plassholderen vises. */
  aiUrl: string | null;
  aiAlt: string;
  placeholder: ReactNode;
  /** Rundene (VariantPicker), eller null naar det bare finnes én. */
  rounds: ReactNode;
  onClose: () => void;
  locale: Locale;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const contentRefs = useRef<(HTMLDivElement | null)[]>([]);
  const clipRef = useRef<HTMLDivElement>(null);
  const dividerRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);

  const [mode, setMode] = useState<Mode>("slider");
  const [stage, setStage] = useState({ width: 0, height: 0 });
  const [aspect, setAspect] = useState(3 / 2);
  // Tallene som vises og leses opp. Bevegelsen selv ligger i view og split.
  const [scale, setScale] = useState(ZOOM_MIN);
  const [splitValue, setSplitValue] = useState(SLIDER_START);

  const view = useRef<View>(VIEW_START);
  const split = useRef(SLIDER_START);
  const frame = useRef(0);
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<Gesture | null>(null);
  const lastTap = useRef<Tap | null>(null);
  const tapStart = useRef<Point | null>(null);

  useEffect(() => {
    onCloseRef.current = onClose;
  });

  // Tegner utsnittet, skillet og rammen i kartet direkte paa elementene.
  const paint = useCallback(() => {
    frame.current = 0;
    const v = view.current;
    const transform = viewTransform(v);
    for (const el of contentRefs.current) if (el) el.style.transform = transform;
    if (clipRef.current) clipRef.current.style.clipPath = `inset(0 ${100 - imageSplit(v, split.current)}% 0 0)`;
    for (const el of [dividerRef.current, handleRef.current]) if (el) el.style.left = `${split.current}%`;
    const f = mapFrame(v);
    if (frameRef.current) {
      frameRef.current.style.left = `${f.left}%`;
      frameRef.current.style.top = `${f.top}%`;
      frameRef.current.style.width = `${f.width}%`;
      frameRef.current.style.height = `${f.height}%`;
    }
  }, []);

  const schedule = useCallback(() => {
    if (frame.current === 0) frame.current = requestAnimationFrame(paint);
  }, [paint]);

  // Etter hver render (ny visning, ny runde, ny stoerrelse) staar elementene paa nytt.
  useLayoutEffect(() => {
    paint();
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
      cancelAnimationFrame(frame.current);
      frame.current = 0;
    };
  }, []);

  useEffect(() => {
    const el = stageRef.current;
    if (el === null) return;
    const observer = new ResizeObserver(([entry]) => {
      setStage({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  /** Nytt utsnitt. `commit`: ogsaa tallene (ikke under dra og to fingre). */
  const setView = (next: View, commit = true) => {
    view.current = next;
    schedule();
    if (commit) setScale(next.scale);
  };

  const setSplit = (next: number, commit = true) => {
    split.current = next;
    schedule();
    if (commit) setSplitValue(next);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDialogElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const zoomed = zoomKey(view.current, e.key);
    if (zoomed !== null) {
      e.preventDefault();
      setView(zoomed);
      return;
    }
    if (mode === "slider") {
      const next = sliderKey(split.current, e.key, e.shiftKey);
      if (next === null) return;
      e.preventDefault();
      setSplit(next);
      return;
    }
    const panned = panKey(view.current, e.key);
    if (panned === null) return;
    e.preventDefault();
    setView(panned);
  };

  const pinchNow = (rect: DOMRect): Pinch => {
    const [a, b] = [...pointers.current.values()];
    return pinchPoint(a, b, rect);
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = e.currentTarget.getBoundingClientRect();
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      // To fingre: ikke et trykk.
      tapStart.current = null;
      gesture.current = { kind: "pinch", rect, start: view.current, from: pinchNow(rect) };
      return;
    }
    if (pointers.current.size > 2) return;
    tapStart.current = { x: e.clientX, y: e.clientY };
    const onHandle = handleRef.current?.contains(e.target as Node) ?? false;
    // Skillet: haandtaket, eller hvor som helst uten zoom (som slideren paa siden).
    if (mode === "slider" && (onHandle || view.current.scale <= ZOOM_MIN)) {
      gesture.current = { kind: "divider", rect };
      setSplit(valueFromPointer(e.clientX, rect.left, rect.width), false);
      handleRef.current?.focus({ preventScroll: true });
    } else {
      gesture.current = { kind: "pan", rect, start: view.current, x: e.clientX, y: e.clientY };
    }
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (g === null) return;
    if (g.kind === "divider") {
      setSplit(valueFromPointer(e.clientX, g.rect.left, g.rect.width), false);
    } else if (g.kind === "pan") {
      setView(panBy(g.start, (e.clientX - g.x) / g.rect.width, (e.clientY - g.y) / g.rect.height), false);
    } else if (pointers.current.size >= 2) {
      setView(pinchView(g.start, g.from, pinchNow(g.rect)), false);
    }
  };

  const onPointerEnd = (e: PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.delete(e.pointerId)) return;
    const g = gesture.current;
    if (pointers.current.size === 1 && g?.kind === "pinch") {
      // Én finger loftet: fortsett med aa flytte med den andre.
      const [rest] = pointers.current.values();
      gesture.current = { kind: "pan", rect: g.rect, start: view.current, x: rest.x, y: rest.y };
      return;
    }
    if (pointers.current.size > 0) return;
    gesture.current = null;
    const start = tapStart.current;
    tapStart.current = null;
    const tapped = e.type === "pointerup" && start !== null && Math.hypot(e.clientX - start.x, e.clientY - start.y) < 10;
    if (tapped) {
      const tap = { t: e.timeStamp, x: e.clientX, y: e.clientY };
      if (isDoubleTap(lastTap.current, tap)) {
        lastTap.current = null;
        view.current = VIEW_START;
      } else {
        lastTap.current = tap;
      }
    }
    setView(view.current);
    setSplit(split.current);
  };

  /** Kartet: trykk eller dra flytter utsnittet dit. */
  const mapMove = (e: PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (!(rect.width > 0 && rect.height > 0)) return;
    setView(centerAt(view.current, (e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height), false);
  };

  const onMapKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const panned = panKey(view.current, e.key);
    if (panned === null) return;
    e.preventDefault();
    e.stopPropagation();
    setView(panned);
  };

  const close = () => dialogRef.current?.close();
  const zoomTo = (next: View) => setView(next);

  const side = mode === "side" ? sideLayout(stage.width, stage.height, aspect, GAP) : null;
  const box = side?.box ?? fitBox(stage.width, stage.height, aspect);
  const ready = aiUrl !== null;
  const zoomed = ready && scale > ZOOM_MIN;
  const onAiLoad = (img: HTMLImageElement) => {
    if (img.naturalWidth > 0 && img.naturalHeight > 0) setAspect(img.naturalWidth / img.naturalHeight);
  };

  /** Én rute med det zoomede innholdet; merkelapper og skillet ligger over og zoomes ikke. */
  const pane = (index: number, content: ReactNode, over: ReactNode) => (
    <div
      className="relative shrink-0 overflow-hidden rounded-button bg-surface-2 touch-none select-none"
      style={{ width: box.width, height: box.height }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
    >
      <div
        ref={(el) => {
          contentRefs.current[index] = el;
        }}
        className="absolute inset-0 origin-top-left"
      >
        {content}
      </div>
      {over}
    </div>
  );

  const aiImg = (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={aiUrl ?? undefined} alt={aiAlt} draggable={false} className={IMG} onLoad={(e) => onAiLoad(e.currentTarget)} />
  );
  const originalImg = (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={originalUrl} alt={t(locale, "compare.altOriginal")} draggable={false} className={IMG} />
  );

  return (
    <dialog
      ref={dialogRef}
      aria-label={t(locale, "lightbox.title")}
      onKeyDown={onKeyDown}
      className="fixed inset-0 m-0 h-dvh max-h-none w-dvw max-w-none overflow-hidden overscroll-contain bg-darkroom p-0 text-paper backdrop:bg-darkroom"
    >
      <div className="flex h-full flex-col gap-3 p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1 rounded-pill bg-surface p-1" role="group" aria-label={t(locale, "compare.mode")}>
            {MODES.map(({ mode: m, key }) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                aria-pressed={mode === m}
                className={choiceClass(mode === m, "rounded-pill")}
              >
                {t(locale, key)}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 rounded-pill bg-surface p-1">
            <button
              type="button"
              onClick={() => zoomTo(zoomStep(view.current, -1))}
              disabled={!zoomed}
              aria-label={t(locale, "lightbox.zoomOut")}
              className={ICON_BUTTON}
            >
              <Minus aria-hidden="true" className="h-5 w-5" />
            </button>
            <span className="min-w-14 text-center text-sm font-medium text-ink" aria-live="polite">
              {t(locale, "lightbox.zoomValue", { n: Math.round(scale * 100) })}
            </span>
            <button
              type="button"
              onClick={() => zoomTo(zoomStep(view.current, 1))}
              disabled={!ready || scale >= ZOOM_MAX}
              aria-label={t(locale, "lightbox.zoomIn")}
              className={ICON_BUTTON}
            >
              <Plus aria-hidden="true" className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => zoomTo(VIEW_START)}
              disabled={!zoomed}
              aria-label={t(locale, "lightbox.zoomReset")}
              className={ICON_BUTTON}
            >
              <RotateCcw aria-hidden="true" className="h-5 w-5" />
            </button>
          </div>
          <p className="hidden text-sm text-paper pointer-fine:block">{t(locale, "lightbox.keys")}</p>
          <p className="hidden text-sm text-paper pointer-coarse:block">{t(locale, "lightbox.touch")}</p>
          <button
            type="button"
            onClick={close}
            aria-label={t(locale, "lightbox.close")}
            className={`${ICON_BUTTON} ml-auto bg-surface`}
          >
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>

        <div ref={stageRef} className="relative min-h-0 flex-1">
          <div
            className={`absolute inset-0 flex items-center justify-center ${side !== null && !side.row ? "flex-col" : ""}`}
            style={{ gap: GAP }}
          >
            {!ready && <div className="w-full max-w-xl">{placeholder}</div>}
            {ready &&
              mode === "slider" &&
              pane(
                0,
                <>
                  {aiImg}
                  <div ref={clipRef} className="absolute inset-0">
                    {originalImg}
                  </div>
                </>,
                <>
                  <span className={`${CHIP} left-3`}>{t(locale, "review.original")}</span>
                  <span className={`${CHIP} right-3`}>{t(locale, "compare.ai")}</span>
                  <div
                    ref={dividerRef}
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-surface"
                  />
                  <div
                    ref={handleRef}
                    role="slider"
                    tabIndex={0}
                    aria-label={t(locale, "compare.sliderLabel")}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={splitValue}
                    aria-valuetext={t(locale, "compare.sliderValue", { n: splitValue })}
                    className={`absolute top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize items-center justify-center rounded-full border border-line-strong bg-surface text-ink ${FOCUS}`}
                  >
                    <ChevronsLeftRight aria-hidden="true" className="h-5 w-5" />
                  </div>
                </>
              )}
            {ready && mode === "side" && (
              <>
                {pane(0, originalImg, <span className={`${CHIP} left-3`}>{t(locale, "review.original")}</span>)}
                {pane(1, aiImg, <span className={`${CHIP} left-3`}>{t(locale, "review.result")}</span>)}
              </>
            )}
            {ready && mode === "result" && pane(0, aiImg, <span className={`${CHIP} right-3`}>{t(locale, "compare.ai")}</span>)}
          </div>

          {zoomed && (
            <div
              tabIndex={0}
              role="group"
              aria-label={t(locale, "lightbox.map")}
              onKeyDown={onMapKeyDown}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                mapMove(e);
              }}
              onPointerMove={(e) => {
                if (e.currentTarget.hasPointerCapture(e.pointerId)) mapMove(e);
              }}
              onPointerUp={() => setView(view.current)}
              onPointerCancel={() => setView(view.current)}
              className={`absolute bottom-3 right-3 overflow-hidden rounded-button border border-line-strong bg-surface-2 touch-none select-none ${FOCUS}`}
              style={{ width: MAP_WIDTH, height: Math.round(MAP_WIDTH / aspect) }}
            >
              <div aria-hidden="true" className="pointer-events-none absolute inset-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={aiUrl ?? undefined} alt={t(locale, "review.result")} draggable={false} className={IMG} />
                <div ref={frameRef} className="absolute border-2 border-surface" />
              </div>
            </div>
          )}
        </div>

        {rounds !== null && <div className="max-h-[30dvh] overflow-y-auto rounded-card bg-surface p-3 text-ink">{rounds}</div>}
      </div>
    </dialog>
  );
}
