"use client";

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { t, type Locale } from "../../lib/i18n";
import {
  addBox,
  addPin,
  addStroke,
  boxFrom,
  extendStroke,
  imageToPane,
  inPane,
  paneToImage,
  pinNumber,
  redo,
  startStroke,
  strokePath,
  studioKey,
  svgFrame,
  undo,
  type ImagePoint,
  type StudioState,
  type StrokeDraft,
} from "../../lib/studio";
import {
  panBy,
  panKey,
  pinchPoint,
  pinchView,
  VIEW_START,
  viewTransform,
  zoomAt,
  zoomKey,
  ZOOM_STEP,
  type Pinch,
  type Point,
  type View,
} from "../../lib/zoom";
import { FOCUS } from "../godkjenning/classes";

/**
 * Lerretet i korreksjonsstudioet (FE-2, Dag 57): et SVG-lag over
 * resultatbildet der megleren setter naaler, tegner med pensel og drar
 * bokser. Ingen side bruker det ennaa, og det gjoer ingen kall.
 *
 * Tilstanden (`studio`) eies av forelderen, saa verktoeylinja (Angre og
 * Gjoer om som knapper, WCAG 2.5.7) og lista kan lese den. Lerretet
 * holder bare det som tegnes akkurat naa og utsnittet.
 *
 * Pekere (Pointer Events, `touch-none` bare her):
 * - én finger eller mus tegner med verktoeyet;
 * - kommer finger nummer to, forkastes det som tegnes, og bevegelsen blir
 *   zoom og flytting (som i lysboksen, `zoom.ts`);
 * - mus: hjulet zoomer rundt pekeren, og mellomrom og dra flytter.
 *
 * Tastene paa lerretet: Esc avbryter det som tegnes, Ctrl- eller Cmd-Z
 * angrer (med Shift gjoer om), «+», «−» og 0 zoomer, og piltastene flytter
 * utsnittet.
 */

export type StudioTool = "pin" | "brush" | "box";

/** Fargen paa markeringene, fra designet (brett 8). Det finnes ingen blaa token. */
const MARK = "#2F5BD3";
const TAP_PX = 10;

type Gesture =
  | { kind: "pin"; x: number; y: number }
  | { kind: "brush" }
  | { kind: "box"; from: ImagePoint }
  | { kind: "pan"; rect: DOMRect; start: View; x: number; y: number }
  | { kind: "pinch"; rect: DOMRect; start: View; from: Pinch }
  | { kind: "none" };

type Draft = { kind: "stroke"; stroke: StrokeDraft } | { kind: "box"; from: ImagePoint; to: ImagePoint } | null;

