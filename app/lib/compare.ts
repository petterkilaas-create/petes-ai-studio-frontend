import type { ReviewRound, RoundChoices } from "./api";
import { codeText, t, type Locale, type UiKey } from "./i18n/index.ts";
import { resultImageUrl, variantOptions, type ImageVariant, type ReviewPreviews } from "./review.ts";
import { isStylingPreset, styleText } from "./styling.ts";

/**
 * Variantene i «Sammenlign originalen med» (D2a). Rene funksjoner, saa de
 * kan testes med node --test; bare type-import fra api.ts, som kaster ved
 * import naar NEXT_PUBLIC_API_BASE mangler.
 *
 * Kontrakt: ~/dev/_handoff/KONTRAKT_RUNDER.md. Variantene bygges bare fra
 * `images.rounds`, aldri fra filnavn. Mangler en lenke, vises plassholder for
 * den varianten, uten tilbakefall til andre felt. Gamle jobber uten `rounds`
 * bruker preview_url, raw_preview_url og previous som foer.
 */

/** Hvor bildet kommer fra: en runde (lenken som den er) eller de gamle feltene. */
export type VariantSource =
  | { kind: "round"; url: string | null }
  | { kind: "legacy"; variant: ImageVariant };

export interface CompareVariant {
  /** Stabil noekkel i UI: "r1", "r1-raw" eller "legacy-lifted". */
  id: string;
  source: VariantSource;
  /** Rundenummeret fra backend (0 = foerste bilde); null for de gamle feltene. */
  round: number | null;
  /** Gjeldende runde («nå»). */
  current: boolean;
  /** Raatt bilde fra modellen (bare admin). */
  raw: boolean;
  choices: RoundChoices | null;
}

export interface CompareImages extends ReviewPreviews {
  rounds: ReviewRound[] | null;
}

const LEGACY_LABEL: Record<ImageVariant, UiKey> = {
  lifted: "review.variantLifted",
  raw: "review.variantRaw",
  previous: "review.previousRound",
};

function legacyVariants(images: ReviewPreviews, isAdmin: boolean): CompareVariant[] {
  const options = variantOptions(images, isAdmin);
  return (options.length > 0 ? options : (["lifted"] as ImageVariant[])).map((variant) => ({
    id: `legacy-${variant}`,
    source: { kind: "legacy", variant },
    round: null,
    current: variant === "lifted",
    raw: variant === "raw",
    choices: null,
  }));
}

/**
 * Variantene, nyeste runde foerst, og saa de raa (bare for admin, ogsaa
 * nyeste foerst). Rekkefoelgen fra backend brukes ikke; et rundenummer som
 * staar to ganger, tas bare med foerste gang. Tom liste: ingen runder ennaa
 * (needs_review), og siden viser bare originalen.
 */
export function compareVariants(images: CompareImages, opts: { isAdmin: boolean }): CompareVariant[] {
  if (images.rounds === null) return legacyVariants(images, opts.isAdmin);
  const seen = new Set<number>();
  const rounds: ReviewRound[] = [];
  for (const r of images.rounds) {
    if (seen.has(r.round)) continue;
    seen.add(r.round);
    rounds.push(r);
  }
  rounds.sort((a, b) => b.round - a.round);
  const lifted: CompareVariant[] = rounds.map((r) => ({
    id: `r${r.round}`,
    source: { kind: "round", url: r.previewUrl },
    round: r.round,
    current: r.current,
    raw: false,
    choices: r.choices,
  }));
  if (!opts.isAdmin) return lifted;
  const raw: CompareVariant[] = rounds.map((r) => ({
    id: `r${r.round}-raw`,
    source: { kind: "round", url: r.rawPreviewUrl },
    round: r.round,
    current: false,
    raw: true,
    choices: r.choices,
  }));
  return [...lifted, ...raw];
}

/** Varianten som vises foerst: gjeldende runde, ellers den nyeste. */
export function defaultVariant(variants: CompareVariant[]): CompareVariant | null {
  return variants.find((v) => v.current && !v.raw) ?? variants[0] ?? null;
}

/** Valgt variant fra id, eller standarden naar id-en ikke (lenger) finnes. */
export function selectedVariant(variants: CompareVariant[], id: string | null): CompareVariant | null {
  return variants.find((v) => v.id === id) ?? defaultVariant(variants);
}

/** Valgene i parentes: tidspunkt, himmel (eller «uten himmel»), peis og lys. */
function choiceParts(locale: Locale, choices: RoundChoices): string[] {
  const parts: string[] = [];
  if (choices.time !== null) parts.push(codeText(locale, "roundTime", choices.time));
  if (choices.skyApplied === false) parts.push(t(locale, "compare.noSky"));
  else if (choices.sky !== null) parts.push(codeText(locale, "roundSky", choices.sky));
  if (choices.fireplaceFire === "yes") parts.push(t(locale, "compare.fireLit"));
  if (choices.fireplaceFire === "no") parts.push(t(locale, "compare.fireNotLit"));
  if (choices.lightsChanged) parts.push(t(locale, "compare.lightsChanged"));
  return parts;
}

/**
 * Det som staar i parentes for admin: skumringsvalgene, eller stilen for
 * Digital styling (B2), der skumringsvalgene ikke gir mening.
 */
