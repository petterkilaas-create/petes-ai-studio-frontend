import { home } from "./nb/home.ts";
import { site } from "./nb/site.ts";
import type { Home, Site } from "./schema.ts";

/** Spraakene markedssiden finnes paa. Bare norsk i foerste versjon. */
export type MarketingLang = "no";

// Senere: henting fra Sanity med de samme typene.
export function getSite(lang: MarketingLang): Site {
  void lang;
  return site;
}

export function getHome(lang: MarketingLang): Home {
  void lang;
  return home;
}
