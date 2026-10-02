import type { Site } from "../schema.ts";

// Tekstene er hentet ordrett fra det godkjente utkastet
// (MARKEDSSIDE_UTKAST.dc.html, linje 5 og 28-40). 404-teksten er godkjent av
// Petter 02.10. «Logg inn» og «Prøv gratis» gaar til /start til registreringen
// kobles paa (MS6). Ankrene peker paa seksjonene som kommer i MS3.
export const site = {
  _type: "site",
  seo: {
    title: "{brand} – kveldsbilder for eiendomsmeglere",
  },
  topBar: {
    _type: "topBar",
    logoLabel: "{brand}, til toppen av siden",
    logoHref: "#topp",
    navLabel: "Hovedmeny",
    links: [
      { label: "Tjenester", href: "#tjenester" },
      { label: "Eksempler", href: "#eksempler" },
      { label: "Priser", href: "#priser" },
      { label: "For kjeder og partnere", href: "#kjeder" },
    ],
    login: { label: "Logg inn", href: "/start" },
  },
  cta: { label: "Prøv gratis", href: "/start" },
  offer: {
    freeImages: 3,
  },
  notFound: {
    _type: "notFound",
    pageTitle: "Fant ikke siden · {brand}",
    title: "Fant ikke siden",
    text: "Adressen finnes ikke, eller siden er flyttet.",
    toApp: { label: "Til appen", href: "/start" },
    toHome: { label: "Til forsiden", href: "/no" },
  },
} as const satisfies Site;
