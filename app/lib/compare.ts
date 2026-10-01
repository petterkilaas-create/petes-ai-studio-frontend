import type { ReviewRound, RoundChoices } from "./api";
import { codeText, t, type Locale, type UiKey } from "./i18n/index.ts";
import { variantOptions, type ImageVariant, type ReviewPreviews } from "./review.ts";

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
 * Etiketten, f.eks. «Runde 2 · nå (tidlig, lette skyer)» eller «Runde 1 ·
 * rått fra modellen». Nummeret er `round + 1` fra backend, aldri plassen i
 * lista (hull kan forekomme).
 */
export function variantLabel(locale: Locale, variant: CompareVariant): string {
  if (variant.source.kind === "legacy") return t(locale, LEGACY_LABEL[variant.source.variant]);
  const base = t(locale, "compare.round", { n: (variant.round ?? 0) + 1 });
  if (variant.raw) return `${base} · ${t(locale, "compare.raw")}`;
  const head = variant.current ? `${base} · ${t(locale, "compare.now")}` : base;
  const parts = variant.choices === null ? [] : choiceParts(locale, variant.choices);
  return parts.length > 0 ? `${head} (${parts.join(", ")})` : head;
}
