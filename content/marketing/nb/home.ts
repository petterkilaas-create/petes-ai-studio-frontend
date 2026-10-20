import type { Home, ImagePlaceholder } from "../schema.ts";

// Forsiden, ordrett fra det godkjente utkastet (MARKEDSSIDE_UTKAST.dc.html).
// Linjenumrene staar ved hver seksjon.
//
// Toppen (linje 50-71): alt-tekstene er skrevet om for stua (Petter 02.10),
// etter utkastets stue-variant (linje 464 og 466). sliderValue er som i D2.
// Bildene er midlertidige (originalen er ogsaa laget med AI), saa de er
// merket pending "image" (Petter 02.10, valg E).
// F3 (den nye forsiden, designet Main.dc.html linje 49-92): ny overlinje,
// overskrift og ingress, «Se filmen» og mosaikken i stedet for slideren
// (Petter og Cowork 20.10). Kveldsbildet i mosaikken er ekte; rydd opp,
// styling og loekka er midlertidige (pending "image"). freeNote er laast
// (TG-NEW-220). Feltene til slideren (before til caption) brukes ikke paa
// siden til F5, men Stue i eksemplene har de samme bildene.
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
        text: "Tomme rom møbleres digitalt i en av tre stiler: skandinavisk, familie eller moderne. Vegger, vinduer og dører beholdes, og du godkjenner hvert bilde.",
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
  // byttet. Stemningene og de tre stegene over er ikke paa siden (F7 sletter dem).
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
    text: "{n} gratis bilder når du registrerer deg. Uten kort.",
    secondary: { label: "Kjede eller partner? Snakk med oss", href: "#kjeder" },
  },
} as const satisfies Home;
