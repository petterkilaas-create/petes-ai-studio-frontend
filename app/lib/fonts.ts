import { Geist, Instrument_Serif } from "next/font/google";

// Fontene lastes ned ved bygg og serveres fra oss (D0). Definert ett sted
// (MS2, font.md «Using a font definitions file»), saa appen, markedssiden og
// 404-siden deler samme instans: font-ui paa body (globals.css), font-display
// paa titler fra 28 px. Bare .variable paa <html>, aldri .className.
const instrumentSerif = Instrument_Serif({
  weight: "400",
  style: ["normal"],
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
