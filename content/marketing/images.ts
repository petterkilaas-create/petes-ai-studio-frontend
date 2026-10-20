import type { StaticImageData } from "next/image";
import type { ImageKey } from "./schema";
import filmPoster from "./images/film-plakat.jpg";
import heroEvening from "./images/hero-kveld.jpg";
import heroOriginal from "./images/hero-original.jpg";
import loopPoster from "./images/lokke-plakat.jpg";
import merkingEvening from "./images/merking-kveld.jpg";
import pairCleanupOriginal from "./images/par-rydd-original.jpg";
import pairCleanupResult from "./images/par-rydd-resultat.jpg";
import pairEveningOriginal from "./images/par-kveld-original.jpg";
import pairEveningResult from "./images/par-kveld-resultat.jpg";
import pairStylingOriginal from "./images/par-styling-original.jpg";
import pairStylingResult from "./images/par-styling-resultat.jpg";

// Bildene importeres statisk, saa next/image faar bredde og hoeyde
// (AUDIT_MARKEDSSIDE §7). Den eneste fila med bildeimport:
// node --test kan ikke laste .jpg, saa innholdet peker hit med en noekkel.
// Hero-bildene er midlertidige (1536x1024, kveldsbildet med AI-ikonet) og
// byttes foer lansering. merkingEvening er ekte (1536x1040, jobb 2f6c3c5b,
// med AI-merket og setningen; beslutning 4, 19.10).
//
// Den nye forsiden (F1, TG-NEW-230): parene er 1536x1024 (3:2), og originalen
// og resultatet i hvert par har samme utsnitt.
// - Ekte: pairEveningResult (utsnitt av merking-kveld.jpg, jobb 2f6c3c5b, med
//   AI-merket og XMP), pairEveningOriginal (samme foto, rent) og plakatene
//   (filmPoster 1280x720, loopPoster 720x480; de foelger videoene i videos.ts).
// - Midlertidige, med pending: "image" naar de tas i bruk: pairCleanup*
//   (probe R0b, Petters hjem, uten AI-merke) og pairStyling* (probe M0,
//   fotografens bilde, uten AI-merke).
export const IMAGES: Record<ImageKey, StaticImageData> = {
  heroOriginal,
  heroEvening,
  merkingEvening,
  pairEveningOriginal,
  pairEveningResult,
  pairCleanupOriginal,
  pairCleanupResult,
  pairStylingOriginal,
  pairStylingResult,
  filmPoster,
  loopPoster,
};
