import type { FaqItem, FaqPage } from "../schema.ts";

// Spoersmaal og svar (MS3b), ordrett fra utkastet (MARKEDSSIDE_UTKAST.dc.html,
// linje 353-386). Forsiden viser dem med showOnHome; senere ogsaa en egen
// side (MS5). Svaret om pris har ingen tall: de fylles fra site.offer
// (offer.ts), og «tre» er blitt «{bundleCount} kveldsbilder» (Petter 02.10,
// valg D). Svar som venter, er merket med pending. F6b: forsiden viser fire
// (lov, eierskap, fornoyd og lagring, som i designet); spoersmaalssiden alle.
export const faq = [
  // TG-NEW-223 (Petter 19.10): svaret bygger på Forbrukertilsynets veileder
  // for boligannonser (2026); ikke juridisk vurdert.
  {
    id: "lov",
    q: "Er det lov å bruke AI-redigerte bilder i boligannonser?",
    a: "Ja, så lenge bildet ikke gir et feil inntrykk av boligen og det går tydelig fram hva som er redigert. Forbrukertilsynets veileder sier at et redigert bilde skal ha en tydelig forklaring om at og hva som er redigert. Det holder ikke å skrive at AI er brukt. Derfor har hvert bilde et synlig AI-merke, og du får en ferdig tekst som sier konkret hva som er endret. Ansvaret for annonsen ligger hos megleren.",
    showOnHome: true,
  },
  // F6b (Petter 20.10, 2f): forslaget fra Cowork. Lappen [JURIDISK SJEKK]
  // staar til vilkaarene er skrevet.
  {
    id: "eierskap",
    q: "Hvem eier bildene?",
    a: "Ikke vi. Rettighetene til originalfotoet ligger hos deg eller fotografen, som før, og det redigerte bildet kan du bruke på de samme vilkårene som originalen. Du må ha lov til å bruke og redigere bildet du laster opp. Ofte står det i avtalen med fotografen.",
    pending: "legal",
    showOnHome: true,
  },
  {
    id: "merking",
    q: "Hvordan merkes bildene?",
    // MS5a (MS5_TEKSTER_SVAR §3): siste setning rettet.
    a: "Med et synlig AI-merke i hjørnet av bildet, og en kort tekst som sier hva som er endret, for eksempel at himmel og lamper er redigert. Teksten får du når du godkjenner bildet, klar til å kopiere inn i annonsen.",
    showOnHome: false,
  },
  {
    id: "pris",
    q: "Hva koster det?",
    a: "Et kveldsbilde koster {single} kr eks. mva., og {bundleCount} kveldsbilder i samme oppdrag koster {bundle} kr. Skjul ansikter koster {privacyBlur} kr per bilde. Kjeder og partnere får pris etter volum.",
    showOnHome: false,
  },
  {
    id: "tid",
    q: "Hvor lang tid tar det?",
    a: "Vanligvis {time} fra du har valgt stemning til bildet er klart.",
    slots: { time: { pending: "time" } },
    showOnHome: false,
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
    showOnHome: false,
  },
  {
    id: "trening",
    q: "Brukes bildene til å trene AI?",
    a: null,
    pending: "trainingAnswer",
    showOnHome: false,
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
    showOnHome: false,
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
