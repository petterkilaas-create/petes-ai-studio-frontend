import type { StaticImageData } from "next/image";
import type { ImageKey } from "./schema";
import heroEvening from "./images/hero-kveld.jpg";
import heroOriginal from "./images/hero-original.jpg";
import merkingEvening from "./images/merking-kveld.jpg";

// Bildene importeres statisk, saa next/image faar bredde og hoeyde
// (AUDIT_MARKEDSSIDE §7). Den eneste fila med bildeimport:
// node --test kan ikke laste .jpg, saa innholdet peker hit med en noekkel.
// Hero-bildene er midlertidige (1536x1024, kveldsbildet med AI-ikonet) og
// byttes foer lansering. merkingEvening er ekte (1536x1040, jobb 2f6c3c5b,
// med AI-merket og setningen; beslutning 4, 19.10).
export const IMAGES: Record<ImageKey, StaticImageData> = {
  heroOriginal,
  heroEvening,
  merkingEvening,
};
