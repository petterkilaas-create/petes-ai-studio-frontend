"use client";

import { X } from "lucide-react";
import { FOCUS } from "../godkjenning/classes";

/**
 * Merkelappen for en valgt tjeneste paa bildekortet (FE-3b; skissen
 * «Tjenester»): «Kveldsbilde · Varm skumring». Et trykk paa teksten aapner
 * valgene for den i vinduet, og «×» fjerner den. Lappen er 32 px hoey; et
 * usynlig lag (after:) gir hver knapp en trykkflate paa 44 px.
 */
export function ServiceBadge({
  label,
  openLabel,
  removeLabel,
  onOpen,
  onRemove,
}: {
  label: string;
  /** «Endre Kveldsbilde · Varm skumring på 1. Stue». */
  openLabel: string;
  /** «Fjern Kveldsbilde · Varm skumring fra 1. Stue». */
  removeLabel: string;
  onOpen: (opener: HTMLElement) => void;
  onRemove: () => void;
}) {
  return (
    <li className="inline-flex max-w-full items-center rounded-pill bg-neutral-bg text-neutral-fg">
      <button
        type="button"
        onClick={(e) => onOpen(e.currentTarget)}
        aria-label={openLabel}
        className={`relative min-h-8 min-w-0 rounded-pill py-1 pl-3 pr-1 text-left text-[13px] font-medium leading-tight hover:underline after:absolute after:inset-x-0 after:-inset-y-1.5 ${FOCUS}`}
      >
        {label}
      </button>
      <button
        type="button"
        onClick={onRemove}
        aria-label={removeLabel}
        className={`relative flex size-8 shrink-0 items-center justify-center rounded-pill hover:bg-surface-2 after:absolute after:-inset-1.5 ${FOCUS}`}
      >
        <X aria-hidden className="size-3.5" strokeWidth={2.2} />
      </button>
    </li>
  );
}
