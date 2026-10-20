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
export type ImageKey =
  | "heroOriginal"
  | "heroEvening"
  | "merkingEvening"
  | "pairEveningOriginal"
  | "pairEveningResult"
  | "pairCleanupOriginal"
  | "pairCleanupResult"
  | "pairStylingOriginal"
  | "pairStylingResult"
  | "filmPoster"
  | "loopPoster";

/** Nøklene til videoene i videos.ts (filene ligger i public/no/film/). */
export type VideoKey = "film" | "loop";

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

/**
 * En video fra videos.ts (F1). `label` er aria-label paa videoen.
 * `pending: "image"`: videoen viser et midlertidig bilde (styling-bildet).
 */
export type VideoRef = { video: VideoKey; label: string; pending?: "image" };

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
    /** Beskrivelsen til soekemotorer og deling (F3; foer var det hero.lead). 50-160 tegn. */
    description: string;
    /**
     * Overskriften i delingsbildet (F3; foer var det hero.title). Staar paa
     * en linje i bildet, saa testen har en lengdegrense.
     */
    ogTitle: string;
    /** Alt-teksten til delingsbildet (MS4). Mal med {brand} og {title} = ogTitle. */
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
    /** Antall gratis bilder ved registrering (gjelder alle tjenestene). */
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
  /** Skjermlesertekstene paa pause- og avspillingsknappen til loekka (F1, MarketingVideo). */
  video: { play: string; pause: string };
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

/**
 * En rute i mosaikken i toppen (F3, designet Main.dc.html linje 70-90).
 * `label` er etiketten oeverst til venstre. Plassen i rutenettet foelger
 * rekkefoelgen (HeroMosaic.tsx); den foerste ruta er det store bildet.
 */
export type MosaicTile =
  | { label: string; image: ImageRef }
  | { label: string; quote: string }
  | { label: string; video: VideoRef };

export type Hero = {
  _type: "hero";
  /** Ankeret topplinjen peker paa (logoen). */
  anchor: string;
  eyebrow: string;
  title: string;
  /** Vises i kursiv i samme overskrift, etter et mellomrom (F3). */
  titleEmphasis: string;
  lead: string;
  secondary: Link;
  /** Merknaden under knappene. Mal med {n} = offer.freeImages. */
  freeNote: string;
  /** Mosaikken til hoeyre (F3). `label` er aria-label paa gruppen. */
  mosaic: { label: string; tiles: readonly MosaicTile[] };
  /** Merkelappen paa resultatbildene i mosaikken (ikke paa bildet med AI-merket i bildet). */
  aiLabel: string;
  /*
   * Slideren (MS2) er ikke lenger i toppen (F3). Feltene under brukes ikke
   * paa siden til F5 (foer/etter-fanene), men blir staaende fordi fanen Stue
   * i eksemplene har de samme bildene (testen sjekker det).
   */
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

/**
 * Mediet oeverst i et tjenestekort (F4, designet Main.dc.html linje 104-256).
 * `kind` skiller dem (Services.tsx).
 */
export type ServiceMedia =
  | {
      kind: "split";
      /** Resultatet, til venstre: AI-merket i bildet staar nede til venstre (auditen §3). */
      after: ImageRef;
      /** Originalen, klippet til hoeyre halvdel. */
      before: ImageRef;
      labels: { after: string; before: string };
    }
  | { kind: "video"; video: VideoRef; label: string }
  | { kind: "ad"; image: ImageRef; label: string; title: string; excerpt: string }
  | {
      kind: "plan";
      /** aria-label paa tegningen (PlanIllustration.tsx). */
      label: string;
      /** Rommene staar i rekkefoelgen tegningen plasserer dem. */
      sketch: { caption: string; rooms: readonly string[] };
      plan: { caption: string; rooms: readonly string[] };
    };

type ServiceItem = {
  /** Tjenestens kode i appen (ordlista `service.<id>`), eller en egen id paa markedssiden. */
  id: string;
  /** Overlinja paa kortet (Petter 20.10, 2a). */
  studio: string;
  title: string;
  text: string;
  media: ServiceMedia;
};

/**
 * Tjenestene som kort i studioer (F4, designet Main.dc.html linje 104-256).
 * Alle vises som om de er klare (Petter dag 48): en `available` har
 * bestillingslenken (`orderLabel` til site.cta), en `soon` har
 * `earlyAccess` (kontaktsiden).
 */
export type Services = {
  _type: "services";
  anchor: string;
  title: string;
  lead: string;
  /** Lappen oeverst til venstre paa resultatbildene i de delte bildene. */
  aiLabel: string;
  /** «Få tidlig tilgang» paa tjenestene som ikke er klare (Petter 20.10, 2b). */
  earlyAccess: Link;
  /** Linja under kortene. */
  also: { label: string; text: string };
  items: readonly (
    | (ServiceItem & { status: "available"; orderLabel: string })
    | (ServiceItem & { status: "soon" })
  )[];
};

/**
 * Filmseksjonen (F2, designet Main.dc.html linje 258-277), paa kveldsblaatt.
 * Filmen er uten lyd; ingressen og stegene er tekstversjonen (WCAG 1.2.1).
 * Nummeret paa stegene lages av rekkefoelgen.
 */
export type Film = {
  _type: "film";
  anchor: string;
  eyebrow: string;
  title: string;
  lead: string;
  video: VideoRef;
  /** Linja under filmen. */
  caption: string;
  steps: readonly string[];
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
  film: Film;
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
