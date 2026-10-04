"use client";

import { t } from "../lib/i18n";
import { useLocale } from "../lib/i18n/useLocale";

/**
 * Roed feilvisning for generiske submit-/poll-feil og ValidationError.
 * Visuelt moenster trukket ut av express-v2.
 *
 * Skilles bevisst fra RejectionPanel (gult): et scene-gate-avslag er
 * ikke en feil, og skal aldri vises som roed feil.
 *
 * Overskriften fra ordlista (TG-NEW-158). Spraaket hentes her, saa sidene
 * som bruker panelet ikke trenger aa sende det inn.
 */
export interface ErrorPanelProps {
  message?: string | null;
}

export function ErrorPanel({ message }: ErrorPanelProps) {
  const locale = useLocale();
  if (!message) return null;

  return (
    <div className="bg-red-bg text-red-fg rounded-button p-4 text-sm" role="alert">
      <p className="font-medium mb-1">{t(locale, "error.title")}</p>
      <p className="break-words">{message}</p>
    </div>
  );
}
