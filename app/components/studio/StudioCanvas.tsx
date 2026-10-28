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
  BOX_MIN,
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
  MARK,
  type ImagePoint,
  type Mark,
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
 *
 * Studio v2 (Dag 58): med `onBox` bestemmer forelderen om en ny boks legges
 * til (inntil 4, ingen overlapp). `numbered` setter nummeret (1–4) paa hver
 * boks. `activeId` lyser opp én boks, og `onActive` sier hvilken boks musa
 * peker paa (eller fingeren trykker paa), saa lista kan lyse opp samme rad.
 * `onAspect` gir bildets sideforhold (til overlappsjekken).
 */

export type StudioTool = "pin" | "brush" | "box";

const TAP_PX = 10;

/** Den oeverste boksen under punktet (den sist tegnede), eller null. */
function boxAt(marks: readonly Mark[], p: ImagePoint): number | null {
  for (let i = marks.length - 1; i >= 0; i--) {
    const m = marks[i];
    if (m.kind === "box" && p.x >= m.from.x && p.x <= m.to.x && p.y >= m.from.y && p.y <= m.to.y) return m.id;
  }
  return null;
}

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
  onBox,
  numbered = false,
  activeId = null,
  onActive,
  onAspect,
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
  /** Ny boks fra a til b; uten den legges boksen til med addBox. */
  onBox?: (a: ImagePoint, b: ImagePoint) => void;
  /** Nummeret (1, 2, …) paa hver boks, i rekkefoelgen de ble tegnet. */
  numbered?: boolean;
  /** Boksen som lyser opp (fra lista), eller null. */
  activeId?: number | null;
  /** Boksen pekeren er over (mus) eller fingeren trykket paa, eller null. */
  onActive?: (id: number | null) => void;
  /** Bildets sideforhold (bredde / hoeyde) naar bildet er lastet. */
  onAspect?: (aspect: number) => void;
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
    if (!pointers.current.has(e.pointerId)) {
      // Musa over lerretet uten aa tegne: boksen under pekeren lyser opp.
      if (onActive !== undefined && e.pointerType === "mouse" && gesture.current === null) {
        const at = imagePoint(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect());
        const hit = at === null ? null : boxAt(studio.marks, at);
        if (hit !== activeId) onActive(hit);
      }
      return;
    }
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
    if (finished && d?.kind === "box") {
      const b = boxFrom(d.from, d.to);
      if (onActive !== undefined && Math.hypot(b.to.x - b.from.x, b.to.y - b.from.y) < BOX_MIN) {
        // Et trykk uten aa dra: boksen under lyser opp (paa mobil uten mus).
        onActive(boxAt(studio.marks, d.from));
      } else if (onBox !== undefined) {
        onBox(d.from, d.to);
      } else {
        onChange(addBox(studio, d.from, d.to));
      }
    }
    setDraft(null);
  };

  const frame = svgFrame(aspect);
  const box = (from: ImagePoint, to: ImagePoint, key: string | number, active = false) => {
    const b = boxFrom(from, to);
    return (
      <rect
        key={key}
        x={b.from.x * frame.width}
        y={b.from.y * frame.height}
        width={(b.to.x - b.from.x) * frame.width}
        height={(b.to.y - b.from.y) * frame.height}
        fill={MARK}
        fillOpacity={active ? 0.45 : 0.26}
        stroke={MARK}
        strokeWidth={active ? 4 : 2}
        strokeDasharray={active ? undefined : "6 4"}
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

  // Nummeret staar inne i boksens oeverste venstre hjoerne (bare den delen som er i utsnittet).
  const boxLabels = numbered
    ? studio.marks
        .filter((m): m is Extract<Mark, { kind: "box" }> => m.kind === "box")
        .flatMap((m, i) => {
          const at = imageToPane(view, m.from);
          return inPane(at) ? [{ id: m.id, n: i + 1, at }] : [];
        })
    : [];

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
      onPointerLeave={(e) => {
        if (onActive !== undefined && e.pointerType === "mouse" && activeId !== null) onActive(null);
      }}
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
            if (img.naturalWidth > 0 && img.naturalHeight > 0) {
              setAspect(img.naturalWidth / img.naturalHeight);
              onAspect?.(img.naturalWidth / img.naturalHeight);
            }
          }}
        />
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full"
          viewBox={`0 0 ${frame.width} ${frame.height}`}
          preserveAspectRatio="none"
        >
          {studio.marks.map((m) =>
            m.kind === "stroke" ? stroke(m, m.id) : m.kind === "box" ? box(m.from, m.to, m.id, m.id === activeId) : null
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
      {boxLabels.map((b) => (
        <span
          key={b.id}
          aria-hidden="true"
          className={`pointer-events-none absolute ml-1 mt-1 flex h-7 w-7 items-center justify-center rounded-pill border-2 border-surface text-sm font-semibold text-surface shadow-md ${
            b.id === activeId ? "bg-primary" : "bg-ink"
          }`}
          style={{ left: `${b.at.x * 100}%`, top: `${b.at.y * 100}%` }}
        >
          {b.n}
        </span>
      ))}
    </div>
  );
}
