import type { StaticImageData } from "next/image";
import { IMAGES } from "@/content/marketing/images";
import skyBefore from "./bilder/himmel-for.jpg";
import skyAfter from "./bilder/himmel-etter.jpg";
import stylingBefore from "./bilder/styling-for.jpg";
import seasonBefore from "./bilder/aarstid-for.jpg";
import seasonAfter from "./bilder/aarstid-etter.jpg";

/**
 * Bildene paa tjenestekortene (D-1, dag 54). Den eneste fila med bildeimport
 * i appsidene: node --test kan ikke laste .jpg, saa tekstene ligger i
 * lib/serviceCards.ts og bildene her. Statisk import gir next/image bredde og
 * hoeyde (images.md, «Local images»).
 *
 * - Kveldsbildet: forsideparet (B12, ekte, uten pending), gjenbrukt fra
 *   content/marketing/images.ts. AI-merket staar nede til venstre.
 * - Blaa himmel: Petters egne bilder (graa1/graa2), med AI-merket nede til venstre.
 * - Skjul ansikter: bare originalen med merket «Eksempel» (D1_SVAR punkt 3 a).
 *   Illustrasjonen med uskarpe plakater brukes ikke: tjenesten finner bare ansikter.
 * - Digital styling: bare originalen med merket «Eksempel» (boligbilde
 *   13861317, beslutning 4.6), ikke fotografens (pairStyling*). Resultatet
 *   fra proben fjernet panelovnene og stikkontaktene, saa det brukes ikke
 *   (Petter 25.10, valg b). Et resultat uten fjerning kommer senere.
 * - Aarstider (TG-NEW-271): Petters sommerbilde s1 og det godkjente vinterbildet
 *   fra miniproben AARSTID3 (K2, vinterblaa himmel), merket lokalt med
 *   mark.apply_mark fra backend («… årstiden er endret til vinter.», Petter
 *   27.10, 3 A). Begge 1600 × 1067, som Blaa himmel. Ikke s4: modellen endret
 *   teksten paa et skilt i vinduet (Petter 27.10).
 */
export interface CardImages {
  before: StaticImageData;
  /** Uten resultat vises bare originalen, med merket «Eksempel». */
  after?: StaticImageData;
}

export const CARD_IMAGES: Record<string, CardImages> = {
  skumring: { before: IMAGES.pairEveningOriginal, after: IMAGES.pairEveningResult },
  klart_vaer: { before: skyBefore, after: skyAfter },
  aarstider: { before: seasonBefore, after: seasonAfter },
  digital_styling: { before: stylingBefore },
  privacy_blur: { before: IMAGES.pairEveningOriginal },
};
