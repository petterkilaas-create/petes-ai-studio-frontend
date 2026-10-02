import type { MetadataRoute } from "next";
import { MARKETING_PAGES, MARKETING_PUBLIC, SITE_URL } from "./marketingAccess.ts";

/**
 * robots.txt og sitemap.xml (MS4) som rene funksjoner av MARKETING_PUBLIC,
 * saa testene kan sjekke begge tilstandene. app/robots.ts og app/sitemap.ts
 * kaller dem. Bare typeimport fra next (node --test).
 *
 * Til lansering: alt er sperret og sitemap er tom. Etter lansering: alt er
 * tillatt (Petter 02.10, valg B1). App-sidene holdes ute med noindex og
 * innlogging, ikke med Disallow: en sperret side kan ikke vise noindex, og
 * Disallow ville ogsaa sperret / og /_next/.
 */
export function robotsFor(marketingPublic: boolean = MARKETING_PUBLIC): MetadataRoute.Robots {
  if (!marketingPublic) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}

/** Bare de offentlige markedssidene, med full adresse. Tom til lansering. */
export function sitemapFor(marketingPublic: boolean = MARKETING_PUBLIC): MetadataRoute.Sitemap {
  if (!marketingPublic) return [];
  return MARKETING_PAGES.map((path) => ({ url: `${SITE_URL}${path}` }));
}
