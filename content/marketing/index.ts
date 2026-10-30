import { contactPage } from "./nb/contact.ts";
import { faq, faqPage } from "./nb/faq.ts";
import { guidePage } from "./nb/guide.ts";
import { home } from "./nb/home.ts";
import { labelingPage } from "./nb/labeling.ts";
import { site } from "./nb/site.ts";
import type { ContactPage, FaqItem, FaqPage, GuidePage, Home, LabelingPage, Site } from "./schema.ts";

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

/** Veiledningen for meglere (Dag 59). */
export function getGuidePage(lang: MarketingLang): GuidePage {
  void lang;
  return guidePage;
}

export function getLabelingPage(lang: MarketingLang): LabelingPage {
  void lang;
  return labelingPage;
}

export function getContactPage(lang: MarketingLang): ContactPage {
  void lang;
  return contactPage;
}
