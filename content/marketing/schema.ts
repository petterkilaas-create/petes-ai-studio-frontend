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

/**
 * Det som venter paa avklaring foer lansering (MS3, regel 3 og 4). Mens
 * siden er bak innlogging vises en merkelapp fra site.pendingLabels, og en
 * test hindrer MARKETING_PUBLIC = true saa lenge noe venter (pending.ts).
 * Sanity: et listefelt, saa redaktoeren ser hva som gjenstaar.
 */
export type PendingKey =
  | "dataRegion"
  | "legal"
  | "email"
  | "companyName"
  | "time"
  | "trainingAnswer"
  | "storageAnswer"
  | "image";

/** Et bilde fra images.ts. `pending: "image"`: midlertidig bilde som skal byttes (Petter 02.10, valg E). */
export type ImageRef = { image: ImageKey; alt: string; pending?: "image" };

/** Et bilde vi ikke har ennaa: en noeytral boks med faste maal og en kort tekst. */
export type ImagePlaceholder = { placeholder: string; alt: string; pending: "image" };

export type Picture = ImageRef | ImagePlaceholder;

/** En tekst som kan vente paa avklaring (merkelappen vises etter teksten). */
export type Claim = { text: string; pending?: PendingKey };

/**
 * En lenke. Uten `href` vises den som tekst (siden finnes ikke ennaa, MS5).
 * En lenke til et anker vises bare naar seksjonen finnes i innholdet (links.ts).
 */
export type Link = { label: string; href: string };
export type MaybeLink = { label: string; href?: string };

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
    /** Knappen for menyen under 820 px (MS3). */
    menuLabel: string;
  };
  /** «Prøv gratis»: ett sted, brukt i topplinjen og toppen (senere priser og siste knapp). */
  cta: Link;
  offer: {
    /** Antall gratis kveldsbilder ved registrering. Tallet staar bare her. */
    freeImages: number;
  };
  /** Merkelappene for det som venter (MS3). Vises bare mens siden er bak innlogging. */
  pendingLabels: Record<PendingKey, string>;
  /** Teksten i en bildeplassholder, over beskrivelsen. */
  imagePlaceholder: string;
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

/** Tillitsstripen under toppen (MS3, utkastet linje 76-81). */
export type TrustStrip = {
  _type: "trustStrip";
  label: string;
  /** Det foerste punktet har AI-merket foran (ai: true). */
  items: readonly (Claim & { ai?: boolean })[];
  aiLabel: string;
};

/** Eksemplene med faner (MS3, utkastet linje 85-121 og 472-480). */
export type Examples = {
  _type: "examples";
  anchor: string;
  title: string;
  lead: string;
  tabListLabel: string;
  beforeCaption: string;
  afterCaption: string;
  aiLabel: string;
  tabs: readonly { id: string; label: string; before: Picture; after: Picture }[];
};

/**
 * Stemningene (MS3, utkastet linje 125-163 og 491-497). `time` og `sky` er
 * kodene fra appen (lib/dusk.ts); navnene er de samme som i appens ordliste
 * (testen sjekker det).
 */
export type Moods = {
  _type: "moods";
  title: string;
  lead: string;
  groups: readonly {
    time: string;
    label: string;
    groupLabel: string;
    items: readonly { sky: string; name: string; note?: string; picture: Picture }[];
  }[];
  fireplaceNote: string;
  /** Foran notatet under bildet mens bildet er en plassholder. */
  placeholderCaption: string;
};

/** Tre steg (MS3, utkastet linje 169-186). Nummeret lages av rekkefoelgen. */
export type Steps = {
  _type: "steps";
  title: string;
  items: readonly { title: string; text: string }[];
};

/** Tjenestene (MS3, utkastet linje 192-240). `id` er tjenestens kode i appen. */
export type Services = {
  _type: "services";
  anchor: string;
  title: string;
  lead: string;
  availableLabel: string;
  soonLabel: string;
  items: readonly {
    id: string;
    title: string;
    text: string;
    status: "available" | "soon";
    picture?: Picture;
    more?: MaybeLink;
  }[];
};

export type Home = {
  _type: "home";
  hero: Hero;
  trustStrip: TrustStrip;
  examples: Examples;
  moods: Moods;
  steps: Steps;
  services: Services;
};
