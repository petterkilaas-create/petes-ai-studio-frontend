/**
 * Skumringsvalg (2f-b, Petter 29.09): tidspunkt og himmel naar megleren
 * bestiller skumring. Rene funksjoner uten import, saa de kan testes med
 * node --test (api.ts kaster ved import naar NEXT_PUBLIC_API_BASE mangler).
 *
 * Kontrakt: ~/dev/_handoff/KONTRAKT_2F.md. Backend sender og tar imot bare
 * koder; tekstene ligger i ordlista (kodegruppene duskTime og duskSky).
 * Valgene kan ikke endres i «Rett» eller ved «Send videre» (kommer i 2f-c).
 *
 * Stil v2 (TG-NEW-189): stilen (`dusk_style`) er en del av valget. Varm
 * skumring brukes bare paa utebilder med synlig himmel og minst én lampe;
 * ellers lager backend bildet med standardstilen og tid og himmel.
 * `warm_dusk` er himmelen backend viser for en v2-runde, aldri et valg
 * megleren kan sende, saa den ligger bare i ordlista, ikke i DuskSky.
 */

export type DuskTime = "early" | "late";
export type DuskSky = "clear" | "light_clouds" | "pink_clouds" | "dark" | "starry";
export type DuskStyle = "nordic_blue_hour_v1" | "warm_dusk_v2";

export interface DuskChoice {
  time: DuskTime;
  sky: DuskSky;
  style: DuskStyle;
}

export const DUSK_TIMES: readonly DuskTime[] = ["early", "late"];

/** Stilene i den rekkefoelgen knappene vises. Den foerste er standarden. */
export const DUSK_STYLES: readonly DuskStyle[] = ["nordic_blue_hour_v1", "warm_dusk_v2"];
export const STYLE_V1: DuskStyle = "nordic_blue_hour_v1";
export const STYLE_V2: DuskStyle = "warm_dusk_v2";

/** Lovlige himmelvalg per tidspunkt. Det foerste er standarden. */
export const DUSK_SKY_BY_TIME: Readonly<Record<DuskTime, readonly DuskSky[]>> = {
  early: ["clear", "light_clouds", "pink_clouds"],
  late: ["dark", "starry"],
};

export const DEFAULT_DUSK: DuskChoice = { time: "early", sky: "clear", style: STYLE_V1 };

/** Presetene der skumringsvalgene gjelder (nivaa 2). */
const DUSK_PRESETS: ReadonlySet<string> = new Set(["skumring", "skumring_interior"]);

export function defaultSky(time: DuskTime): DuskSky {
  return DUSK_SKY_BY_TIME[time][0];
}

export function isValidPair(time: string, sky: string): boolean {
  return Object.hasOwn(DUSK_SKY_BY_TIME, time) &&
    (DUSK_SKY_BY_TIME[time as DuskTime] as readonly string[]).includes(sky);
}

/** Nytt tidspunkt setter himmelen til standarden for tidspunktet. Stilen staar. */
export function changeTime(choice: DuskChoice, time: DuskTime): DuskChoice {
  return time === choice.time ? choice : { ...choice, time, sky: defaultSky(time) };
}

/** Ny stil: tid og himmel staar (de brukes hvis varm skumring ikke passer). */
export function changeStyle(choice: DuskChoice, style: DuskStyle): DuskChoice {
  return DUSK_STYLES.includes(style) ? { ...choice, style } : choice;
}

/** Et himmelvalg som ikke passer tidspunktet, ignoreres. */
export function changeSky(choice: DuskChoice, sky: DuskSky): DuskChoice {
  return isValidPair(choice.time, sky) ? { ...choice, sky } : choice;
}

export function isDuskOrder(service: string, presetId: string | undefined): boolean {
  return service === "scene_transform" && presetId !== undefined && DUSK_PRESETS.has(presetId);
}

/**
 * Feltene til params_json. For skumring alltid alle tre, ogsaa uendret
 * standard; for alt annet ingen. Et ugyldig par eller en ukjent stil kaster
 * (feil i frontend, skjemaet skal aldri kunne lage det).
 */
export function duskParams(
  service: string,
  presetId: string | undefined,
  choice: DuskChoice
): { dusk_time: DuskTime; dusk_sky: DuskSky; dusk_style: DuskStyle } | Record<string, never> {
  if (!isDuskOrder(service, presetId)) return {};
  if (!isValidPair(choice.time, choice.sky)) {
    throw new Error(`ugyldig skumringsvalg: ${choice.time}/${choice.sky}`);
  }
  if (!DUSK_STYLES.includes(choice.style)) {
    throw new Error(`ugyldig skumringsstil: ${choice.style}`);
  }
  return { dusk_time: choice.time, dusk_sky: choice.sky, dusk_style: choice.style };
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

/** Himmelen backend viser for en runde laget med varm skumring (DUSK_BY_STYLE). */
export const WARM_DUSK_SKY = "warm_dusk";

/**
 * Den korte linja for megleren (TG-NEW-193): bare valgene, som koder, f.eks.
 * «Tidlig skumring · Klar blå time». Himmelen utelates naar den ikke ble brukt
 * (sky_applied false), og et felt som mangler, utelates. null: ingen linje.
 * En runde med varm skumring viser bare himmelen («Varm skumring»), ikke
 * «Tidlig skumring · Varm skumring» (TG-NEW-189).
 */
export function duskLine(dusk: ReviewDusk | null): { time: string | null; sky: string | null } | null {
  if (dusk === null) return null;
  const sky = dusk.skyApplied === false ? null : dusk.sky;
  if (sky === WARM_DUSK_SKY) return { time: null, sky };
  if (dusk.time === null && sky === null) return null;
  return { time: dusk.time, sky };
}

/**
 * `style` fra review-svaret, som koder (TG-NEW-189). `applied` er null naar
 * gjeldende runde ikke har bygget noen prompt (f.eks. needs_review).
 */
export interface ReviewStyle {
  requested: string;
  applied: string | null;
}

/** Jobben ba om varm skumring, men runden ble laget med standardstilen. */
export function styleFellBack(style: ReviewStyle | null): boolean {
  return style !== null && style.requested === STYLE_V2 && style.applied === STYLE_V1;
}

/**
 * Stil-raden for admin: stilen som ble brukt, og den bestilte naar den er en
 * annen. null: ingen rad (ingen runde med prompt ennaa).
 */
export function styleFacts(style: ReviewStyle | null): { applied: string; requested: string | null } | null {
  if (style === null || style.applied === null) return null;
  return { applied: style.applied, requested: style.requested === style.applied ? null : style.requested };
}
