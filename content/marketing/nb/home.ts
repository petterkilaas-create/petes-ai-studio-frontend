import type { Home, ImagePlaceholder } from "../schema.ts";

// Forsiden, ordrett fra det godkjente utkastet (MARKEDSSIDE_UTKAST.dc.html).
// Linjenumrene staar ved hver seksjon.
//
// Toppen (linje 50-71): alt-tekstene er skrevet om for stua (Petter 02.10),
// etter utkastets stue-variant (linje 464 og 466). sliderValue er som i D2.
// Bildene er midlertidige (originalen er ogsaa laget med AI), saa de er
// merket pending "image" (Petter 02.10, valg E).
//
// MS3a: tillitsstripen, eksemplene, stemningene, tre steg og tjenestene.
// Bildene vi ikke har, er plassholdere med tekst fra utkastet. Teksten under
// stemningene sier ikke «Ekte eksempel» saa lenge bildet er en plassholder.

/** Plassholder for et eksempelbilde. `alt` er alt-teksten bildet skal faa. */
const ph = (placeholder: string, alt: string): ImagePlaceholder => ({ placeholder, alt, pending: "image" });

export const home = {
  _type: "home",
  hero: {
    _type: "hero",
    anchor: "topp",
    eyebrow: "AI-redigering for eiendomsmeglere",
    title: "Kveldsbilder av dagsbildene dine.",
    lead: "Du velger stemningen og godkjenner resultatet. Hvert bilde får synlig AI-merke og ferdig tekst til annonsen. Originalen røres aldri.",
    secondary: { label: "Se eksempler", href: "#eksempler" },
    freeNote: "{n} gratis kveldsbilder når du registrerer deg. Uten kort.",
    before: { image: "heroOriginal", alt: "Originalbildet av stua, tatt på dagtid", pending: "image" },
    after: {
      image: "heroEvening",
      alt: "Samme stue som kveldsbilde laget med AI, med tente lamper, fyr i peisen og AI-merke nede til venstre",
      pending: "image",
    },
    labels: { original: "Original", result: "Kveldsbilde", ai: "AI" },
    sliderLabel: "Flytt skillelinjen mellom originalen og kveldsbildet",
    sliderValue: "{n} % original",
    caption: "Dra i linjen, klikk i bildet eller bruk piltastene. Ekte eksempel, laget med tjenesten.",
  },

  // Linje 76-81.
  trustStrip: {
    _type: "trustStrip",
    label: "Kort fortalt",
    aiLabel: "AI",
    items: [
      { text: "Synlig AI-merke på hvert bilde", ai: true },
      { text: "Originalen røres aldri" },
      { text: "Du godkjenner hvert bilde før levering" },
      { text: "Data lagret i EU", pending: "dataRegion" },
    ],
  },

  // Linje 85-121 og 472-480. Stue bruker bildene fra toppen.
  examples: {
    _type: "examples",
    anchor: "eksempler",
    title: "Se forskjellen selv.",
    lead: "Eksempler laget med tjenesten, vist med AI-merket slik du får dem.",
    tabListLabel: "Velg eksempel",
    beforeCaption: "Original, tatt på dagtid",
    afterCaption: "Kveldsbilde laget med AI",
    aiLabel: "AI",
    tabs: [
      {
        id: "stue",
        label: "Stue",
        before: { image: "heroOriginal", alt: "Originalbildet av stua, tatt på dagtid", pending: "image" },
        after: {
          image: "heroEvening",
          alt: "Samme stue som kveldsbilde laget med AI, med tente lamper, fyr i peisen og AI-merke nede til venstre",
          pending: "image",
        },
      },
      {
        id: "kjokken",
        label: "Kjøkken",
        before: ph("Kjøkken, dagsbilde", "Originalbildet av kjøkkenet, tatt på dagtid"),
        after: ph("Kjøkken som kveldsbilde", "Samme kjøkken som kveldsbilde laget med AI, med AI-merke nede til venstre"),
      },
      {
        id: "soverom",
        label: "Soverom",
        before: ph("Soverom, dagsbilde", "Originalbildet av soverommet, tatt på dagtid"),
        after: ph("Soverom som kveldsbilde", "Samme soverom som kveldsbilde laget med AI, med AI-merke nede til venstre"),
      },
      {
        id: "balkong",
        label: "Balkong",
        before: ph("Balkong, dagsbilde", "Originalbildet av balkongen, tatt på dagtid"),
        after: ph("Balkong som kveldsbilde", "Samme balkong som kveldsbilde laget med AI, med AI-merke nede til venstre"),
      },
      {
        id: "hage",
        label: "Hage",
        before: ph("Hage, dagsbilde", "Originalbildet av hagen, tatt på dagtid"),
        after: ph("Hage som kveldsbilde", "Samme hage som kveldsbilde laget med AI, med AI-merke nede til venstre"),
      },
      {
        id: "fasade",
        label: "Fasade",
        before: ph("Fasade, dagsbilde", "Originalbildet av fasaden, tatt på dagtid"),
        after: ph(
          "Fasade som kveldsbilde",
          "Samme fasade som kveldsbilde laget med AI, med lys i vinduene og AI-merke nede til venstre"
        ),
      },
      {
        id: "hytte",
        label: "Hytte",
        before: ph("Hytte, dagsbilde", "Originalbildet av hytta, tatt på dagtid"),
        after: ph("Hytte som kveldsbilde", "Samme hytte som kveldsbilde laget med AI, med AI-merke nede til venstre"),
      },
    ],
  },

  // Linje 125-163 og 491-497. Kodene og navnene er appens (lib/dusk.ts og ordlista).
  moods: {
    _type: "moods",
    title: "Du bestemmer stemningen.",
    lead: "Velg tidspunkt og himmel. Lyset kommer bare fra vinduer og lamper som finnes i bildet.",
    groups: [
      {
        time: "early",
        label: "Tidlig skumring",
        groupLabel: "Himmel ved tidlig skumring",
        items: [
          {
            sky: "clear",
            name: "Klar blå time",
            note: "Dette er standardvalget.",
            picture: ph(
              "Stue, tidlig skumring med klar blå time",
              "Stue som kveldsbilde med klar blå time, laget med AI, med AI-merke nede til venstre"
            ),
          },
          {
            sky: "light_clouds",
            name: "Lette skyer",
            picture: ph(
              "Stue, tidlig skumring med lette skyer",
              "Stue som kveldsbilde med lette skyer, laget med AI, med AI-merke nede til venstre"
            ),
          },
          {
            sky: "pink_clouds",
            name: "Rosa skyer",
            note: "Rosa bare i tynne skyer, horisonten forblir lyseblå.",
            picture: ph(
              "Stue, tidlig skumring med rosa skyer",
              "Stue som kveldsbilde med rosa skyer, laget med AI, med AI-merke nede til venstre"
            ),
          },
        ],
      },
      {
        time: "late",
        label: "Sen kveld",
        groupLabel: "Himmel ved sen kveld",
        items: [
          {
            sky: "dark",
            name: "Mørk kveldshimmel",
            note: "Standardvalget for sen kveld.",
            picture: ph(
              "Fasade, sen kveld med mørk kveldshimmel",
              "Fasade som kveldsbilde med mørk kveldshimmel, laget med AI, med AI-merke nede til venstre"
            ),
          },
          {
            sky: "starry",
            name: "Stjernehimmel",
            picture: ph(
              "Fasade, sen kveld med stjernehimmel",
              "Fasade som kveldsbilde med stjernehimmel og lys i vinduene, laget med AI, med AI-merke nede til venstre"
            ),
          },
        ],
      },
    ],
    fireplaceNote: "Har rommet peis, velger du om den skal være tent.",
    placeholderCaption: "Eksempel kommer.",
  },

  // Linje 169-186.
  steps: {
    _type: "steps",
    title: "Fra dagsbilde til annonse i tre steg.",
    items: [
      { title: "Last opp", text: "Last opp dagsbildene fra fotografen. Originalene lagres urørt." },
      { title: "Velg stemning", text: "Velg tidspunkt og himmel. Bildet lages mens du jobber videre med annonsen." },
      {
        title: "Godkjenn og last ned",
        text: "Sammenlign med originalen og godkjenn, eller be om en ny runde. Du laster ned bildet med AI-merke og ferdig tekst til annonsen.",
      },
    ],
  },

  // Linje 192-240. «Mer om …» vises som tekst til tjenestesidene finnes (MS5).
  services: {
    _type: "services",
    anchor: "tjenester",
    title: "Tjenester",
    lead: "To tjenester er klare i dag. Flere kommer.",
    availableLabel: "Tilgjengelig",
    soonLabel: "Kommer snart",
    items: [
      {
        id: "scene_transform",
        title: "Kveldsbilde",
        text: "Dagsbildet blir kveldsbilde, med himmel i blåtimen og lys i vinduer og lamper som finnes i bildet.",
        status: "available",
        picture: ph(
          "Fasade som kveldsbilde",
          "Fasade som kveldsbilde laget med AI, med lys i vinduene og AI-merke nede til venstre"
        ),
        more: { label: "Mer om kveldsbilder" },
      },
      {
        id: "privacy_blur",
        title: "Skjul ansikter og skilt",
        text: "Gjør ansikter, familiebilder og bilskilt uskarpe før bildene publiseres. Personvern for selgeren, uten manuell retusj.",
        status: "available",
        picture: ph("Bilskilt gjort uskarpt", "Bil med bilskiltet gjort uskarpt før publisering"),
        more: { label: "Mer om å skjule ansikter og skilt" },
      },
      { id: "virtual_stage", title: "Digital styling", text: "Møbler tomme rom digitalt.", status: "soon" },
      { id: "video", title: "Video", text: "Korte filmer av boligen fra bildene du har.", status: "soon" },
      { id: "copywriter", title: "Annonsetekst", text: "Utkast til tekst for boligannonsen, på norsk.", status: "soon" },
    ],
  },
} as const satisfies Home;
