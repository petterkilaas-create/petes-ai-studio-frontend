/**
 * Skumringsvalg (2f-b, Petter 29.09): tidspunkt og himmel naar megleren
 * bestiller skumring. Rene funksjoner uten import, saa de kan testes med
 * node --test (api.ts kaster ved import naar NEXT_PUBLIC_API_BASE mangler).
 *
 * Kontrakt: ~/dev/_handoff/KONTRAKT_2F.md. Backend sender og tar imot bare
 * koder; tekstene ligger i ordlista (kodegruppene duskTime og duskSky).
 * Valgene kan ikke endres i «Rett» eller ved «Send videre» (kommer i 2f-c).
 *
 * Stil v2 (TG-NEW-189): stilen (`dusk_style`) er en del av valget.
 * Stilkortene (Dag 55, TG-NEW-259): megleren velger ett av fire kort, og
 * tidspunktet foelger kortet. `warm_dusk` og `summer_night` er koder backend
 * viser i godkjenningen for runder uten himmelvalg, aldri valg megleren kan
 * sende, saa de ligger bare i ordlista. Det samme gjelder de gamle stilene
 * (`nordic_blue_hour_v1`, `warm_dusk_v2`) fra eldre jobber.
 * Stjernehimmel (Dag 56, TG-NEW-265): `starry` er et himmelvalg under Sen
 * kveld, med `dark` som standard (backend dag56-stjerner).
 */

export type DuskTime = "early" | "late";
export type DuskSky = "clear" | "light_clouds" | "pink_clouds" | "dark" | "starry";
export type DuskStyle = "nordic_blue_hour_v2" | "warm_dusk_v3" | "late_evening_v1" | "summer_night_v1";

export interface DuskChoice {
  style: DuskStyle;
  sky: DuskSky;
}

/** Ett stilkort: tidspunktet backend krever, og de lovlige himlene (den foerste er standarden). */
export interface DuskCard {
  time: DuskTime;
  skies: readonly DuskSky[];
}

/**
 * Stilkortene (Dag 55, TG-NEW-259), i den rekkefoelgen de vises. Kontrakten er
 * `dusk_styles.STYLES` i backend: tid og himmel sendes som foer, og backend
 * svarer 400 paa et par som ikke passer stilen. Blå time og Sen kveld har
 * himmelvalg; de andre sender standarden. Vinterkveld er ikke med (ingen
 * bilder ennaa).
 */
export const DUSK_CARDS: Readonly<Record<DuskStyle, DuskCard>> = {
  nordic_blue_hour_v2: { time: "early", skies: ["light_clouds", "clear", "pink_clouds"] },
  warm_dusk_v3: { time: "early", skies: ["light_clouds"] },
  late_evening_v1: { time: "late", skies: ["dark", "starry"] },
  summer_night_v1: { time: "early", skies: ["light_clouds"] },
};

/** Stilene i den rekkefoelgen kortene vises. Den foerste er standarden. */
export const DUSK_STYLES: readonly DuskStyle[] = ["nordic_blue_hour_v2", "warm_dusk_v3", "late_evening_v1", "summer_night_v1"];
export const STYLE_BLUE: DuskStyle = "nordic_blue_hour_v2";
export const STYLE_LATE: DuskStyle = "late_evening_v1";
export const STYLE_SUMMER: DuskStyle = "summer_night_v1";

/** Koder fra jobber foer stilkortene. De kan ikke bestilles, bare vises. */
export const STYLE_V1 = "nordic_blue_hour_v1";
export const STYLE_V2 = "warm_dusk_v2";

export const DEFAULT_DUSK: DuskChoice = { style: STYLE_BLUE, sky: "light_clouds" };

/** Presetene der skumringsvalgene gjelder (nivaa 2). */
const DUSK_PRESETS: ReadonlySet<string> = new Set(["skumring", "skumring_interior"]);

export function isDuskStyle(style: string): style is DuskStyle {
  return Object.hasOwn(DUSK_CARDS, style);
}

export function isValidChoice(style: string, sky: string): boolean {
  return isDuskStyle(style) && (DUSK_CARDS[style].skies as readonly string[]).includes(sky);
}

/** Himmelknappene under kortene: bare for stiler med mer enn én himmel (Blå time, Sen kveld). */
export function skyChoices(style: DuskStyle): readonly DuskSky[] {
  const { skies } = DUSK_CARDS[style];
  return skies.length > 1 ? skies : [];
}

/** Nytt kort setter himmelen til standarden for stilen. Samme kort beholder himmelen. */
export function changeStyle(choice: DuskChoice, style: DuskStyle): DuskChoice {
  if (!isDuskStyle(style) || style === choice.style) return choice;
  return { style, sky: DUSK_CARDS[style].skies[0] };
}

/** Et himmelvalg som ikke passer stilen, ignoreres. */
export function changeSky(choice: DuskChoice, sky: DuskSky): DuskChoice {
  return isValidChoice(choice.style, sky) ? { ...choice, sky } : choice;
}

export function isDuskOrder(service: string, presetId: string | undefined): boolean {
  return service === "scene_transform" && presetId !== undefined && DUSK_PRESETS.has(presetId);
}

