"use client";

/**
 * Noeytralt panel naar backend sender en status frontend ikke kjenner
 * (2c-2). Pollingen er allerede stoppet — aldri evig polling, aldri roed feil.
 */
export interface UnknownStatusPanelProps {
  detail?: string | null;
}

export function UnknownStatusPanel({ detail }: UnknownStatusPanelProps) {
  return (
    <div className="border border-slate-600 bg-slate-800/40 rounded-xl p-4 text-sm text-slate-200 space-y-2">
      <p className="font-black uppercase tracking-widest text-[10px]">
        Ukjent status fra serveren
      </p>
      {detail && (
        <p className="text-[11px] text-slate-400 font-mono break-words">{detail}</p>
      )}
    </div>
  );
}
