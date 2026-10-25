import type { Home } from "../schema.ts";

// Forsiden, ordrett fra det godkjente utkastet (MARKEDSSIDE_UTKAST.dc.html).
// Linjenumrene staar ved hver seksjon.
//
// Midlertidige bilder er merket pending "image" (Petter 02.10, valg E).
// F3 (den nye forsiden, designet Main.dc.html linje 49-92): ny overlinje,
// overskrift og ingress, «Se filmen» og mosaikken i stedet for slideren
// (Petter og Cowork 20.10). Kveldsbildet i mosaikken er ekte; rydd opp,
// styling og loekka er midlertidige (pending "image"). freeNote er laast
// (TG-NEW-220).
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
    title: "Bilder, film og tekst til boligannonsen.",
    titleEmphasis: "Ett sted.",
    lead: "Gjør dagsbilder til kveldsbilder, rydd og møbler rommene, lag film og skriv annonseteksten. Du godkjenner alt, og hvert bilde får synlig AI-merke og ferdig tekst til annonsen.",
    secondary: { label: "Se filmen", href: "#film" },
    freeNote: "{n} gratis bilder når du registrerer deg. Uten kort.",
    mosaic: {
      label: "Eksempler på bilder, film og annonsetekst",
      tiles: [
        {
          label: "Kveldsbilde",
          image: { image: "pairEveningResult", alt: "Stue som kveldsbilde laget med AI, med AI-merket nede til venstre" },
        },
        {
          label: "Rydd opp",
          image: { image: "pairCleanupResult", alt: "Spiseplass etter at rotet er fjernet, laget med AI", pending: "image" },
        },
        { label: "Annonsetekst", quote: "«Lys hjørnestue med utgang til vestvendt balkong …»" },
        {
          label: "Digital styling",
          image: {
            image: "pairStylingResult",
            alt: "Tom stue møblert digitalt i skandinavisk stil, laget med AI",
            pending: "image",
          },
        },
        { label: "Film", video: { video: "loop", label: "Utdrag fra produktfilmen", pending: "image" } },
      ],
    },
    aiLabel: "AI",
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

  // Linje 85-121 og 472-480. F5: tre faner med slideren. Kveldsbildet er
  // ekte og har AI-merket i bildet; rydd opp og styling er midlertidige
  // (pending "image" paa bildene og teksten under).
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
        id: "rydd",
        label: "Rydd opp",
        result: "Ryddet",
        before: { image: "pairCleanupOriginal", alt: "Spiseplass med ting på bordet", pending: "image" },
        after: {
          image: "pairCleanupResult",
          alt: "Samme spiseplass etter at rotet er fjernet, laget med AI",
          pending: "image",
        },
        caption: { text: "Ekte resultat laget med {brand}.", pending: "image" },
      },
      {
        id: "styling",
        label: "Digital styling",
        result: "Møblert",
        before: { image: "pairStylingOriginal", alt: "Tom stue uten møbler", pending: "image" },
        after: {
          image: "pairStylingResult",
          alt: "Samme stue møblert digitalt i skandinavisk stil, laget med AI",
          pending: "image",
        },
        caption: { text: "Ekte resultat laget med {brand}.", pending: "image" },
      },
    ],
  },

  // F4: tjenestene som seks kort i studioer (designet Main.dc.html linje
  // 104-256). Alle vises som om de er klare (Petter dag 48); de som ikke er
  // det, har «Få tidlig tilgang» til kontaktsiden (20.10, 2b). Skjul ansikter
  // og skilt er tatt ut av forsiden og blir i appen (20.10, 2e). rydd_opp er
  // en egen id, fordi appen kaller magic_cleanup «Fjern gjenstander» (auditen
  // §6). I de delte bildene staar resultatet til venstre, saa det ekte
  // AI-merket nede til venstre i kveldsbildet synes (auditen §3). Styling,
  // rydd opp og loekka er midlertidige (pending "image").
  services: {
    _type: "services",
    anchor: "tjenester",
    title: "Alt annonsen trenger, i ett studio.",
    lead: "Last opp bildene én gang, og velg hva som skal gjøres med hvert av dem. Alt kommer tilbake på samme sted, klart til annonsen.",
    aiLabel: "AI",
    earlyAccess: { label: "Få tidlig tilgang", href: "/no/kontakt" },
    also: { label: "Også i Bildestudio:", text: "Blå himmel, der grå himmel byttes med klar, blå himmel." },
    items: [
      {
        id: "scene_transform",
        studio: "Bildestudio",
        title: "Kveldsbilde",
        text: "Dagsbildet blir kveldsbilde, med himmel i blåtimen og lys i vinduer og lamper som finnes i bildet.",
        status: "available",
        orderLabel: "Bestill kveldsbilde",
        media: {
          kind: "split",
          after: { image: "pairEveningResult", alt: "Stue som kveldsbilde laget med AI, med AI-merket nede til venstre" },
          before: { image: "pairEveningOriginal", alt: "Samme stue tatt på dagtid" },
          labels: { after: "Kveld", before: "Dag" },
        },
      },
      {
        id: "virtual_stage",
        studio: "Bildestudio",
        title: "Digital styling",
        text: "Tomme rom møbleres digitalt i en av fjorten stiler, fra moderne nordisk til tradisjonell hytte. Vegger, vinduer og dører beholdes, og du godkjenner hvert bilde.",
        status: "soon",
        media: {
          kind: "split",
          after: { image: "pairStylingResult", alt: "Stue møblert digitalt i skandinavisk stil, laget med AI", pending: "image" },
          before: { image: "pairStylingOriginal", alt: "Samme stue, tom", pending: "image" },
          labels: { after: "Møblert", before: "Tomt" },
        },
      },
      {
        id: "rydd_opp",
        studio: "Bildestudio",
        title: "Rydd opp",
        text: "Løse gjenstander på benker, bord og gulv fjernes. Faste ting og pynt blir stående, som kraner, lamper og planter.",
        status: "soon",
        media: {
          kind: "split",
          after: { image: "pairCleanupResult", alt: "Spiseplass etter at rotet er fjernet, laget med AI", pending: "image" },
          before: { image: "pairCleanupOriginal", alt: "Samme spiseplass med ting på bordet", pending: "image" },
          labels: { after: "Ryddet", before: "Før" },
        },
      },
      {
        id: "video",
        studio: "Filmstudio",
        title: "Boligfilm",
        text: "Korte filmer av boligen, laget fra bildene du allerede har. Klare for annonsen og sosiale medier.",
        status: "soon",
        // Vi har ingen ekte boligfilm ennaa: lappen hindrer lansering til den finnes.
        media: { kind: "video", video: { video: "loop", label: "Utdrag fra produktfilmen", pending: "image" }, label: "Film" },
      },
      {
        id: "copywriter",
        studio: "Tekststudio",
        title: "Annonsetekst",
        text: "Utkast til boligannonsen på norsk, skrevet fra bildene og fakta du legger inn. Du redigerer og godkjenner.",
        status: "soon",
        media: {
          kind: "ad",
          image: { image: "pairEveningResult", alt: "Stue som kveldsbilde laget med AI" },
          label: "Utkast, eksempel",
          title: "Lys hjørnestue med utgang til vestvendt balkong",
          excerpt: "Store vinduer mot to sider, plass til både sofagruppe og spisebord, og kveldssol på balkongen …",
        },
      },
      {
        id: "plantegning",
        studio: "Tegnestudio",
        title: "Plantegning",
        text: "Ryddig plantegning fra en enkel skisse eller et bilde av den gamle tegningen.",
        status: "soon",
        media: {
          kind: "plan",
          label: "En håndtegnet skisse blir til en ryddig plantegning med stue, kjøkken, soverom, bad og gang",
          sketch: { caption: "Skisse", rooms: ["stue", "sov", "kjøkken", "bad"] },
          plan: { caption: "Plantegning", rooms: ["Stue", "Sov", "Kjøkken", "Bad", "Gang"] },
        },
      },
    ],
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
    // F6a (Petter 20.10, 2c): tjenestene uten pris, i rekkefoelgen fra
    // designet. Blå himmel er med fordi den finnes i appen; prisen er ikke
    // avklart (TG-227).
    otherFormat: "{name}:",
    others: [
      { name: "Digital styling", price: { pending: "price" } },
      { name: "Rydd opp", price: { pending: "price" } },
      { name: "Blå himmel", price: { pending: "price" } },
      { name: "Boligfilm", price: { pending: "price" } },
      { name: "Annonsetekst", price: { pending: "price" } },
      { name: "Plantegning", price: { pending: "price" } },
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
