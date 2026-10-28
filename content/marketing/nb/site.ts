import type { Site } from "../schema.ts";

// Tekstene er hentet ordrett fra det godkjente utkastet
// (MARKEDSSIDE_UTKAST.dc.html, linje 5 og 28-40). 404-teksten er godkjent av
// Petter 02.10. «Logg inn» og «Prøv gratis» gaar til /start til registreringen
// kobles paa (MS6). Lenkene til ankre vises bare naar seksjonen finnes
// (links.ts): i MS3a ikke #priser og #kjeder. MS3: menyknappen, merkelappene
// for det som venter (utkastets [BEKREFT REGION] osv.) og bildeplassholderen.
// MS3b: prisene og aarstallet (de eneste tallene paa siden), kontakt og
// bunnen (linje 405-444). Sidene i bunnen finnes ikke ennaa (MS5) og vises
// som tekst uten lenke. Spraakvelgeren vises ikke foer det finnes flere spraak.
// MS4: alt-teksten til delingsbildet, satt sammen av merket og overskriften
// (Petter 02.10). MS5a: hjelpesidene (MS5_TEKSTER.md §4, godkjent av Petter
// 04.10) og skjermleserteksten paa merket paa undersidene. F1: knappen som
// pauser og spiller av videoloekka (MarketingVideo). F2: «Se filmen» i
// menyen, til filmseksjonen (#film). F3: ny fanetittel, egen beskrivelse og
// egen overskrift i delingsbildet (ogTitle), ikke lenger fra toppen.
export const site = {
  _type: "site",
  seo: {
    title: "{brand} – AI-studio for eiendomsmeglere",
    description:
      "Kveldsbilder, årstider, digital styling og blå himmel for eiendomsmeglere. Synlig AI-merke på hvert bilde, og du godkjenner alt før levering.",
    // Dag 58 (Petter 28.10): samme overskrift som toppen, tre linjer i bildet (valg A).
    ogTitle: "Kveldsbilder, årstider og digital styling til boligannonsen. Ett sted.",
    ogTitleLines: ["Kveldsbilder, årstider og", "digital styling til", "boligannonsen. Ett sted."],
    ogImageAlt: "{brand}: {title}",
  },
  topBar: {
    _type: "topBar",
    logoLabel: "{brand}, til toppen av siden",
    logoHref: "#topp",
    logoHomeLabel: "{brand}, til forsiden",
    navLabel: "Hovedmeny",
    links: [
      { label: "Tjenester", href: "#tjenester" },
      { label: "Se filmen", href: "#film" },
      { label: "Eksempler", href: "#eksempler" },
      { label: "Priser", href: "#priser" },
      { label: "For kjeder og partnere", href: "#kjeder" },
    ],
    login: { label: "Logg inn", href: "/start" },
    menuLabel: "Meny",
  },
  cta: { label: "Prøv gratis", href: "/start" },
  offer: {
    freeImages: 3,
    bundleCount: 3,
    prices: { free: 0, single: 149, bundle: 349, privacyBlur: 29 },
    copyrightYear: 2026,
  },
  contact: {
    email: { pending: "email" },
  },
  footer: {
    _type: "footer",
    anchor: "kontakt",
    tagline: "AI-studio for eiendomsmeglere.",
    columns: [
      {
        title: "Tjenester",
        links: [
          // F6b: tjenestene som paa forsiden (designet linje 415-422). Dag 58
          // (F2): bare de som kan bestilles, i samme rekkefoelge som kortene.
          // Skjul ansikter og skilt er ikke paa forsiden (Petter 20.10, 2e).
          { label: "Kveldsbilde", href: "#tjenester" },
          { label: "Årstider", href: "#tjenester" },
          { label: "Digital styling", href: "#tjenester" },
          { label: "Blå himmel", href: "#tjenester" },
          { label: "Priser", href: "#priser" },
          { label: "Guide: AI-bilder i boligannonsen" },
        ],
      },
      {
        title: "Trygghet",
        links: [
          { label: "Personvern" },
          { label: "Vilkår" },
          { label: "Databehandleravtale" },
          { label: "Underleverandører" },
        ],
      },
    ],
    contact: {
      title: "Kontakt",
      links: [
        { label: "For kjeder og partnere", href: "#kjeder" },
        { label: "Logg inn", href: "/start" },
      ],
    },
    copyright: "© {year} {companyName}",
    companyName: { pending: "companyName" },
    // F6b: stemmer foerst naar probebildene er byttet (auditen §3 punkt 3).
    note: { text: "Alle eksempelbilder er laget med tjenesten og merket som AI.", pending: "image" },
  },
  help: {
    title: "Hjelp",
    links: [
      { label: "Spørsmål og svar", href: "/no/sporsmal-og-svar" },
      { label: "Slik merker vi bildene", href: "/no/merking" },
      { label: "Kontakt", href: "/no/kontakt" },
    ],
  },
  pendingLabels: {
    dataRegion: "[BEKREFT REGION]",
    legal: "[JURIDISK SJEKK]",
    email: "[E-POST]",
    companyName: "[SELSKAPSNAVN]",
    time: "[TID]",
    trainingAnswer: "[SVAR: avklares mot vilkårene til modell-leverandørene]",
    storageAnswer: "[SVAR: dataregion og lagringstid bekreftes]",
    image: "[BILDE]",
    price: "[PRIS]",
  },
  imagePlaceholder: "Eksempelbilde kommer",
  video: { play: "Spill av", pause: "Sett på pause" },
  notFound: {
    _type: "notFound",
    pageTitle: "Fant ikke siden · {brand}",
    title: "Fant ikke siden",
    text: "Adressen finnes ikke, eller siden er flyttet.",
    toApp: { label: "Til appen", href: "/start" },
    toHome: { label: "Til forsiden", href: "/no" },
  },
} as const satisfies Site;
