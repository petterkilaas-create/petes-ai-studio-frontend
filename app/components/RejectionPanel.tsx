"use client";

import type { Rejection } from "../lib/api";
import { Button } from "./ui/Button";

/**
 * Gult panel for scene-gate-avslag (TG-NEW-58) — bevisst skilt fra roed
 * ErrorPanel. Viser den bruker-rettede meldingen (uten raatt rejected_*-
 * prefiks, som allerede er strippet i api.ts) og en "Fortsett som
 * eksterioer"-knapp.
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
    <div className="bg-amber-bg text-amber-fg rounded-button p-4 text-sm space-y-3">
      <p className="font-medium">
        {rejection.reason === "interior"
          ? "Bildet ble vurdert som interiør"
          : "Usikker scene-vurdering"}
      </p>
      <p className="break-words">{rejection.message}</p>
      <p className="text-[13px]">
        {rejection.reason === "interior"
          ? "Eksteriør-presets passer ikke for interiørbilder. Hvis du er sikker på at dette faktisk er et eksteriørbilde, kan du overstyre vurderingen:"
          : "Klassifisereren klarte ikke avgjøre scene-typen. Hvis dette er et eksteriørbilde, kan du fortsette med eksplisitt overstyring:"}
      </p>
      <Button variant="secondary" onClick={onForceExterior} disabled={disabled}>
        Fortsett som eksteriør
      </Button>
    </div>
  );
}
