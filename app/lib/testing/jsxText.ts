/**
 * Felles hjelpere for testene som sjekker at det ikke staar synlig tekst
 * skrevet rett inn i JSX (D1c, D2a, MS2). Kildekoden leses som tekst, fordi
 * node --test ikke kan laste .tsx. Ingen import.
 */

/** Kildekoden uten kommentarer (kommentarer og parameternavn er ikke synlig tekst). */
export function withoutComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** Synlig tekst skrevet rett inn: tekst mellom tagger og tekst-attributter. */
export function literalTexts(jsx: string): string[] {
  const between = [...jsx.matchAll(/(?<!=)>([^<>{}]*)(?=<|\{)/g)]
    .map((m) => m[1].trim())
    // Kode etter en selvlukkende tag (f.eks. `/>) : x === "y" ? (`) er ikke tekst.
    .filter((text) => /\p{L}/u.test(text) && !/^[)}:?&|]|===/.test(text));
  const attrs = [...jsx.matchAll(/\b(?:alt|title|placeholder|aria-label)="([^"]*)"/g)].map((m) => m[1]);
  // Strenger i uttrykk som ser ut som tekst (stor forbokstav), f.eks. {busy ? "Running..." : "Run"}.
  // Klasser, statuser og noekler i ordlista starter med liten bokstav.
  const strings = [...jsx.matchAll(/"(\p{Lu}[^"]*)"/gu)].map((m) => m[1]);
  return [...between, ...attrs, ...strings];
}

/** Alle JSX-blokkene i en fil: `return ( … );` over flere linjer og `return <…>;` paa en linje. */
export function jsxBlocks(src: string): string[] {
  const multi = [...src.matchAll(/return \(\n([\s\S]*?)\n\s*\);/g)].map((m) => m[1]);
  const single = [...src.matchAll(/return (<[^\n]*>);/g)].map((m) => m[1]);
  return [...multi, ...single];
}

/** Synlig tekst skrevet rett inn i alle JSX-blokkene i en fil (kildekoden som tekst). */
export function literalTextsInFile(src: string): string[] {
  return jsxBlocks(withoutComments(src)).flatMap((b) => literalTexts(`${b}<`));
}
