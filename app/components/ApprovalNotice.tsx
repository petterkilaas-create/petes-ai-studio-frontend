"use client";

/**
 * Merke for awaiting_approval (2c-2): bildet er laget, men ikke godkjent.
 * Vises sammen med resultatbildet — ikke en feil.
 */
export function ApprovalNotice() {
  return (
    <div className="mb-4 flex items-center gap-3">
      <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border bg-sky-900/30 text-sky-300 border-sky-500/20">
        Til kontroll
      </span>
      <span className="text-xs text-slate-400">Bildet er ikke godkjent ennå.</span>
    </div>
  );
}
