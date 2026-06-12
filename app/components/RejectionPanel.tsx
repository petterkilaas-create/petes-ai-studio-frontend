"use client";

import type { Rejection } from "../lib/api";

/**
 * Gult panel for scene-gate-avslag (TG-NEW-58) — bevisst skilt fra roed
 * ErrorPanel. Viser den bruker-rettede meldingen (uten raatt rejected_*-
 * prefiks, som allerede er strippet i api.ts) og en "Fortsett som
 * eksterioer"-knapp.
 *
 * Tekster og visuelt moenster er kopiert uendret fra den live-verifiserte
 * referansen scene-transform-debug (alle tre verdikt-stier for TG-NEW-58).
 */
export interface RejectionPanelProps {
  rejection: Rejection;
  /** Kalles av "Fortsett som eksterioer" — typisk useProcessJob.resubmitForced. */
  onForceExterior: () => void;
  /** Deaktiver knappen mens en kjoering paagaar. */
  disabled?: boolean;
}

export function RejectionPanel({
  rejection,
  onForceExterior,
  disabled,
}: RejectionPanelProps) {
  return (
    <div className="border border-amber-500/50 bg-amber-500/10 rounded-xl p-4 text-sm text-amber-200 space-y-3">
      <p className="font-black uppercase tracking-widest text-[10px]">
        {rejection.reason === "interior"
          ? "Bildet ble vurdert som interiør"
          : "Usikker scene-vurdering"}
      </p>
      <p className="break-words text-amber-100">{rejection.message}</p>
      <p className="text-amber-200/70 text-xs">
        {rejection.reason === "interior"
          ? "Eksteriør-presets passer ikke for interiørbilder. Hvis du er sikker på at dette faktisk er et eksteriørbilde, kan du overstyre vurderingen:"
          : "Klassifisereren klarte ikke avgjøre scene-typen. Hvis dette er et eksteriørbilde, kan du fortsette med eksplisitt overstyring:"}
      </p>
      <button
        onClick={onForceExterior}
        disabled={disabled}
        className="px-6 py-2.5 rounded-full bg-amber-500 hover:bg-amber-400 disabled:bg-slate-700 disabled:cursor-not-allowed text-[#0B1120] font-black uppercase tracking-widest text-[10px] transition-colors"
      >
        Fortsett som eksteriør
      </button>
    </div>
  );
}
