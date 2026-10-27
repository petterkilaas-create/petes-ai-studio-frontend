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
};

/** Id-en til opplastingskortet, som rulles inn naar et kort velges. */
export const UPLOAD_CARD_ID = "tjeneste-opplasting";

/** Rullingen til opplastingskortet: uten animasjon naar brukeren har bedt om mindre bevegelse. */
export function uploadScrollBehavior(reducedMotion: boolean): ScrollBehavior {
  return reducedMotion ? "auto" : "smooth";
}
