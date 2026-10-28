import type { Home } from "../schema.ts";

// Forsiden, ordrett fra det godkjente utkastet (MARKEDSSIDE_UTKAST.dc.html).
// Linjenumrene staar ved hver seksjon.
//
// Midlertidige bilder er merket pending "image" (Petter 02.10, valg E).
// F3 (den nye forsiden, designet Main.dc.html linje 49-92): ny overlinje,
// overskrift og ingress, «Se filmen» og mosaikken i stedet for slideren
// (Petter og Cowork 20.10). freeNote er laast (TG-NEW-220). Dag 58 (F2,
// Petter 28.10): toppen, mosaikken, eksemplene, tjenestene, prisene og bunnen
// viser bare det som kan bestilles; resten staar under «Kommer snart».
// F5 (designet linje 279-305): slideren fra toppen staar i eksemplene, med
// tre faner. Feltene til slideren er flyttet fra toppen til examples.slider
// (verdien er som i D2).
//
// MS3a: tillitsstripen, eksemplene og tjenestene.
// MS3b: merkingen, den aerlige versjonen, prisene, spoersmaal og svar (selve
// spoersmaalene i faq.ts) og siste knapp. Ingen tall i tekstene: prisene og
// antallene fylles fra site.offer.
// F7: stemningene, de tre stegene og hjelperen ph (plassholderne) er slettet.

