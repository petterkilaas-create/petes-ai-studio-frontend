"use client";

/**
 * Roed feilvisning for generiske submit-/poll-feil og ValidationError.
 * Visuelt moenster trukket ut av express-v2 / scene-transform-debug.
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
    <div className="border border-[#ef4444]/50 bg-[#ef4444]/10 rounded-xl p-4 text-sm text-[#fca5a5]">
      <p className="font-black uppercase tracking-widest text-[10px] mb-1">Error</p>
      <p className="break-words">{message}</p>
    </div>
  );
}
