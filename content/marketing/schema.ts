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

/** En verdi vi ikke har ennaa, for eksempel e-posten ([E-POST]) eller tiden ([TID]). */
export type PendingValue = { pending: PendingKey };

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
    /**
     * Alt-teksten til delingsbildet (MS4). Mal med {brand} og {title} =
     * hero.title, som er teksten i bildet. Beskrivelsen er hero.lead.
     */
    ogImageAlt: string;
  };
  topBar: {
    _type: "topBar";
    /** Skjermlesertekst paa merket oeverst til venstre. Mal med {brand}. */
    logoLabel: string;
    logoHref: string;
    /** Det samme paa en underside, der merket gaar til /no (MS5a). Mal med {brand}. */
    logoHomeLabel: string;
    navLabel: string;
    links: readonly Link[];
    login: Link;
    /** Knappen for menyen under 820 px (MS3). */
    menuLabel: string;
  };
  /** «Prøv gratis»: ett sted, brukt i topplinjen og toppen (senere priser og siste knapp). */
  cta: Link;
  /**
   * Alle tall paa markedssiden staar her og bare her (MS3, regel 1). Tekstene
   * er maler; «ca. 116 kr per bilde» og svaret om pris regnes ut i offer.ts.
   */
  offer: {
    /** Antall gratis kveldsbilder ved registrering. */
    freeImages: number;
    /** Antall kveldsbilder i pakken. */
    bundleCount: number;
    /** Priser i kroner eks. mva. */
    prices: { free: number; single: number; bundle: number; privacyBlur: number };
    copyrightYear: number;
  };
  contact: {
    email: string | PendingValue;
  };
  /** Bunnen (MS3b, utkastet linje 405-444). Ankeret er maalet for «Snakk med oss». */
  footer: Footer;
  /**
   * Hjelpesidene (MS5a): kolonnen i bunnen, lenkene oeverst paa
   * spoersmaalssiden og «Hjelp» i appen (AppNav) bruker denne lista. Den
   * foerste lenken er startsiden for hjelp, dit «Hjelp» i appen gaar.
   */
  help: { title: string; links: readonly Link[] };
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

/**
 * Merkingen (MS3b, utkastet linje 247-266). Eksempelet paa teksten til
 * annonsen lagres som koder og lages med produktets funksjon
 * (app/lib/disclosure.ts), saa siden aldri viser en annen tekst enn den
 * megleren faar.
 */
export type Labeling = {
  _type: "labeling";
  anchor: string;
  eyebrow: string;
  title: string;
  lead: string;
  points: readonly Claim[];
  /** Guiden finnes ikke ennaa (MS5b): uten href. */
  guide: MaybeLink;
  /** Lenken til merkesiden (MS5a). */
  more: Link;
  picture: Picture;
  example: {
    title: string;
    /** Kodene i review.disclosure (KONTRAKT_MERKING). */
    base: string;
    time: string;
    edited: readonly string[];
    note: string;
  };
};

/** Den aerlige versjonen (MS3b, utkastet linje 272-282). */
export type Honest = {
  _type: "honest";
  title: string;
  lead: string;
  points: readonly string[];
};

/**
 * Prisene (MS3b, utkastet linje 287-339). Ingen tall i tekstene: {price},
 * {n} og {perImage} fylles fra site.offer (offer.ts).
 */
export type Pricing = {
  _type: "pricing";
  anchor: string;
  title: string;
  note: string;
  /** Mal med {price}. */
  priceFormat: string;
  free: { name: string; text: string; features: readonly string[] };
  single: { name: string; unit: string; text: string; features: readonly string[]; ctaLabel: string };
  bundle: {
    /** Mal med {n}. */
    name: string;
    badge: string;
    unit: string;
    /** Mal med {perImage}. */
    text: string;
    features: readonly string[];
    ctaLabel: string;
  };
  /** Mal med {price}. */
  addOn: string;
  chains: {
    anchor: string;
    eyebrow: string;
    title: string;
    text: string;
    points: readonly string[];
    cta: Link;
  };
};

/** Spoersmaal og svar paa forsiden (MS3b). Spoersmaalene ligger i faq.ts. */
export type FaqBlock = {
  _type: "faq";
  anchor: string;
  title: string;
  /** Mal med {email}. */
  lead: string;
  /** «Se alle spørsmål» (MS5a). */
  more: Link;
};

/**
 * Ett spoersmaal (faq.ts, Sanity: egen dokumenttype). `a` er null naar
 * svaret venter (pending). Plassene i svaret ({time}) fylles fra `slots`
 * eller fra prisene (offer.ts).
 */
export type FaqItem = {
  id: string;
  q: string;
  a: string | null;
  pending?: PendingKey;
  slots?: Record<string, PendingValue>;
  showOnHome: boolean;
};

/** Siste knapp (MS3b, utkastet linje 392-398). */
export type FinalCta = {
  _type: "finalCta";
  title: string;
  /** Mal med {n}. */
  text: string;
  secondary: Link;
};

/** Bunnen (MS3b, utkastet linje 405-444). */
export type Footer = {
  _type: "footer";
  anchor: string;
  tagline: string;
  columns: readonly { title: string; links: readonly MaybeLink[] }[];
  contact: { title: string; links: readonly Link[] };
  /** Mal med {year} og {companyName}. */
  copyright: string;
  companyName: string | PendingValue;
  note: string;
};

export type Home = {
  _type: "home";
  hero: Hero;
  trustStrip: TrustStrip;
  examples: Examples;
  moods: Moods;
  steps: Steps;
  services: Services;
  labeling: Labeling;
  honest: Honest;
  pricing: Pricing;
  faq: FaqBlock;
  finalCta: FinalCta;
};

// ---------------------------------------------------------------------------
// Innholdssidene (MS5a). Hver side er et eget dokument (Sanity: document type).
// ---------------------------------------------------------------------------

/** Tittel og beskrivelse for en side (metadata). Maler med {brand}. */
export type PageSeo = { title: string; description: string };

/** Spoersmaalssiden. Spoersmaalene ligger i faq.ts (alle, ikke bare showOnHome). */
export type FaqPage = {
  _type: "faqPage";
  seo: PageSeo;
  title: string;
  /** Mal med {email}. */
  lead: string;
};

/** En del av en innholdsside: en overskrift og avsnitt som kan vente. */
export type TextSection = { title: string; points: readonly Claim[] };

/**
 * Merkesiden. Bildet, eksempelet paa teksten og guiden hentes fra
 * home.labeling, og lista over hva som kan vaere redigert fra ordlista
 * (codes.disclosureEdited), saa ingenting staar to steder.
 */
export type LabelingPage = {
  _type: "labelingPage";
  seo: PageSeo;
  title: string;
  /** Mal med {brand}. */
  lead: string;
  mark: TextSection;
  adText: TextSection;
  list: TextSection;
  file: TextSection;
  original: TextSection;
  /** `faqId`: spoersmaalet det lenkes til (spoersmaalet er lenketeksten). */
  rules: TextSection & { faqId: string };
};

/** Kontaktsiden. E-posten og selskapsnavnet kommer fra site (ingen kopi). */
export type ContactPage = {
  _type: "contactPage";
  seo: PageSeo;
  title: string;
  lead: string;
  /** Maler med {email}. */
  groups: readonly { title: string; text: string; more?: Link }[];
  /** Overskriften over selskapsnavnet. */
  companyTitle: string;
};
