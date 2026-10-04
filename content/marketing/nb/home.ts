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
// MS3b: merkingen, den aerlige versjonen, prisene, spoersmaal og svar (selve
// spoersmaalene i faq.ts) og siste knapp. Ingen tall i tekstene: prisene og
// antallene fylles fra site.offer.
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
        text: "Sammenlign med originalen og godkjenn, eller be om en ny runde. Du laster ned bildet med AI-merket og kopierer den ferdige teksten til annonsen.",
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

  // Linje 247-266. Eksempelteksten lages av kodene med produktets funksjon
  // (app/lib/disclosure.ts) og blir «Kveldsbilde laget med AI fra dagsbilde.
  // Himmel og lamper i rommet er redigert.» Bildet er en plassholder (valg C).
  labeling: {
    _type: "labeling",
    anchor: "merking",
    eyebrow: "Merking",
    title: "Merket riktig. Hver gang.",
    lead: "Kjøpere skal kunne stole på bildene i annonsen. Derfor har hvert bilde vi lager et synlig AI-merke, og du får en ferdig tekst som sier hva som er endret.",
    points: [
      { text: "AI-merket står på bildet, også i forhåndsvisningen." },
      // MS5a (MS5_TEKSTER_SVAR §3): fila har bare grunnsetningen; hele
      // teksten faar megleren paa godkjenningssiden.
      { text: "Teksten til annonsen får du når du godkjenner bildet." },
      { text: "Originalen lagres urørt, og du ser den ved siden av kveldsbildet før du godkjenner." },
      { text: "Laget for EUs krav om åpenhet rundt AI-innhold.", pending: "legal" },
    ],
    guide: { label: "Les guiden: AI-bilder i boligannonsen" },
    more: { label: "Les mer om merkingen", href: "/no/merking" },
    picture: ph(
      "Stue som kveldsbilde med AI-merket",
      "Stue som kveldsbilde laget med AI, med AI-merket synlig nede til venstre"
    ),
    example: {
      title: "Tekst til annonsen",
      base: "evening_from_day",
      time: "early",
      edited: ["sky", "interior_lamps"],
      note: "Klar til å kopiere når bildet er godkjent.",
    },
  },

  // Linje 272-282.
  honest: {
    _type: "honest",
    title: "Den ærlige versjonen.",
    lead: "AI kan mye. Dette lar vi være, fordi bildene skal vise boligen slik den er.",
    points: [
      "Vi lager ikke vinduer, rom eller utsikt som ikke finnes.",
      "Vi endrer ikke arkitektur, materialer eller omgivelser.",
      "Lyset kommer bare fra vinduer og lamper som allerede er i bildet.",
      "Vi skjuler ikke skader eller feil ved boligen.",
    ],
  },

  // Linje 287-339. Tallene staar i site.offer; «Ca. {perImage}» regnes ut
  // (offer.ts). «Prøv gratis først» gaar dit «Prøv gratis» gaar (site.cta).
  pricing: {
    _type: "pricing",
    anchor: "priser",
    title: "Åpne priser.",
    note: "Alle priser er eks. mva. Du godkjenner hvert bilde før du laster det ned.",
    priceFormat: "{price} kr",
    free: {
      name: "Prøv gratis",
      text: "{n} kveldsbilder når du registrerer deg. Nok til en hel annonse. Uten kort.",
      features: ["Samme bilde som betalende får", "AI-merke og tekst til annonsen"],
    },
    single: {
      name: "Kveldsbilde",
      unit: "per bilde",
      text: "For et enkelt bilde, når du trenger det.",
      features: ["Velg tidspunkt og himmel", "Én ny runde inkludert", "AI-merke og tekst til annonsen"],
      ctaLabel: "Prøv gratis først",
    },
    bundle: {
      name: "{n} kveldsbilder",
      badge: "Lavere pris per bilde",
      unit: "per oppdrag",
      text: "Fasade og to rom i samme annonse, for eksempel. Ca. {perImage} kr per bilde.",
      features: ["Alt i Kveldsbilde", "Én ny runde per bilde"],
      ctaLabel: "Prøv gratis først",
    },
    addOn: "Skjul ansikter og skilt: {price} kr per bilde.",
    chains: {
      anchor: "kjeder",
      eyebrow: "For kjeder og partnere",
      title: "Deres merkevare. Vår motor.",
      text: "Pris etter volum og type konto. Løsningen kan leveres i kjedens egen profil.",
      points: [
        "Egen logo, egne farger og egen nettadresse",
        "Bildene leveres i kjedens profil",
        "Volumpris for alle kontorene",
      ],
      cta: { label: "Snakk med oss", href: "#kontakt" },
    },
  },

  // Linje 345-349. Spoersmaalene ligger i faq.ts (showOnHome).
  faq: {
    _type: "faq",
    anchor: "sporsmal",
    title: "Spørsmål og svar",
    lead: "Finner du ikke svaret? Skriv til {email}.",
    more: { label: "Se alle spørsmål", href: "/no/sporsmal-og-svar" },
  },

  // Linje 392-398.
  finalCta: {
    _type: "finalCta",
    title: "Se ditt eget bilde i kveldslys.",
    text: "{n} gratis kveldsbilder når du registrerer deg. Uten kort.",
    secondary: { label: "Kjede eller partner? Snakk med oss", href: "#kjeder" },
  },
} as const satisfies Home;