function labelParts(locale: Locale, variant: CompareVariant, presetId: string | null | undefined): string[] {
  if (isStylingPreset(presetId)) {
    const style = styleText(locale, presetId);
    return style === null ? [] : [style];
  }
  return variant.choices === null ? [] : choiceParts(locale, variant.choices);
}

/**
 * Etiketten, f.eks. «Versjon 2 · nå (tidlig, lette skyer)» eller «Versjon 1 ·
 * rått fra modellen». Nummeret er `round + 1` fra backend, aldri plassen i
 * lista (hull kan forekomme). Valgene i parentes bare med `choices`
 * (admin, TG-NEW-193); megleren ser «Versjon 2 · nå». For styling (`presetId`
 * `styling_…`) staar stilen i parentes: «Versjon 1 · nå (Fargerik eklektisk)».
 * Ordet er «Versjon», ikke «Runde» (FE-c, Dag 57, F2).
 */
export function variantLabel(
  locale: Locale,
  variant: CompareVariant,
  opts: { choices: boolean; presetId?: string | null }
): string {
  if (variant.source.kind === "legacy") return t(locale, LEGACY_LABEL[variant.source.variant]);
  const base = t(locale, "compare.version", { n: (variant.round ?? 0) + 1 });
  if (variant.raw) return `${base} · ${t(locale, "compare.raw")}`;
  const head = variant.current ? `${base} · ${t(locale, "compare.now")}` : base;
  const parts = opts.choices ? labelParts(locale, variant, opts.presetId) : [];
  return parts.length > 0 ? `${head} (${parts.join(", ")})` : head;
}

// ---------------------------------------------------------------------------
// Versjonsstripa (FE-c, Dag 57): bare visning, ingen nye kall.
// ---------------------------------------------------------------------------

export const ORIGINAL_ID = "original";

/** Originalen eller en variant i stripa, med lenken til miniatyren (null: plassholder). */
export type StripEntry =
  | { id: typeof ORIGINAL_ID; kind: "original"; url: string | null }
  | { id: string; kind: "variant"; variant: CompareVariant; url: string | null };

export interface StripImages extends ReviewPreviews {
  originalUrl: string | null;
}

/** Gamle jobber uten `rounds`: forrige runde er eldst, saa løftet, saa rått. */
const LEGACY_ORDER: Record<ImageVariant, number> = { previous: 0, lifted: 1, raw: 2 };

function variantOrder(v: CompareVariant): number {
  return v.source.kind === "legacy" ? LEGACY_ORDER[v.source.variant] : v.round ?? 0;
}

function variantUrl(images: ReviewPreviews, v: CompareVariant): string | null {
  return v.source.kind === "legacy" ? resultImageUrl(images, v.source.variant) : v.source.url;
}

/**
 * Stripa: originalen foerst, saa versjonene eldst foerst, og de raa (admin)
 * til slutt, ogsaa eldst foerst. `variants` er de siden viser
 * (compareVariants og visibleVariants); stripa endrer ikke hvilke.
 */
export function versionStrip(images: StripImages, variants: CompareVariant[]): StripEntry[] {
  const sorted = [...variants].sort(
    (a, b) => Number(a.raw) - Number(b.raw) || variantOrder(a) - variantOrder(b)
  );
  return [
    { id: ORIGINAL_ID, kind: "original", url: images.originalUrl },
    ...sorted.map((variant): StripEntry => ({ id: variant.id, kind: "variant", variant, url: variantUrl(images, variant) })),
  ];
}

/** Stripa vises bare med minst to versjoner, som velgeren foer. */
export function stripShown(strip: StripEntry[]): boolean {
  return strip.filter((e) => e.kind === "variant").length > 1;
}

/** Versjonen som vises foerst og som «Godkjenn» gjelder: gjeldende, ellers den nyeste. Aldri originalen. */
export function defaultEntry(strip: StripEntry[]): StripEntry | null {
  const lifted = strip.filter((e) => e.kind === "variant" && !e.variant.raw);
  const current = lifted.find((e) => e.kind === "variant" && e.variant.current);
  return current ?? lifted[lifted.length - 1] ?? null;
}

/** Valgt fra id, eller standarden naar id-en ikke (lenger) finnes. */
export function selectedEntry(strip: StripEntry[], id: string | null): StripEntry | null {
  return strip.find((e) => e.id === id) ?? defaultEntry(strip);
}

/**
 * «Godkjenn» er laast naar originalen eller en annen versjon enn den
 * nyeste vises (AVVIK 5, Petters F4): backend godkjenner alltid gjeldende
 * versjon. Uten versjoner er det ingenting aa laase.
 */
export function approveLocked(strip: StripEntry[], shown: StripEntry | null): boolean {
  const latest = defaultEntry(strip);
  return shown !== null && latest !== null && shown.id !== latest.id;
}

/** «Original», eller etiketten til varianten (variantLabel). */
export function stripLabel(
  locale: Locale,
  entry: StripEntry,
  opts: { choices: boolean; presetId?: string | null }
): string {
  return entry.kind === "original" ? t(locale, "review.original") : variantLabel(locale, entry.variant, opts);
}