export function StudioCanvas({
  src,
  alt,
  tool,
  width,
  studio,
  onChange,
  locale,
}: {
  /** Resultatets forhaandsvisning (aldri originalen eller miniatyren). */
  src: string;
  alt: string;
  tool: StudioTool;
  /** Bredden paa penselen, i broek av kortsiden. */
  width: number;
  studio: StudioState;
  onChange: (next: StudioState) => void;
  locale: Locale;
}) {
  const paneRef = useRef<HTMLDivElement>(null);
  const [aspect, setAspect] = useState(3 / 2);
  const [view, setViewState] = useState<View>(VIEW_START);
  // Det som tegnes, i state for tegningen og i ref for hendelsene (som i lysboksen).
  const [draft, setDraftState] = useState<Draft>(null);
  const draftRef = useRef<Draft>(null);

  const viewRef = useRef<View>(VIEW_START);
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<Gesture | null>(null);
  const space = useRef(false);

  const setDraft = (next: Draft) => {
    draftRef.current = next;
    setDraftState(next);
  };

  const setView = (next: View) => {
    viewRef.current = next;
    setViewState(next);
  };

  /** Punktet i bildet under pekeren, eller null hvis ruta ikke har stoerrelse. */
  const imagePoint = (clientX: number, clientY: number, rect: DOMRect): ImagePoint | null => {
    if (!(rect.width > 0 && rect.height > 0)) return null;
    return paneToImage(viewRef.current, (clientX - rect.left) / rect.width, (clientY - rect.top) / rect.height);
  };

  // Hjulet zoomer rundt pekeren. Lytteren maa vaere aktiv (ikke passiv) for aa stoppe rullingen.
  useEffect(() => {
    const el = paneRef.current;
    if (el === null) return;
    const onWheel = (e: WheelEvent) => {
      const rect = el.getBoundingClientRect();
      if (!(rect.width > 0 && rect.height > 0) || e.deltaY === 0) return;
      e.preventDefault();
      const v = viewRef.current;
      const next = v.scale + (e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP);
      const fx = (e.clientX - rect.left) / rect.width;
      const fy = (e.clientY - rect.top) / rect.height;
      const zoomed = zoomAt(v, next, fx, fy);
      viewRef.current = zoomed;
      setViewState(zoomed);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const cancel = () => {
    gesture.current = pointers.current.size > 0 ? { kind: "none" } : null;
    setDraft(null);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const action = studioKey(e.key, e.ctrlKey || e.metaKey, e.shiftKey);
    if (action === "cancel") {
      if (draftRef.current === null) return;
      e.preventDefault();
      cancel();
      return;
    }
    if (action !== null) {
      e.preventDefault();
      cancel();
      onChange(action === "undo" ? undo(studio) : redo(studio));
      return;
    }
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === " ") {
      e.preventDefault();
      space.current = true;
      return;
    }
    const next = zoomKey(viewRef.current, e.key) ?? panKey(viewRef.current, e.key);
    if (next === null) return;
    e.preventDefault();
    setView(next);
  };

  const onKeyUp = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === " ") space.current = false;
  };

  const pinchNow = (rect: DOMRect): Pinch => {
    const [a, b] = [...pointers.current.values()];
    return pinchPoint(a, b, rect);
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.focus({ preventScroll: true });
    const rect = e.currentTarget.getBoundingClientRect();
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      // Finger nummer to: det som tegnes, forkastes, og bevegelsen blir zoom og flytting.
      setDraft(null);
      gesture.current = { kind: "pinch", rect, start: viewRef.current, from: pinchNow(rect) };
      return;
    }
    if (pointers.current.size > 2) return;
    if (space.current) {
      gesture.current = { kind: "pan", rect, start: viewRef.current, x: e.clientX, y: e.clientY };
      return;
    }
    const at = imagePoint(e.clientX, e.clientY, rect);
    if (at === null) {
      gesture.current = { kind: "none" };
      return;
    }
    if (tool === "pin") {
      gesture.current = { kind: "pin", x: e.clientX, y: e.clientY };
    } else if (tool === "brush") {
      gesture.current = { kind: "brush" };
      setDraft({ kind: "stroke", stroke: startStroke(at, width) });
    } else {
      gesture.current = { kind: "box", from: at };
      setDraft({ kind: "box", from: at, to: at });
    }
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (g === null) return;
    if (g.kind === "pinch") {
      if (pointers.current.size >= 2) setView(pinchView(g.start, g.from, pinchNow(g.rect)));
      return;
    }
    if (g.kind === "pan") {
      setView(panBy(g.start, (e.clientX - g.x) / g.rect.width, (e.clientY - g.y) / g.rect.height));
      return;
    }
    if (g.kind !== "brush" && g.kind !== "box") return;
    const at = imagePoint(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect());
    if (at === null) return;
    const d = draftRef.current;
    if (d?.kind === "stroke") {
      const next = extendStroke(d.stroke, at);
      if (next !== d.stroke) setDraft({ kind: "stroke", stroke: next });
    } else if (d?.kind === "box") {
      setDraft({ ...d, to: at });
    }
  };

  const onPointerEnd = (e: PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.delete(e.pointerId)) return;
    const g = gesture.current;
    if (g?.kind === "pinch") {
      if (pointers.current.size === 1) {
        // Én finger loftet: fortsett med aa flytte med den andre, men tegn ikke.
        const [rest] = pointers.current.values();
        gesture.current = { kind: "pan", rect: g.rect, start: viewRef.current, x: rest.x, y: rest.y };
      } else if (pointers.current.size === 0) {
        gesture.current = null;
      }
      return;
    }
    if (pointers.current.size > 0) return;
    gesture.current = null;
    const finished = e.type === "pointerup";
    if (g?.kind === "pin") {
      if (finished && Math.hypot(e.clientX - g.x, e.clientY - g.y) < TAP_PX) {
        const at = imagePoint(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect());
        if (at !== null) onChange(addPin(studio, at));
      }
      return;
    }
    const d = draftRef.current;
    if (finished && d?.kind === "stroke") onChange(addStroke(studio, d.stroke));
    if (finished && d?.kind === "box") onChange(addBox(studio, d.from, d.to));
    setDraft(null);
  };

  const frame = svgFrame(aspect);
  const box = (from: ImagePoint, to: ImagePoint, key: string | number) => {
    const b = boxFrom(from, to);
    return (
      <rect
        key={key}
        x={b.from.x * frame.width}
        y={b.from.y * frame.height}
        width={(b.to.x - b.from.x) * frame.width}
        height={(b.to.y - b.from.y) * frame.height}
        fill={MARK}
        fillOpacity={0.26}
        stroke={MARK}
        strokeWidth={2}
        strokeDasharray="6 4"
        vectorEffect="non-scaling-stroke"
      />
    );
  };
  const stroke = (s: StrokeDraft, key: string | number) => (
    <path
      key={key}
      d={strokePath(s.points, frame)}
      fill="none"
      stroke={MARK}
      strokeOpacity={0.45}
      strokeWidth={s.width}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );

  const pins = studio.marks.flatMap((m) => {
    if (m.kind !== "pin") return [];
    const at = imageToPane(view, m.at);
    return inPane(at) ? [{ id: m.id, n: pinNumber(studio.marks, m.id), at }] : [];
  });

  return (
    <div
      ref={paneRef}
      role="application"
      aria-label={t(locale, "studio.canvas")}
      tabIndex={0}
      className={`relative w-full overflow-hidden rounded-button bg-surface-2 touch-none select-none ${FOCUS}`}
      style={{ aspectRatio: aspect }}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onBlur={() => {
        space.current = false;
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
    >
      <div className="absolute inset-0 origin-top-left" style={{ transform: viewTransform(view) }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- forhaandsvisningen fra backend, som ellers paa siden */}
        <img
          src={src}
          alt={alt}
          draggable={false}
          className="absolute inset-0 h-full w-full object-cover"
          onLoad={(e) => {
            const img = e.currentTarget;
            if (img.naturalWidth > 0 && img.naturalHeight > 0) setAspect(img.naturalWidth / img.naturalHeight);
          }}
        />
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full"
          viewBox={`0 0 ${frame.width} ${frame.height}`}
          preserveAspectRatio="none"
        >
          {studio.marks.map((m) =>
            m.kind === "stroke" ? stroke(m, m.id) : m.kind === "box" ? box(m.from, m.to, m.id) : null
          )}
          {draft?.kind === "stroke" ? stroke(draft.stroke, "draft") : null}
          {draft?.kind === "box" ? box(draft.from, draft.to, "draft") : null}
        </svg>
      </div>
      {pins.map((p) => (
        <span
          key={p.id}
          aria-hidden="true"
          className="pointer-events-none absolute -ml-[17px] -mt-[17px] flex h-[34px] w-[34px] items-center justify-center rounded-pill border-[3px] border-surface bg-ink text-sm font-semibold text-surface shadow-md"
          style={{ left: `${p.at.x * 100}%`, top: `${p.at.y * 100}%` }}
        >
          {p.n}
        </span>
      ))}
    </div>
  );
}
