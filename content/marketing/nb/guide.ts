import type { GuidePage } from "../schema.ts";

// Veiledningen for meglere (Dag 59, FE_BRUKERVEILEDNING_PROMPT). Ordren fra
// ny ordre til nedlasting. Kildene er sidene og ordlista i appen: ordene i
// «» er knapper og overskrifter derfra (testen sjekker det), og statusnavnene
// hentes fra ordlista (assignment.status.*). Nedlastingen er fra FE-5
// (RAPPORT_FE5.md). Grensene ({maxImages}, {maxMb}, {maxBoxes}) fylles fra
// konstantene i appen (GuidePage.tsx). «Angre godkjenning» finnes i backend,
// men ikke i appen ennaa, og er derfor ikke med.
export const guidePage = {
  _type: "guidePage",
  seo: {
    title: "Veiledning – {brand}",
    description:
      "Steg for steg: lag en ordre for boligen, last opp bildene, velg tjenester, godkjenn resultatene og last ned alt i én ZIP.",
  },
  title: "Slik bruker du {brand}",
  lead: "Fra bildene fra fotografen til ferdige filer og tekst til annonsen. Én ordre samler bildene fra ett boligoppdrag.",
  tocLabel: "Innhold",
  sections: [
    {
      id: "ny-ordre",
      title: "Lag en ordre for boligen",
      steps: [
        "Gå til «Ordrer» i menyen og trykk «Ny ordre».",
        "Skriv adressen til boligen. Oppdragsnummeret er valgfritt.",
        "Trykk «Videre til bildene».",
      ],
      notes: ["Adressen blir navnet på ordren og på filene du laster ned."],
    },
    {
      id: "last-opp",
      title: "Last opp bildene",
      steps: [
        "Dra bildene fra fotografen inn på siden, eller trykk «Velg filer».",
        "Skriv rommet under hvert bilde, for eksempel Stue.",
        "Dra bildene for å endre rekkefølgen. Rekkefølgen blir nummereringen i leveransen.",
        "Trykk «Videre til tjenester».",
      ],
      notes: [
        "JPG eller PNG, høyst {maxMb} MB per bilde og {maxImages} bilder per ordre.",
        "Et bilde som ikke ble lastet opp, kan du laste opp på nytt fra lista.",
        "Du kan også flytte et bilde med menyen på bildet: først, opp, ned eller sist.",
        "«Fjern» tar et bilde ut av ordren. Et bilde som har resultater, blir værende.",
      ],
    },
    {
      id: "tjenester",
      title: "Velg tjenester på bildebrettet",
      steps: [
        "Kryss av bildene du vil gjøre noe med. «Velg alle» krysser av alle.",
        "Trykk «Velg» på en tjeneste, velg det tjenesten spør om, og trykk «Legg til».",
        "Gjenta for de andre tjenestene og bildene. Hver tjeneste på et bilde blir et eget resultat.",
        "Trykk «Neste: kontroller».",
      ],
      notes: [
        "Årstider er for bilder tatt utendørs: fasade, hage og balkong. Hver årstid du velger, blir et eget bilde. Bilder tatt om vinteren kan ikke brukes ennå.",
        "Skjul ansikter sladder personer og portretter. Den er gratis og godkjent med en gang.",
        "«Har fra før» viser tjenestene bildet allerede har.",
        "Valgene huskes i denne nettleseren til du starter, også om du går fra siden. På en annen PC eller i en annen nettleser er de ikke med.",
      ],
    },
    {
      id: "start",
      title: "Kontroller og start",
      steps: [
        "Se over bestillingen per tjeneste eller per bilde. Trykk «Til tjenestene» for å endre noe.",
        "Se hvor mange av gratisbildene bestillingen bruker.",
        "Trykk «Start behandling».",
      ],
      notes: [
        "«Finnes allerede» betyr at bildet har denne tjenesten med det samme valget fra før. Den startes ikke på nytt, og kvoten er ikke trukket.",
        "Skjul ansikter trekker ikke kvoten.",
        "Får du ikke svar fra serveren, kan du prøve igjen. Det som alt er startet, startes ikke to ganger.",
      ],
    },
    {
      id: "resultater",
      title: "Følg resultatene på bildesiden",
      steps: [
        "Resultatene kommer under bildene etter hvert som de blir klare. Trykk «Oppdater» for å se de nyeste.",
        "Trykk «Åpne» på et resultat for å se det mot originalen.",
      ],
      statuses: [
        { status: "processing", text: "Bildet lages. Når du har rettet et bilde, står det Ny versjon behandles." },
        { status: "toReview", text: "Resultatet er klart. Åpne det, sammenlign med originalen og godkjenn eller rett det." },
        { status: "needsAnswer", text: "Bildet er ikke laget ennå. Åpne det og svar på spørsmålet, for eksempel om peisen skal være tent." },
        { status: "approved", text: "Du har godkjent resultatet, og det kommer med når du laster ned." },
        { status: "notUsed", text: "Du har avvist resultatet, og det kommer ikke med." },
        { status: "failed", text: "Resultatet kunne ikke lages. Du kan bestille tjenesten på nytt fra bildebrettet." },
      ],
      notes: ["Vil du bestille mer til ordren, trykker du «Bestill flere tjenester»."],
    },
    {
      id: "godkjenn",
      title: "Godkjenn eller rett",
      steps: [
        "Sammenlign resultatet med originalen. «Hold for original» viser originalen så lenge du holder.",
        "Gå gjennom sjekklista, kryss av for «Jeg har sammenlignet bildet med originalen.» og trykk «Godkjenn».",
        "Er noe feil, trykker du «Korriger bildet» og velger hvordan.",
        "Vil du ikke bruke resultatet, trykker du «Avvis».",
      ],
      notes: [
        "«Endre valgene», «Korriger lyskildene» eller «Lag et nytt forsøk» lager bildet på nytt fra originalen. Hvilket av dem du ser, kommer an på tjenesten.",
        "«Marker og beskriv» endrer bare det du markerer. Dra en boks rundt det som skal endres, og skriv hva som skal endres. Du kan markere opptil {maxBoxes} ting. Alt utenfor boksene blir som før.",
        "«Som i originalen» henter tilbake det som var i originalen i boksen, også lys og ild. Bruk det når noe er lagt til som ikke skal være der. Det er gratis.",
        "«Prøv igjen» gjør én markert endring på nytt. Det bruker én runde.",
        "Du har tre runder til å rette et resultat. Hvor mange som er igjen, står når du retter. Går en runde galt, har du fortsatt forrige bilde, og runden er ikke brukt.",
      ],
    },
    {
      id: "last-ned",
      title: "Last ned",
      steps: [
        "Trykk «Last ned» på ordren i ordrelista eller øverst på bildesiden.",
        "Se over fillista. Slå av «Med» for et resultat du ikke vil ha med. Originalene er alltid med.",
        "Trykk «Last ned ZIP».",
      ],
      notes: [
        "ZIP-en har alle originalene og de bearbeidingene du har godkjent, som JPEG i full oppløsning. Originalen ligger foran sine bearbeidinger.",
        "Filnavnene følger adressen, rekkefølgen og rommet. storgata-12_01a_stue_original.jpg er originalen til bilde 1, og storgata-12_01b_stue_styling-japandi_r01.jpg er den første bearbeidingen av det. Æ, ø og å blir ae, o og aa.",
        "Bearbeidede bilder har AI-merket. Skjul ansikter er uten merke.",
        "Det som ikke er godkjent ennå, står som en merknad under bildet, med en lenke dit du kan gjøre det ferdig.",
        "ZIP-en kan bli stor. Last den ned på en PC når ordren har mange bilder.",
        "«Last ned fil» gir ett merket bilde. Originalene og Skjul ansikter finnes bare i ZIP-en. På godkjenningssiden gir «Last ned merket bilde» det samme.",
      ],
    },
    {
      id: "merking",
      title: "Merking og tekst til annonsen",
      steps: [
        "Når du har godkjent et bilde, står «Tekst til annonsen» på godkjenningssiden.",
        "Trykk «Kopier» og lim teksten inn i annonsen sammen med bildet.",
      ],
      notes: [
        "Bearbeidede bilder har et synlig AI-merke nede til venstre. Teksten sier hva som er redigert.",
      ],
      more: { label: "Les mer om merkingen", href: "/no/merking" },
    },
  ],
} as const satisfies GuidePage;
