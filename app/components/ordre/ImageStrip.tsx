"use client";

import { useRef, type KeyboardEvent } from "react";
import { ImageOff } from "lucide-react";
import type { AssignmentImage } from "../../lib/assignments";
import { stripKey, stripStatus } from "../../lib/player";
import { FOCUS } from "../godkjenning/classes";
import { t } from "../../lib/i18n";
import { useLocale } from "../../lib/i18n/useLocale";

/** Fargen paa prikken: som statuspillene (amber venter, groenn godkjent, roed feilet). */
const DOT: Record<string, string> = {
  to_review: "bg-amber-fg",
  needs_answer: "bg-amber-fg",
  approved: "bg-green-fg",
  failed: "bg-red-fg",
};

/**
 * Bildestripa paa ordresiden (FE-4, audit punkt 6): miniatyr, nummer, rom og
 * status («2 av 3 kontrollert», eller «Original»). Én tabstopp («roving
 * tabindex»): valgt bilde har tabIndex 0, ←/→/Home/End flytter og velger
 * (stripKey), og valgt bilde har `aria-current`. Stripa ruller vannrett
 * paa smal skjerm; siden ruller ikke (min-w-0 hos foreldrene).
 */
export function ImageStrip({
  images,
  currentId,
  onSelect,
}: {
  images: readonly AssignmentImage[];
  currentId: string;
  onSelect: (image: AssignmentImage) => void;
}) {
  const locale = useLocale();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const current = Math.max(
    images.findIndex((img) => img.id === currentId),
    0
  );

  const onKeyDown = (e: KeyboardEvent<HTMLUListElement>) => {
    const j = stripKey(e.key, current, images.length);
    if (j === null) return;
    e.preventDefault();
    onSelect(images[j]);
    refs.current[j]?.focus();
  };

  return (
    <nav aria-label={t(locale, "player.stripLabel")} className="min-w-0">
      <ul className="flex gap-2 overflow-x-auto pb-2" onKeyDown={onKeyDown}>
        {images.map((image, i) => {
          const selected = i === current;
          return (
            <li key={image.id} className="shrink-0">
              <button
                ref={(el) => {
                  refs.current[i] = el;
                }}
                type="button"
                tabIndex={selected ? 0 : -1}
                aria-current={selected ? "true" : undefined}
                onClick={() => onSelect(image)}
                className={`flex w-32 flex-col gap-1 rounded-button bg-surface p-1.5 text-left ${
                  selected ? "border-2 border-ink" : "border border-line hover:border-line-strong"
                } ${FOCUS}`}
              >
                <span className="flex aspect-[3/2] w-full items-center justify-center overflow-hidden rounded-button bg-surface-2">
                  {image.thumbUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={image.thumbUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                  ) : (
                    <ImageOff aria-hidden className="size-5 text-ink-2" strokeWidth={1.75} />
                  )}
                </span>
                <span className="flex min-w-0 items-center gap-1.5 text-[13px] text-ink">
                  <span
                    aria-hidden
                    className={`size-2 shrink-0 rounded-pill ${DOT[image.displayStatus ?? ""] ?? "bg-neutral-fg"}`}
                  />
                  <span className="truncate">
                    {i + 1}. {image.room ?? t(locale, "player.imageN", { n: i + 1 })}
                  </span>
                </span>
                <span className="truncate text-xs text-ink-2">{stripStatus(locale, image)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
