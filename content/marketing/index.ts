import { contactPage } from "./nb/contact.ts";
import { faq, faqPage } from "./nb/faq.ts";
import { home } from "./nb/home.ts";
import { labelingPage } from "./nb/labeling.ts";
import { site } from "./nb/site.ts";
import type { ContactPage, FaqItem, FaqPage, Home, LabelingPage, Site } from "./schema.ts";

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

/** Alle spoersmaal og svar (MS3b). Forsiden viser dem med showOnHome. */
export function getFaq(lang: MarketingLang): readonly FaqItem[] {
  void lang;
  return faq;
}

/** Innholdssidene (MS5a). */
export function getFaqPage(lang: MarketingLang): FaqPage {
  void lang;
  return faqPage;
}

export function getLabelingPage(lang: MarketingLang): LabelingPage {
  void lang;
  return labelingPage;
}

export function getContactPage(lang: MarketingLang): ContactPage {
  void lang;
  return contactPage;
}
