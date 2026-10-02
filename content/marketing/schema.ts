/**
 * Typene til innholdet paa markedssiden (MS2, AUDIT_MARKEDSSIDE §4). De blir
 * Sanity-skjemaene senere: `site` blir et singleton-dokument, `home` et
 * dokument med seksjonene som blokker (`_type` skiller dem), og ImageRef blir
 * `image` med feltet `alt`.
 *
 * Komponentene faar innholdet som props og har ingen tekst selv. Tekster som
 * nevner merket, bruker {brand}; navnet kommer fra DEFAULT_BRAND (brand.ts).
 * Ingen import, saa node --test kan laste typene.
 */

/** Nøklene til bildene i images.ts (den eneste fila med bildeimport). */
export type ImageKey = "heroOriginal" | "heroEvening";

export type ImageRef = { image: ImageKey; alt: string };

export type Link = { label: string; href: string };

export type Site = {
  _type: "site";
  seo: {
    /** Fanetittelen paa markedssiden. Mal med {brand}. */
    title: string;
  };
  topBar: {
    _type: "topBar";
    /** Skjermlesertekst paa merket oeverst til venstre. Mal med {brand}. */
    logoLabel: string;
    logoHref: string;
    navLabel: string;
    links: readonly Link[];
    login: Link;
  };
  /** «Prøv gratis»: ett sted, brukt i topplinjen og toppen (senere priser og siste knapp). */
  cta: Link;
  offer: {
    /** Antall gratis kveldsbilder ved registrering. Tallet staar bare her. */
    freeImages: number;
  };
  notFound: {
    _type: "notFound";
    /** Fanetittelen. Mal med {brand}. */
    pageTitle: string;
    title: string;
    text: string;
    toApp: Link;
    toHome: Link;
  };
};

export type Hero = {
  _type: "hero";
  /** Ankeret topplinjen peker paa (logoen). */
  anchor: string;
  eyebrow: string;
  title: string;
  lead: string;
  secondary: Link;
  /** Merknaden under knappene. Mal med {n} = offer.freeImages. */
  freeNote: string;
  before: ImageRef;
  after: ImageRef;
  labels: { original: string; result: string; ai: string };
  sliderLabel: string;
  /** Skjermlesertekst for verdien. Mal med {n} = prosent original. */
  sliderValue: string;
  caption: string;
};

export type Home = {
  _type: "home";
  hero: Hero;
};
