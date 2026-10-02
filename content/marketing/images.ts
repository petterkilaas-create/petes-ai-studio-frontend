import type { StaticImageData } from "next/image";
import type { ImageKey } from "./schema";
import heroEvening from "./images/hero-kveld.jpg";
import heroOriginal from "./images/hero-original.jpg";

// Bildene importeres statisk, saa next/image faar bredde og hoeyde
// (AUDIT_MARKEDSSIDE §7). Den eneste fila med bildeimport:
// node --test kan ikke laste .jpg, saa innholdet peker hit med en noekkel.
// Midlertidige bilder (1536x1024, kveldsbildet med AI-ikonet), byttes foer
// lansering.
export const IMAGES: Record<ImageKey, StaticImageData> = {
  heroOriginal,
  heroEvening,
};