/**
 * Feltene til params_json. For skumring alltid alle tre, ogsaa uendret
 * standard; for alt annet ingen. Tiden kommer fra kortet. En ukjent stil
 * eller en himmel stilen ikke har, kaster
 * (feil i frontend, skjemaet skal aldri kunne lage det).
 */
export function duskParams(
  service: string,
  presetId: string | undefined,
  choice: DuskChoice
): { dusk_time: DuskTime; dusk_sky: DuskSky; dusk_style: DuskStyle } | Record<string, never> {
  if (!isDuskOrder(service, presetId)) return {};
  if (!isDuskStyle(choice.style)) {
    throw new Error(`ugyldig skumringsstil: ${choice.style}`);
  }
  if (!isValidChoice(choice.style, choice.sky)) {
    throw new Error(`ugyldig himmel for ${choice.style}: ${choice.sky}`);
  }
  return { dusk_time: DUSK_CARDS[choice.style].time, dusk_sky: choice.sky, dusk_style: choice.style };
}

/**
 * `dusk` fra review-svaret, som koder (lest i normalizeReview i api.ts).
 * Null naar feltet mangler (backend foer 2f-a).
 */
export interface ReviewDusk {
  time: string | null;
  sky: string | null;
  /** true: brukt, false: ingen himmel i bildet, null: ingen prompt ennaa. */
  skyApplied: boolean | null;
}

/** Hva faktaboksen viser: himmelen er "not_applied" naar sky_applied er false. */
export interface DuskFacts {
  time: string | null;
  sky: { kind: "code"; code: string | null } | { kind: "not_applied" };
}

export function duskFacts(dusk: ReviewDusk | null): DuskFacts | null {
  if (dusk === null) return null;
  return {
    time: dusk.time,
    sky: dusk.skyApplied === false ? { kind: "not_applied" } : { kind: "code", code: dusk.sky },
  };
}

/**
 * Stilen slik megleren ser den: en gammel jobb med v1 og sen tid er Sen kveld
 * (foer stilkortene var Sen kveld v1 + `late`, og Sen kveld faller fortsatt
 * tilbake dit). Andre koder staar som de er.
 */
export function displayStyle(code: string, time: string | null): string {
  return code === STYLE_V1 && time === "late" ? STYLE_LATE : code;
}

/** Blå time: himmelen staar alltid i meglerlinja, ogsaa standarden. */
const BLUE_HOUR: ReadonlySet<string> = new Set([STYLE_V1, STYLE_BLUE]);

/**
 * Den korte linja for megleren (TG-NEW-193, stilkortene Dag 55): stilen, og
 * himmelen for Blå time, som koder, f.eks. «Blå time · Lette skyer» eller
 * «Lys sommerkveld». Sen kveld viser himmelen bare naar den ikke er
 * standarden («Sen kveld · Stjernehimmel», men «Sen kveld» med moerk himmel;
 * Dag 56), saa eldre jobber vises som foer. Stilen er den runden ble laget
 * med, ellers den bestilte. Himmelen utelates naar den ikke ble brukt
 * (sky_applied false). null: ingen linje (dusk- eller stil-panelet er
 * skjult; de vises sammen for skumring).
 */
export function duskLine(
  dusk: ReviewDusk | null,
  style: ReviewStyle | null
): { style: string; sky: string | null } | null {
  if (dusk === null || style === null) return null;
  const name = displayStyle(style.applied ?? style.requested, dusk.time);
  const shown = BLUE_HOUR.has(name) || (name === STYLE_LATE && dusk.sky !== DUSK_CARDS[STYLE_LATE].skies[0]);
  const sky = shown && dusk.skyApplied !== false ? dusk.sky : null;
  return { style: name, sky };
}

/**
 * `style` fra review-svaret, som koder (TG-NEW-189). `applied` er null naar
 * gjeldende runde ikke har bygget noen prompt (f.eks. needs_review).
 */
export interface ReviewStyle {
  requested: string;
  applied: string | null;
}

/**
 * Stilen runden ble laget med, er en annen enn den bestilte (fallback, f.eks.
 * Varm skumring uten himmel). Sammenlignes etter displayStyle, ikke paa
 * kodene: Sen kveld som faller tilbake til v1 + `late`, er fortsatt Sen kveld
 * for megleren (Cowork 26.10, valg A). Admin ser kodene i Stil-raden.
 * null: ingen linje.
 */
export function styleFellBack(
  style: ReviewStyle | null,
  time: string | null
): { requested: string; applied: string } | null {
  if (style === null || style.applied === null) return null;
  const requested = displayStyle(style.requested, time);
  const applied = displayStyle(style.applied, time);
  return requested === applied ? null : { requested, applied };
}

/**
 * Stil-raden for admin: stilen som ble brukt, og den bestilte naar den er en
 * annen. null: ingen rad (ingen runde med prompt ennaa).
 */
export function styleFacts(style: ReviewStyle | null): { applied: string; requested: string | null } | null {
  if (style === null || style.applied === null) return null;
  return { applied: style.applied, requested: style.requested === style.applied ? null : style.requested };
}
