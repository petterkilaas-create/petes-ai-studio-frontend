import type { ReviewLight } from "./api";
import { initialOn, type Lights } from "./correction.ts";

/**
 * Lysene slik megleren ser dem (D2b, Petter 01.10, avvik 3 A). Rene
 * funksjoner, saa de kan testes med node --test; bare type-import fra api.ts.
 *
 * Megleren ser ikke analysens kategorier (brief §3 punkt 6). I rettingen
 * staar alle lysene i én flat liste. Ustabile og avviste er «Usikker» og
 * starter som av (som foer, initialToggles). Body bygges uendret av
 * buildCorrection; `uncertain` er kandidat-flagget setToggle og canToggle tar.
 */

export interface FlatLight {
  light: ReviewLight;
  /** Ustabil eller avvist i analysen: merkelappen «Usikker», og kandidat mot backend. */
  uncertain: boolean;
}

/** Godkjente foerst, saa ustabile og avviste, i rekkefoelgen fra backend. */
export function flatLights(lights: Lights): FlatLight[] {
  return [
    ...lights.approved.map((light) => ({ light, uncertain: false })),
    ...lights.unstable.map((light) => ({ light, uncertain: true })),
    ...lights.rejected.map((light) => ({ light, uncertain: true })),
  ];
}

/** Lysene som er tent i gjeldende bilde (sidepanelet): de som starter som paa i rettingen. */
export function litLights(lights: Lights): ReviewLight[] {
  return flatLights(lights)
    .map((f) => f.light)
    .filter(initialOn);
}
