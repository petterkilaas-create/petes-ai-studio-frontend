import type { Home } from "../schema.ts";

// Toppen, ordrett fra det godkjente utkastet (MARKEDSSIDE_UTKAST.dc.html,
// linje 50-71). Alt-tekstene er skrevet om for stua (Petter 02.10), etter
// utkastets stue-variant (linje 464 og 466). sliderValue er som i D2.
// Bildene er midlertidige og byttes foer lansering.
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
    before: { image: "heroOriginal", alt: "Originalbildet av stua, tatt på dagtid" },
    after: {
      image: "heroEvening",
      alt: "Samme stue som kveldsbilde laget med AI, med tente lamper, fyr i peisen og AI-merke nede til venstre",
    },
    labels: { original: "Original", result: "Kveldsbilde", ai: "AI" },
    sliderLabel: "Flytt skillelinjen mellom originalen og kveldsbildet",
    sliderValue: "{n} % original",
    caption: "Dra i linjen, klikk i bildet eller bruk piltastene. Ekte eksempel, laget med tjenesten.",
  },
} as const satisfies Home;
