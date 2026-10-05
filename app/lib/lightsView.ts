import type { LightBox, ReviewLight } from "./api";
import { initialOn, type Lights } from "./correction.ts";
import { codeText, type Locale } from "./i18n/index.ts";

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

/**
 * Sonen i bildet (TG-NEW-148, Petter 05.10, 3 x 3): kode for ordlista
 * `lightZone`. Plassering i bildet, ikke i rommet.
 */
export type LightZone =
  | "top_left"
  | "top_center"
  | "top_right"
  | "left"
  | "center"
  | "right"
  | "bottom_left"
  | "bottom_center"
  | "bottom_right";

const ZONES: readonly (readonly LightZone[])[] = [
  ["top_left", "top_center", "top_right"],
  ["left", "center", "right"],
  ["bottom_left", "bottom_center", "bottom_right"],
];

/**
 * Tredjedelen et midtpunkt (0-1000) ligger i: 0, 1 eller 2. Grensene hoerer
 * til tredjedelen etter: noeyaktig 1000/3 gir 1 (midten), noeyaktig 2000/3 gir
 * 2. Ganget med 3 for aa slippe avrunding.
 */
export function third(center: number): 0 | 1 | 2 {
  if (center * 3 < 1000) return 0;
  if (center * 3 < 2000) return 1;
  return 2;
}

function centerOf(box: LightBox): { x: number; y: number } {
  const [ymin, xmin, ymax, xmax] = box;
  return { x: (xmin + xmax) / 2, y: (ymin + ymax) / 2 };
}

/** Sonen fra midtpunktet i boksen; null uten boks. */
export function lightZone(box: LightBox | null): LightZone | null {
  if (box === null) return null;
  const { x, y } = centerOf(box);
  return ZONES[third(y)][third(x)];
}

export interface LightName {
  /** Nummer innen typen, bare naar typen finnes mer enn én gang. */
  number: number | null;
  zone: LightZone | null;
}

/**
 * Navnet paa hvert lys (TG-NEW-148): nummer per type, telt over hele den flate
 * lista (godkjente, ustabile og avviste), saa «Pendel 2» er den samme lampen i
 * «Lys som tennes», rettingen og «Detaljer». Nummereres venstre mot hoeyre
 * etter midtpunktet i boksen, topp mot bunn ved likt; lys uten boks kommer
 * til slutt i rekkefoelgen fra backend. Rekkefoelgen fra backend er den samme
 * i alle runder, saa numrene er stabile. Oppslaget er paa objektet, saa lysene
 * maa komme fra de samme listene.
 */
export function lightNames(lights: Lights): (light: ReviewLight) => LightName {
  const all = flatLights(lights).map((f) => f.light);
  const byType = new Map<string | null, ReviewLight[]>();
  for (const light of all) {
    const group = byType.get(light.type);
    if (group === undefined) byType.set(light.type, [light]);
    else group.push(light);
  }
  const names = new Map<ReviewLight, LightName>();
  for (const group of byType.values()) {
    // Array.sort er stabil: likt midtpunkt og lys uten boks beholder rekkefoelgen fra backend.
    const sorted = [...group].sort((a, b) => {
      if (a.box === null || b.box === null) return (a.box === null ? 1 : 0) - (b.box === null ? 1 : 0);
      const ca = centerOf(a.box);
      const cb = centerOf(b.box);
      return ca.x - cb.x || ca.y - cb.y;
    });
    sorted.forEach((light, i) => {
      names.set(light, { number: group.length > 1 ? i + 1 : null, zone: lightZone(light.box) });
    });
  }
  return (light) => names.get(light) ?? { number: null, zone: lightZone(light.box) };
}

/** Teksten for et lys: «Utvendig vegglampe 3» og sonen «til høyre» (null uten boks). */
export function lightText(locale: Locale, light: ReviewLight, name: LightName): { title: string; zone: string | null } {
  const type = codeText(locale, "lightType", light.type);
  return {
    title: name.number === null ? type : `${type} ${name.number}`,
    zone: name.zone === null ? null : codeText(locale, "lightZone", name.zone),
  };
}
