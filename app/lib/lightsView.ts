import type { JobReviewDetail, LightBox, ReviewLight } from "./api";
import { initialOn, type Lights } from "./correction.ts";
import { codeText, type Locale } from "./i18n/index.ts";
import { mediaDeleted } from "./review.ts";

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

/**
 * Markoerene i originalen (TG-NEW-166). To stiler, som ordene i lista
 * (TG-166-oppfoelging, valg 2 A): godkjente er fylt, ustabile og avviste
 * er «Usikker», stiplet og hul. Analysens kategorier vises ikke (brief §3
 * punkt 6).
 */
export interface LightMarker {
  light: ReviewLight;
  /** Ustabil eller avvist: «Usikker», som i lista. */
  uncertain: boolean;
  /** Merket paa bildet og i forklaringen: A, B, C ... (valg 1 A), saa det ikke forveksles med «Spotlight 2». */
  letter: string;
  /** Samme navn som i lista (lightNames): nummer og sone. */
  name: LightName;
  /** Midtpunktet av boksen i prosent av bredden (x) og hoeyden (y). */
  x: number;
  y: number;
  /** Stoerrelsen paa boksen i prosent av bredden og hoeyden. */
  width: number;
  height: number;
}

/** Merket for markoer nummer `i` (fra 0): A-Z, saa AA, AB ... */
export function markerLetter(i: number): string {
  let n = i + 1;
  let out = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    out = String.fromCharCode(65 + r) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

/**
 * Boksen `[ymin, xmin, ymax, xmax]` (0-1000) i prosent: midtpunktet og
 * stoerrelsen. En snudd boks (ymin > ymax eller xmin > xmax) normaliseres med
 * min og max.
 */
export function markerPosition(box: LightBox): { x: number; y: number; width: number; height: number } {
  const [y1, x1, y2, x2] = box;
  const [top, bottom] = [Math.min(y1, y2), Math.max(y1, y2)];
  const [left, right] = [Math.min(x1, x2), Math.max(x1, x2)];
  return { x: (left + right) / 20, y: (top + bottom) / 20, width: (right - left) / 10, height: (bottom - top) / 10 };
}

/**
 * Markoerene i rekkefoelgen fra den flate lista, med merke A, B, C ... i den
 * rekkefoelgen, og hvor mange lys som ikke har boks (de har navn i lista, men
 * ingen markoer og intet merke).
 */
export function lightMarkers(lights: Lights): { markers: LightMarker[]; withoutBox: number } {
  const nameOf = lightNames(lights);
  const markers: LightMarker[] = [];
  let withoutBox = 0;
  for (const { light, uncertain } of flatLights(lights)) {
    if (light.box === null) {
      withoutBox += 1;
      continue;
    }
    const letter = markerLetter(markers.length);
    markers.push({ light, uncertain, letter, name: nameOf(light), ...markerPosition(light.box) });
  }
  return { markers, withoutBox };
}

/** Hvor merket staar i forhold til rammen: over, under eller inni; og ved venstre kant, midt paa eller ved hoeyre kant. */
export interface BadgePlacement {
  vertical: "above" | "below" | "inside";
  horizontal: "start" | "center" | "end";
}

/** Merket trenger saa mye plass over eller under rammen, i prosent av hoeyden (22 px er ca. 9 % paa 375 px). */
export const BADGE_ROOM = 10;
/** Naermere kanten enn dette (prosent av bredden) legges merket inntil kanten, saa det ikke kuttes. */
export const BADGE_EDGE = 6;

/**
 * Merket staar utenfor rammen, saa det ikke dekker smaa lamper: over rammen,
 * under naar det ikke er plass over, og inni bare naar boksen fyller nesten
 * hele hoeyden.
 */
export function badgePlacement(m: Pick<LightMarker, "x" | "y" | "height">): BadgePlacement {
  const top = m.y - m.height / 2;
  const bottom = m.y + m.height / 2;
  const vertical = top >= BADGE_ROOM ? "above" : bottom <= 100 - BADGE_ROOM ? "below" : "inside";
  const horizontal = m.x < BADGE_EDGE ? "start" : m.x > 100 - BADGE_EDGE ? "end" : "center";
  return { vertical, horizontal };
}

/**
 * Knappen «Vis lampene i bildet» (TG-NEW-166): bare naar originalen finnes,
 * bildene ikke er slettet (TG-NEW-117) og minst ett lys har boks.
 */
export function canShowMarkers(
  review: Pick<JobReviewDetail, "images" | "lights" | "mediaDeletedAt">
): boolean {
  return (
    review.images.originalUrl !== null &&
    !mediaDeleted(review) &&
    flatLights(review.lights).some((f) => f.light.box !== null)
  );
}
