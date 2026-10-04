import type { LabelingPage } from "../schema.ts";

// Merkesiden (MS5a). Teksten er godkjent av Petter 04.10 (MS5_TEKSTER.md §2
// med endringene i MS5_TEKSTER_SVAR.md). Kildene staar i MS5_TEKSTER.md.
// Bildet, eksempelet paa teksten og guiden hentes fra home.labeling, og lista
// over hva som kan vaere redigert fra ordlista (codes.disclosureEdited).
export const labelingPage = {
  _type: "labelingPage",
  seo: {
    title: "Slik merker vi bildene – {brand}",
    description:
      "Hvert kveldsbilde har et synlig AI-merke og en ferdig tekst til annonsen som sier hva som er redigert.",
  },
  title: "Slik merker vi bildene",
  lead: "Hvert kveldsbilde fra {brand} er merket på to måter: med et synlig AI-merke i bildet og med en kort tekst til annonsen. Her ser du hva som står hvor.",
  mark: {
    title: "Merket i bildet",
    points: [
      {
        text: "Nede til venstre i bildet står et rundt AI-merke. Det er det eneste som er lagt på bildet: ingen logo og ingen annen tekst.",
      },
      { text: "Merket står på bildet du laster ned, og på forhåndsvisningene i appen." },
    ],
  },
  adText: {
    title: "Teksten til annonsen",
    points: [
      { text: "Når du har godkjent bildet, får du en ferdig tekst som du kopierer inn i annonsen." },
      { text: "Teksten sier at bildet er et kveldsbilde laget med AI fra et dagsbilde, og hva som er redigert." },
    ],
  },
  list: {
    title: "Hva lista kan inneholde",
    points: [
      {
        text: "Lista tar bare med det vi faktisk ba om å endre i bildet. Er ingenting av dette endret, står bare den første setningen.",
      },
    ],
  },
  file: {
    title: "I fila",
    points: [
      {
        text: "Bildet du laster ned, har også opplysninger i fila (metadata) som sier at det er laget med AI, etter IPTC-standarden. Den første setningen i teksten står der også.",
      },
    ],
  },
  original: {
    title: "Originalen",
    points: [{ text: "Originalen lagres urørt, og du ser den ved siden av kveldsbildet før du godkjenner." }],
  },
  rules: {
    title: "Reglene",
    points: [{ text: "Laget for EUs krav om åpenhet rundt AI-innhold.", pending: "legal" }],
    faqId: "lov",
  },
} as const satisfies LabelingPage;
