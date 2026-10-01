"use client";

import { t } from "../lib/i18n";
import { useLocale } from "../lib/i18n/useLocale";

/**
 * Plassholder naar den merkede forhaandsvisningen mangler (Lekkasjen L2,
 * Petter 29.09). Samme ramme som bildet (3:2), saa siden ikke hopper. Vises i
 * stedet for bildet, aldri sammen med et umerket tilbakefall.
 */
export function PreviewPlaceholder() {
  const locale = useLocale();
  return (
    <div
      className="aspect-[3/2] w-full rounded-button border border-dashed border-line-strong bg-surface-2 flex items-center justify-center p-6 text-center text-ink-2 text-sm"
      role="status"
    >
      {t(locale, "preview.notReady")}
    </div>
  );
}
