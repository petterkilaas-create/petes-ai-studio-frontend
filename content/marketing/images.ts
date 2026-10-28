import type { StaticImageData } from "next/image";
import type { ImageKey } from "./schema";
import filmPoster from "./images/film-plakat.jpg";
import loopPoster from "./images/lokke-plakat.jpg";
import merkingEvening from "./images/merking-kveld.jpg";
import pairCleanupOriginal from "./images/par-rydd-original.jpg";
import pairCleanupResult from "./images/par-rydd-resultat.jpg";
import pairEveningOriginal from "./images/par-kveld-original.jpg";
import pairEveningResult from "./images/par-kveld-resultat.jpg";
import pairStylingOriginal from "./images/par-styling-original.jpg";
import pairStylingResult from "./images/par-styling-resultat.jpg";
import pairSeasonOriginal from "./images/par-aarstid-original.jpg";
import pairSeasonResult from "./images/par-aarstid-resultat.jpg";
import pairSkyOriginal from "./images/par-himmel-original.jpg";
import pairSkyResult from "./images/par-himmel-resultat.jpg";
import pairJapandiOriginal from "./images/par-japandi-original.jpg";
import pairJapandiResult from "./images/par-japandi-resultat.jpg";

// Bildene importeres statisk, saa next/image faar bredde og hoeyde
// (AUDIT_MARKEDSSIDE §7). Den eneste fila med bildeimport:
// node --test kan ikke laste .jpg, saa innholdet peker hit med en noekkel.
// merkingEvening er ekte (1536x1040, jobb 2f6c3c5b, med AI-merket og
// setningen; beslutning 4, 19.10). F7: de gamle toppbildene (hero-original.jpg
// og hero-kveld.jpg) er slettet.
//
// Den nye forsiden (F1, TG-NEW-230): parene er 1536x1024 (3:2), og originalen
// og resultatet i hvert par har samme utsnitt.
// - Ekte: pairEveningResult (utsnitt av merking-kveld.jpg, jobb 2f6c3c5b, med
//   AI-merket og XMP), pairEveningOriginal (samme foto, rent) og plakatene
//   (filmPoster 1280x720, loopPoster 720x480; de foelger videoene i videos.ts).
// - Midlertidige, med pending: "image" naar de tas i bruk: pairCleanup*
//   (probe R0b, Petters hjem, uten AI-merke) og pairStyling* (probe M0,
//   fotografens bilde, uten AI-merke).
// - Dag 58 (F2, TG-NEW-271): byte-like kopier av bildene paa Tjenester
//   (app/(app)/tjenester/bilder/, sha256 sjekket), 1600x1067 (3:2). Ekte, med
//   AI-merket nede til venstre: pairSeason* (aarstid-for/-etter) og pairSky*
//   (himmel-for/-etter) og pairJapandi* (styling-for/-etter, Digital
//   styling, rom 13849265_2 i Japandi; erstattet originalen med «Eksempel»).
//   pairCleanup* og pairStyling* brukes ikke lenger paa forsiden.
export const IMAGES: Record<ImageKey, StaticImageData> = {
  merkingEvening,
  pairEveningOriginal,
  pairEveningResult,
  pairCleanupOriginal,
  pairCleanupResult,
  pairStylingOriginal,
  pairStylingResult,
  pairSeasonOriginal,
  pairSeasonResult,
  pairSkyOriginal,
  pairSkyResult,
  pairJapandiOriginal,
  pairJapandiResult,
  filmPoster,
  loopPoster,
};