export const home = {
  _type: "home",
  hero: {
    _type: "hero",
    anchor: "topp",
    eyebrow: "AI-studio for eiendomsmeglere",
    // Dag 58 (Petter 28.10): bare det som kan bestilles.
    title: "Kveldsbilder, årstider og digital styling til boligannonsen.",
    titleEmphasis: "Ett sted.",
    // Dag 58 (F2): bare det som kan bestilles (kortene i tjenestene).
    lead: "Gjør dagsbilder til kveldsbilder, vis boligen i en annen årstid, møbler tomme rom digitalt og bytt grå himmel med blå. Du godkjenner alt, og hvert bilde får synlig AI-merke og ferdig tekst til annonsen.",
    secondary: { label: "Se filmen", href: "#film" },
    freeNote: "{n} gratis bilder når du registrerer deg. Uten kort.",
    // Dag 58 (F2): de bestillbare tjenestene, uten filmen (Petter 28.10).
    // Bildene er ekte og har AI-merket i bildet (Digital styling fra Dag 58,
    // Japandi, som paa Tjenester).
    mosaic: {
      label: "Eksempler på bilder",
      tiles: [
        {
          label: "Kveldsbilde",
          image: { image: "pairEveningResult", alt: "Stue som kveldsbilde laget med AI, med AI-merket nede til venstre" },
        },
        {
          label: "Årstider",
          image: { image: "pairSeasonResult", alt: "Hus om vinteren med snø, laget med AI, med AI-merket nede til venstre" },
        },
        {
          label: "Blå himmel",
          image: { image: "pairSkyResult", alt: "Balkong med utsikt og blå himmel, laget med AI, med AI-merket nede til venstre" },
        },
        {
          label: "Digital styling",
          image: { image: "pairJapandiResult", alt: "Soverom møblert digitalt med AI, med AI-merket nede til venstre" },
        },
      ],
    },
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

  // Linje 85-121 og 472-480. F5: tre faner med slideren. Dag 58 (F2): de
  // bestillbare tjenestene med ekte par (AI-merket i bildet): kveldsbilde,
  // aarstider og blaa himmel. Digital styling har ingen fane (bare kortene).
  examples: {
    _type: "examples",
    anchor: "eksempler",
    title: "Se forskjellen selv.",
    lead: "Dra i linjen, klikk i bildet eller bruk piltastene.",
    tabListLabel: "Velg eksempel",
    aiLabel: "AI",
    slider: {
      original: "Original",
      label: "Flytt skillelinjen mellom originalen og resultatet",
      value: "{n} % original",
    },
    tabs: [
      {
        id: "kveld",
        label: "Kveldsbilde",
        result: "Kveldsbilde",
        before: { image: "pairEveningOriginal", alt: "Stua tatt på dagtid" },
        after: {
          image: "pairEveningResult",
          alt: "Samme stue som kveldsbilde laget med AI, med AI-merket nede til venstre",
        },
        caption: { text: "Ekte resultat laget med {brand}. AI-merket står nede til venstre i bildet." },
      },
      {
        id: "aarstid",
        label: "Årstider",
        result: "Vinter",
        before: { image: "pairSeasonOriginal", alt: "Huset tatt om sommeren" },
        after: {
          image: "pairSeasonResult",
          alt: "Samme hus om vinteren, laget med AI, med AI-merket nede til venstre",
        },
        caption: { text: "Ekte resultat laget med {brand}. AI-merket står nede til venstre i bildet." },
      },
      {
        id: "himmel",
        label: "Blå himmel",
        result: "Blå himmel",
        before: { image: "pairSkyOriginal", alt: "Balkong med utsikt under grå himmel" },
        after: {
          image: "pairSkyResult",
          alt: "Samme balkong med blå himmel, laget med AI, med AI-merket nede til venstre",
        },
        caption: { text: "Ekte resultat laget med {brand}. AI-merket står nede til venstre i bildet." },
      },
    ],
  },

  // F4: tjenestene som kort i studioer (designet Main.dc.html linje 104-256).
  // Dag 58 (F2, Petter 28.10): bare det som kan bestilles, som paa Tjenester:
  // Kveldsbilde, Årstider og Digital styling store, Blå himmel lite. Resten
  // staar under «Kommer snart», uten bilde og uten lenke. Skjul ansikter og
  // skilt er fortsatt ikke paa forsiden (20.10, 2e). rydd_opp er en egen id,
  // fordi appen kaller magic_cleanup «Fjern gjenstander» (auditen §6). I de
  // delte bildene staar resultatet til venstre, saa det ekte AI-merket nede
  // til venstre synes (auditen §3). Tekstene er de samme som foer; Årstider
  // fra appen (express.tool.aarstider.desc) og Blå himmel fra linja under kortene.
  services: {
    _type: "services",
    anchor: "tjenester",
    title: "Alt annonsen trenger, i ett studio.",
    lead: "Last opp bildene én gang, og velg hva som skal gjøres med hvert av dem. Alt kommer tilbake på samme sted, klart til annonsen.",
    aiLabel: "AI",
    items: [
      {
        id: "scene_transform",
        studio: "Bildestudio",
        title: "Kveldsbilde",
        text: "Dagsbildet blir kveldsbilde, med himmel i blåtimen og lys i vinduer og lamper som finnes i bildet.",
        orderLabel: "Bestill kveldsbilde",
        size: "large",
        media: {
          kind: "split",
          after: { image: "pairEveningResult", alt: "Stue som kveldsbilde laget med AI, med AI-merket nede til venstre" },
          before: { image: "pairEveningOriginal", alt: "Samme stue tatt på dagtid" },
          labels: { after: "Kveld", before: "Dag" },
        },
      },
      {
        id: "aarstider",
        studio: "Bildestudio",
        title: "Årstider",
        text: "Samme bilde i en annen årstid: høst, vår, sommer eller vinter.",
        orderLabel: "Bestill årstider",
        size: "large",
        media: {
          kind: "split",
          after: { image: "pairSeasonResult", alt: "Hus om vinteren laget med AI, med AI-merket nede til venstre" },
          before: { image: "pairSeasonOriginal", alt: "Samme hus tatt om sommeren" },
          labels: { after: "Vinter", before: "Sommer" },
        },
      },
      {
        id: "virtual_stage",
        studio: "Bildestudio",
        title: "Digital styling",
        text: "Tomme rom møbleres digitalt i en av fjorten stiler, fra moderne nordisk til tradisjonell hytte. Vegger, vinduer og dører beholdes, og du godkjenner hvert bilde.",
        orderLabel: "Bestill digital styling",
        size: "large",
        media: {
          kind: "split",
          after: { image: "pairJapandiResult", alt: "Soverom møblert digitalt med AI, med AI-merket nede til venstre" },
          before: { image: "pairJapandiOriginal", alt: "Samme soverom uten møbler" },
          labels: { after: "Møblert", before: "Tomt" },
        },
      },
      {
        id: "klart_vaer",
        studio: "Bildestudio",
        title: "Blå himmel",
        text: "Grå himmel byttes med klar, blå himmel.",
        orderLabel: "Bestill blå himmel",
        size: "small",
      },
    ],
    coming: {
      title: "Kommer snart",
      items: [
        {
          id: "rydd_opp",
          studio: "Bildestudio",
          title: "Rydd opp",
          text: "Løse gjenstander på benker, bord og gulv fjernes. Faste ting og pynt blir stående, som kraner, lamper og planter.",
        },
        {
          id: "video",
          studio: "Filmstudio",
          title: "Boligfilm",
          text: "Korte filmer av boligen, laget fra bildene du allerede har. Klare for annonsen og sosiale medier.",
        },
        {
          id: "copywriter",
          studio: "Tekststudio",
          title: "Annonsetekst",
          text: "Utkast til boligannonsen på norsk, skrevet fra bildene og fakta du legger inn. Du redigerer og godkjenner.",
        },
        {
          id: "plantegning",
          studio: "Tegnestudio",
          title: "Plantegning",
          text: "Ryddig plantegning fra en enkel skisse eller et bilde av den gamle tegningen.",
        },
      ],
    },
  },

  // F2: filmseksjonen (designet Main.dc.html linje 258-277). Petter 20.10:
  // steg 4 og ingressen sier at teksten kopieres (MS5a AVVIK 1: teksten
  // foelger ikke med fila), og linja under filmen sier at det er en
  // illustrasjon. Filmen viser styling-bildet, saa lappen staar til det er
  // byttet.
  film: {
    _type: "film",
    anchor: "film",
    eyebrow: "Se filmen",
    title: "Fra opplasting til ferdig annonse.",
    lead: "Se hvordan en megler laster opp bildene fra fotografen, velger hva som skal gjøres, godkjenner resultatet, laster ned bildene og kopierer teksten til annonsen.",
    video: { video: "film", label: "Produktfilm: fra opplasting til ferdig annonse", pending: "image" },
    caption: "Illustrasjon av arbeidsflyten, uten lyd.",
    steps: ["Last opp bildene", "Velg tjeneste per bilde", "Sammenlign og godkjenn", "Last ned bildet og kopier teksten"],
  },

  // Linje 247-266. Eksempelteksten lages av kodene med produktets funksjon
  // (app/lib/disclosure.ts) og blir «Kveldsbilde laget med AI fra dagsbilde.
  // Himmel, lys i nabohus og stearinlys er redigert.» Bildet er ekte (jobb
  // 2f6c3c5b, beslutning 4, 19.10), og kodene er det jobben fikk (XMP
  // pas:Edited i nedlastingen), saa teksten stemmer med bildet.
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
      { text: "Laget med tanke på EUs åpenhetskrav for AI-innhold og Forbrukertilsynets veiledning." },
    ],
    guide: { label: "Les guiden: AI-bilder i boligannonsen" },
    more: { label: "Les mer om merkingen", href: "/no/merking" },
    picture: {
      image: "merkingEvening",
      alt: "Stue med åpen balkongdør som kveldsbilde laget med AI, med AI-merket og setningen nede til venstre",
    },
    example: {
      title: "Tekst til annonsen",
      base: "evening_from_day",
      time: "early",
      edited: ["sky", "neighbour_window_lights", "candles"],
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
  // F6a: Skjul ansikter og skilt er tatt ut (2e), og kjedene er flyttet ut.
  pricing: {
    _type: "pricing",
    anchor: "priser",
    title: "Åpne priser.",
    note: "Alle priser er eks. mva. Du godkjenner hvert bilde før du laster det ned.",
    priceFormat: "{price} kr",
    free: {
      name: "Prøv gratis",
      text: "{n} bilder når du registrerer deg. Nok til en hel annonse. Uten kort.",
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
    // F6a (Petter 20.10, 2c): tjenestene uten pris; prisen er ikke avklart
    // (TG-227). Dag 58 (F2): bare de som kan bestilles, i rekkefoelgen fra
    // tjenestekortene. Ingen ny pris, bare lappen [PRIS].
    otherFormat: "{name}:",
    others: [
      { name: "Årstider", price: { pending: "price" } },
      { name: "Digital styling", price: { pending: "price" } },
      { name: "Blå himmel", price: { pending: "price" } },
    ],
  },

  // F6a (designet linje 368-378): egen seksjon etter prisene, med de samme
  // tekstene som kortet i prisene hadde. «Snakk med oss» gaar til bunnen.
  chains: {
    _type: "chains",
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

  // Linje 345-349. Spoersmaalene ligger i faq.ts (showOnHome).
  faq: {
    _type: "faq",
    anchor: "sporsmal",
    title: "Spørsmål og svar",
    lead: "Finner du ikke svaret? Skriv til {email}.",
    more: { label: "Se alle spørsmål", href: "/no/sporsmal-og-svar" },
  },

  // Linje 392-398.
  // F6b: tittelen fra designet (linje 395), med {brand}.
  finalCta: {
    _type: "finalCta",
    title: "Prøv {brand} på dine egne bilder.",
    text: "{n} gratis bilder når du registrerer deg. Uten kort.",
    secondary: { label: "Kjede eller partner? Snakk med oss", href: "#kjeder" },
  },
} as const satisfies Home;
