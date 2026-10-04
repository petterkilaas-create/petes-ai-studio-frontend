import type { FaqItem, FaqPage } from "../schema.ts";

// Spoersmaal og svar (MS3b), ordrett fra utkastet (MARKEDSSIDE_UTKAST.dc.html,
// linje 353-386). Forsiden viser dem med showOnHome; senere ogsaa en egen
// side (MS5). Svaret om pris har ingen tall: de fylles fra site.offer
// (offer.ts), og «tre» er blitt «{bundleCount} kveldsbilder» (Petter 02.10,
// valg D). Svar som venter, er merket med pending.
export const faq = [
  {
    id: "lov",
    q: "Er det lov å bruke AI-redigerte bilder i boligannonser?",
    a: "Ja, så lenge bildet ikke gir et feil inntrykk av boligen og det går tydelig fram at det er redigert. Derfor har hvert bilde et synlig AI-merke, og du får en ferdig tekst til annonsen.",
    pending: "legal",
    showOnHome: true,
  },
  {
    id: "merking",
    q: "Hvordan merkes bildene?",
    // MS5a (MS5_TEKSTER_SVAR §3): siste setning rettet.
    a: "Med et synlig AI-merke i hjørnet av bildet, og en kort tekst som sier hva som er endret, for eksempel at himmel og lamper er redigert. Teksten får du når du godkjenner bildet, klar til å kopiere inn i annonsen.",
    showOnHome: true,
  },
  {
    id: "pris",
    q: "Hva koster det?",
    a: "Et kveldsbilde koster {single} kr eks. mva., og {bundleCount} kveldsbilder i samme oppdrag koster {bundle} kr. Skjul ansikter og skilt koster {privacyBlur} kr per bilde. Kjeder og partnere får pris etter volum.",
    showOnHome: true,
  },
  {
    id: "tid",
    q: "Hvor lang tid tar det?",
    a: "Vanligvis {time} fra du har valgt stemning til bildet er klart.",
    slots: { time: { pending: "time" } },
    showOnHome: true,
  },
  {
    id: "fornoyd",
    q: "Hva om jeg ikke er fornøyd?",
    a: "Du ser hvert bilde mot originalen før du godkjenner det. Er du ikke fornøyd, ber du om en ny runde. Den er inkludert i prisen.",
    showOnHome: true,
  },
  {
    id: "bilder",
    q: "Hvilke bilder passer?",
    a: "Fasader og rom tatt i dagslys. Vi tenner bare vinduer og lamper som finnes i bildet.",
    showOnHome: true,
  },
  {
    id: "trening",
    q: "Brukes bildene til å trene AI?",
    a: null,
    pending: "trainingAnswer",
    showOnHome: true,
  },
  {
    id: "lagring",
    q: "Hvor lagres bildene?",
    a: null,
    pending: "storageAnswer",
    showOnHome: true,
  },
  {
    id: "kjede",
    q: "Kan kjeden få sin egen løsning?",
    a: "Ja. Kjeder og partnere kan få løsningen med egen logo, egne farger og egen nettadresse, og bildene levert i kjedens profil. Ta kontakt for pris.",
    showOnHome: true,
  },
] as const satisfies readonly FaqItem[];

// Spoersmaalssiden (MS5a, MS5_TEKSTER.md §1, godkjent av Petter 04.10). Siden
// viser alle spoersmaalene over, i samme rekkefoelge.
export const faqPage = {
  _type: "faqPage",
  seo: {
    title: "Spørsmål og svar – {brand}",
    description: "Svar om kveldsbilder for eiendomsmeglere: merking, pris, tid og hvilke bilder som passer.",
  },
  title: "Spørsmål og svar",
  lead: "Her finner du svarene om kveldsbilder, merking og pris. Finner du ikke svaret? Skriv til {email}.",
} as const satisfies FaqPage;
