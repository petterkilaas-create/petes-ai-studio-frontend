import type { ContactPage } from "../schema.ts";

// Kontaktsiden (MS5a). Teksten er godkjent av Petter 04.10 (MS5_TEKSTER.md §3
// med endringene i MS5_TEKSTER_SVAR.md). E-posten og selskapsnavnet fylles
// fra site og venter til de er avklart. Ingen telefon, adresse, org.nr. eller
// svartid, og ikke noe skjema (det krever backend).
export const contactPage = {
  _type: "contactPage",
  seo: {
    title: "Kontakt – {brand}",
    description: "Kontakt {brand} om bilder og bestillinger, eller om en løsning for kjeden.",
  },
  title: "Kontakt",
  lead: "Skriv til oss på e-post.",
  groups: [
    {
      title: "Megler",
      text: "Spørsmål om et bilde, en bestilling eller kontoen din? Skriv til {email}.",
      more: { label: "Mange svar finner du under Spørsmål og svar.", href: "/no/sporsmal-og-svar" },
    },
    {
      title: "Kjeder og partnere",
      text: "Vil kjeden ha løsningen med egen logo, egne farger og egen nettadresse, eller pris etter volum? Skriv til {email}.",
    },
  ],
  companyTitle: "Selskapet",
} as const satisfies ContactPage;
