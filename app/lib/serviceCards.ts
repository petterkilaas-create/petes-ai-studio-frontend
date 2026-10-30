/**
 * De store tjenestekortene paa Tjenester (D-1, dag 54, tegnebrett 1): to
 * brikker og knappeteksten per kort. Tittelen og linja er de samme noeklene
 * som foer (titleKey og descKey i services.ts). Bildene ligger i
 * (app)/tjenester/cardImages.ts, fordi node --test ikke kan laste .jpg.
 *
 * Rene data og funksjoner (bare en type-import), saa modulen kan testes med
 * node --test.
 */

import type { UiKey } from "./i18n";

export interface ServiceCardText {
  chips: readonly [UiKey, UiKey];
  /** «Velg …» til stegflyten kommer i D-4 (D1_SVAR punkt 8). */
  cta: UiKey;
}

/** Noekkelen er verktoeyets id i services.ts (ENABLED). */
export const SERVICE_CARD_TEXT: Record<string, ServiceCardText> = {
  skumring: {
    chips: ["express.card.skumring.chip1", "express.card.skumring.chip2"],
    cta: "express.card.skumring.cta",
  },
  klart_vaer: {
    chips: ["express.card.klart_vaer.chip1", "express.card.klart_vaer.chip2"],
    cta: "express.card.klart_vaer.cta",
  },
  aarstider: {
    chips: ["express.card.aarstider.chip1", "express.card.aarstider.chip2"],
    cta: "express.card.aarstider.cta",
  },
  digital_styling: {
    chips: ["express.card.digital_styling.chip1", "express.card.digital_styling.chip2"],
    cta: "express.card.digital_styling.cta",
  },
  privacy_blur: {
    chips: ["express.card.privacy_blur.chip1", "express.card.privacy_blur.chip2"],
    cta: "express.card.privacy_blur.cta",
  },
  // T1 (TG-NEW-281): lenken til /annonsetekst, bare naar LISTING_TEXT_UI slipper brukeren inn.
  annonsetekst: {
    chips: ["express.card.annonsetekst.chip1", "express.card.annonsetekst.chip2"],
    cta: "express.card.annonsetekst.cta",
  },
};

/**
 * Store kort med bilde bare for de tre demotjenestene (Petter 28.10, Dag 58,
 * del 4). De andre bestillbare (Blå himmel, Skjul ansikter) er små kort uten
 * bilde under de store, og bestilles som foer. Bare visningen endres.
 */
export const LARGE_CARD_IDS: readonly string[] = ["skumring", "digital_styling", "aarstider"];

export type CardSize = "large" | "small";

export function cardSize(id: string): CardSize {
  return LARGE_CARD_IDS.includes(id) ? "large" : "small";
}

/** De bestillbare kortene delt i store og små, i samme rekkefoelge som foer. */
export function splitBySize<T extends { id: string }>(tools: readonly T[]): { large: T[]; small: T[] } {
  return {
    large: tools.filter((tool) => cardSize(tool.id) === "large"),
    small: tools.filter((tool) => cardSize(tool.id) === "small"),
  };
}

/** Id-en til opplastingskortet, som rulles inn naar et kort velges. */
export const UPLOAD_CARD_ID = "tjeneste-opplasting";

/** Rullingen til opplastingskortet: uten animasjon naar brukeren har bedt om mindre bevegelse. */
export function uploadScrollBehavior(reducedMotion: boolean): ScrollBehavior {
  return reducedMotion ? "auto" : "smooth";
}
