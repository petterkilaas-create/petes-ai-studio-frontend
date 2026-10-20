import { Geist, Instrument_Serif } from "next/font/google";

// Fontene lastes ned ved bygg og serveres fra oss (D0). Definert ett sted
// (MS2, font.md «Using a font definitions file»), saa appen, markedssiden og
// 404-siden deler samme instans: font-ui paa body (globals.css), font-display
// paa titler fra 28 px. Bare .variable paa <html>, aldri .className.
// F3: ogsaa kursiv, til slutten av overskriften paa markedssiden («Ett sted.»,
// Petter 20.10, valg B), saa nettleseren ikke lager en skraa variant selv.
const instrumentSerif = Instrument_Serif({
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-instrument-serif",
});

const geist = Geist({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-geist",
});

/** Klassene til <html> i hver rot-layout. */
export const fontVariables = `${instrumentSerif.variable} ${geist.variable}`;
