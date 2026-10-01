"use client";

/**
 * Roed feilvisning for generiske submit-/poll-feil og ValidationError.
 * Visuelt moenster trukket ut av express-v2.
 *
 * Skilles bevisst fra RejectionPanel (gult): et scene-gate-avslag er
 * ikke en feil, og skal aldri vises som roed feil.
 */
export interface ErrorPanelProps {
  message?: string | null;
}

export function ErrorPanel({ message }: ErrorPanelProps) {
  if (!message) return null;

  return (
    <div className="bg-red-bg text-red-fg rounded-button p-4 text-sm" role="alert">
      <p className="font-medium mb-1">Error</p>
      <p className="break-words">{message}</p>
    </div>
  );
}
