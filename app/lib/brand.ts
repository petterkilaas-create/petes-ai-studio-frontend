/**
 * Merket fra ett sted (redesign D0, brief v4 §13). Visningsnavn, logo og de
 * fargene et foretak kan overstyre. Alt annet (paper, ink, status, radier)
 * staar fast i globals.css. Rene funksjoner uten import, saa modulen kan
 * testes med node --test.
 *
 * Fargene settes som CSS-variabler (--brand-*) paa <html>; tokenene i
 * globals.css (@theme inline) peker paa dem. Verdier per foretak kommer med
 * TG-NEW-128 og gaar gjennom resolveBrand foer de brukes.
 */

export type BrandColors = {
  /** Hovedknapp og annen flate med tekst paa. */
  primary: string;
  /** Tekst paa primary. */
  onPrimary: string;
  /** Lenker, fokus og uthevet tekst paa paper. */
  accent: string;
};

export type Brand = {
  displayName: string;
  /** url null: vis monogrammet i en rute. */
  logo: { url: string | null; monogram: string };
  colors: BrandColors;
};

/** Sidebakgrunnen (token paper). Staar fast og kan ikke overstyres. */
export const PAPER = "#F4F2ED";

/** WCAG AA for vanlig tekst (brief §3 punkt 8). */
export const MIN_CONTRAST = 4.5;

export const DEFAULT_BRAND: Brand = {
  displayName: "The Studio",
  logo: { url: null, monogram: "P" },
  colors: { primary: "#1D1C1A", onPrimary: "#FFFFFF", accent: "#1D1C1A" },
};

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** #RGB eller #RRGGBB til #RRGGBB med store bokstaver, ellers null. */
export function normalizeHex(value: unknown): string | null {
  if (typeof value !== "string" || !HEX.test(value.trim())) return null;
  let hex = value.trim().slice(1);
  if (hex.length === 3) hex = hex.replace(/./g, (c) => c + c);
  return `#${hex.toUpperCase()}`;
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Kontrastforholdet etter WCAG 2.x, fra 1 til 21. Kaster ved ugyldig hex. */
export function contrastRatio(a: string, b: string): number {
  const ha = normalizeHex(a);
  const hb = normalizeHex(b);
  if (!ha || !hb) throw new Error(`Ugyldig farge: ${a} / ${b}`);
  const la = relativeLuminance(ha);
  const lb = relativeLuminance(hb);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export type BrandInput = {
  displayName?: string | null;
  logoUrl?: string | null;
  colors?: Partial<Record<keyof BrandColors, unknown>> | null;
};

/**
 * Et foretaks merke, validert. Ugyldige verdier gir standardverdien, aldri
 * en feil i UI:
 * - primary og onPrimary er et par: ugyldig hex, under 4,5:1 seg imellom
 *   eller primary under 4,5:1 mot paper gir standardparet.
 * - accent under 4,5:1 mot paper gir standard-accent.
 */
export function resolveBrand(input: BrandInput | null | undefined): Brand {
  const d = DEFAULT_BRAND;
  const c = input?.colors ?? {};

  const primary = normalizeHex(c.primary ?? d.colors.primary);
  const onPrimary = normalizeHex(c.onPrimary ?? d.colors.onPrimary);
  const pairOk =
    primary !== null &&
    onPrimary !== null &&
    contrastRatio(primary, onPrimary) >= MIN_CONTRAST &&
    contrastRatio(primary, PAPER) >= MIN_CONTRAST;
  const pair = pairOk ? { primary, onPrimary } : { primary: d.colors.primary, onPrimary: d.colors.onPrimary };

  const accentHex = normalizeHex(c.accent ?? d.colors.accent);
  const accent =
    accentHex !== null && contrastRatio(accentHex, PAPER) >= MIN_CONTRAST ? accentHex : d.colors.accent;

  const name = input?.displayName?.trim();
  const logoUrl = input?.logoUrl?.trim();

  return {
    displayName: name ? name : d.displayName,
    logo: logoUrl ? { url: logoUrl, monogram: d.logo.monogram } : d.logo,
    colors: { primary: pair.primary, onPrimary: pair.onPrimary, accent },
  };
}

export type BrandCssVars = {
  "--brand-primary": string;
  "--brand-on-primary": string;
  "--brand-accent": string;
};

/** CSS-variablene som settes i style paa <html>. */
export function brandCssVars(brand: Brand): BrandCssVars {
  return {
    "--brand-primary": brand.colors.primary,
    "--brand-on-primary": brand.colors.onPrimary,
    "--brand-accent": brand.colors.accent,
  };
}
