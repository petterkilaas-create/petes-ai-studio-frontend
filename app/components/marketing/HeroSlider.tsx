"use client";

import Image, { type StaticImageData } from "next/image";
import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { ChevronsLeftRight } from "lucide-react";
import { SLIDER_START, sliderKey, valueFromPointer } from "../../lib/slider";
import { fill } from "../../../content/marketing/fill";
import { FOCUS } from "./classes";

/**
 * Foer/etter-slideren i eksemplene paa markedssiden (MS2; F5: en per fane
 * i ExampleTabs, ikke lenger i toppen). Navnet blir staaende til F7. Samme
 * oppfoersel som slideren paa godkjenningssiden (D2a, CompareViewer): kan
 * dras, men ogsaa styres med tastaturet og med klikk eller trykk paa sporet
 * (WCAG 2.5.7), og siden ruller fortsatt loddrett paa mobil (touch-pan-y).
 *
 * Bildene er next/image med fill i en boks med fast forhold 3:2, saa
 * plassen er satt foer bildene kommer (CLS). Slideren staar langt nede paa
 * siden, saa begge bildene lastes lat. Originalen ligger oppaa og kuttes med
 * clip-path. Dras slideren helt til venstre, synes hele resultatet med
 * AI-merket i bildet; «AI»-merkelappen oeverst til hoeyre synes alltid.
 */

/** Standardbredden: hele containeren (1320 px minus luft), ellers hele skjermen. */
const SIZES = "(min-width: 1320px) 1224px, 100vw";

const CHIP =
  "pointer-events-none absolute top-3.5 inline-flex h-[30px] items-center rounded-pill bg-ink/75 text-[13px] font-semibold text-surface";

export type SliderImage = { src: StaticImageData; alt: string };

export function HeroSlider({
  before,
  after,
  labels,
  sliderLabel,
  sliderValue,
  sizes = SIZES,
}: {
  before: SliderImage;
  after: SliderImage;
  labels: { original: string; result: string; ai: string };
  sliderLabel: string;
  /** Mal med {n}. */
  sliderValue: string;
  /** Bredden bildet vises i (next/image). */
  sizes?: string;
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
      className="relative aspect-[3/2] w-full cursor-ew-resize touch-pan-y select-none overflow-hidden rounded-[16px] bg-surface-2 shadow-[0_30px_70px_-30px_rgb(16_26_44/0.55)]"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={stopDrag}
      onPointerCancel={stopDrag}
    >
      <Image
        src={after.src}
        alt={after.alt}
        fill
        sizes={sizes}
        draggable={false}
        className="object-cover"
      />
      <span className={`${CHIP} right-3.5 gap-2 pl-1.5 pr-3`}>
        <span className="inline-flex size-[22px] items-center justify-center rounded-full bg-surface text-[12px] font-bold tracking-[-0.02em] text-ink">
          {labels.ai}
        </span>
        {labels.result}
      </span>
      <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - value}% 0 0)` }}>
        <Image
          src={before.src}
          alt={before.alt}
          fill
          sizes={sizes}
          draggable={false}
          className="object-cover"
        />
        <span className={`${CHIP} left-3.5 px-3`}>{labels.original}</span>
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-surface shadow-[0_0_0_1px_rgb(0_0_0/0.18)]"
        style={{ left: `${value}%` }}
      />
      <div
        ref={handleRef}
        role="slider"
        tabIndex={0}
        aria-label={sliderLabel}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
        aria-valuetext={fill(sliderValue, { n: value })}
        onKeyDown={onKeyDown}
        className={`absolute top-1/2 flex size-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-surface text-ink shadow-[0_4px_14px_rgb(0_0_0/0.3)] ${FOCUS}`}
        style={{ left: `${value}%` }}
      >
        <ChevronsLeftRight aria-hidden="true" className="size-5" />
      </div>
    </div>
  );
}
