import type { Site } from "./schema.ts";

/**
 * Tallene paa markedssiden (MS3, regel 1): de staar bare i site.offer, og
 * alt annet regnes ut her. Ingen import utenom typer (node --test).
 */

/** Pris per bilde i pakken, avrundet til hele kroner: 349 / 3 = 116. */
export function perImage(offer: Site["offer"]): number {
  return Math.round(offer.prices.bundle / offer.bundleCount);
}

/** Et beloep med norsk tallformat (mellomrom som tusenskille). */
export function formatNok(amount: number): string {
  return new Intl.NumberFormat("nb-NO").format(amount);
}

/** Verdiene til malene om pris (prisene og svaret paa «Hva koster det?»). */
export function priceVars(offer: Site["offer"]): Record<string, string | number> {
  return {
    single: formatNok(offer.prices.single),
    bundle: formatNok(offer.prices.bundle),
    bundleCount: offer.bundleCount,
    privacyBlur: formatNok(offer.prices.privacyBlur),
    perImage: formatNok(perImage(offer)),
  };
}
