/**
 * Skumringsvalg (2f-b, Petter 29.09): tidspunkt og himmel naar megleren
 * bestiller skumring. Rene funksjoner uten import, saa de kan testes med
 * node --test (api.ts kaster ved import naar NEXT_PUBLIC_API_BASE mangler).
 *
 * Kontrakt: ~/dev/_handoff/KONTRAKT_2F.md. Backend sender og tar imot bare
 * koder; tekstene ligger i ordlista (kodegruppene duskTime og duskSky).
 * Valgene kan ikke endres i «Rett» eller ved «Send videre» (kommer i 2f-c).
 */

export type DuskTime = "early" | "late";
export type DuskSky = "clear" | "light_clouds" | "pink_clouds" | "dark" | "starry";

export interface DuskChoice {
  time: DuskTime;
  sky: DuskSky;
}

export const DUSK_TIMES: readonly DuskTime[] = ["early", "late"];

/** Lovlige himmelvalg per tidspunkt. Det foerste er standarden. */
export const DUSK_SKY_BY_TIME: Readonly<Record<DuskTime, readonly DuskSky[]>> = {
  early: ["clear", "light_clouds", "pink_clouds"],
  late: ["dark", "starry"],
};

export const DEFAULT_DUSK: DuskChoice = { time: "early", sky: "clear" };

/** Presetene der skumringsvalgene gjelder (nivaa 2). */
const DUSK_PRESETS: ReadonlySet<string> = new Set(["skumring", "skumring_interior"]);

export function defaultSky(time: DuskTime): DuskSky {
  return DUSK_SKY_BY_TIME[time][0];
}

export function isValidPair(time: string, sky: string): boolean {
  return Object.hasOwn(DUSK_SKY_BY_TIME, time) &&
    (DUSK_SKY_BY_TIME[time as DuskTime] as readonly string[]).includes(sky);
}

/** Nytt tidspunkt setter himmelen til standarden for tidspunktet. */
export function changeTime(choice: DuskChoice, time: DuskTime): DuskChoice {
  return time === choice.time ? choice : { time, sky: defaultSky(time) };
}

/** Et himmelvalg som ikke passer tidspunktet, ignoreres. */
export function changeSky(choice: DuskChoice, sky: DuskSky): DuskChoice {
  return isValidPair(choice.time, sky) ? { ...choice, sky } : choice;
}

export function isDuskOrder(service: string, presetId: string | undefined): boolean {
  return service === "scene_transform" && presetId !== undefined && DUSK_PRESETS.has(presetId);
}

/**
 * Feltene til params_json. For skumring alltid begge, ogsaa uendret
 * standard; for alt annet ingen. Et ugyldig par kaster (feil i frontend,
 * skjemaet skal aldri kunne lage det).
 */
export function duskParams(
  service: string,
  presetId: string | undefined,
  choice: DuskChoice
): { dusk_time: DuskTime; dusk_sky: DuskSky } | Record<string, never> {
  if (!isDuskOrder(service, presetId)) return {};
  if (!isValidPair(choice.time, choice.sky)) {
    throw new Error(`ugyldig skumringsvalg: ${choice.time}/${choice.sky}`);
  }
  return { dusk_time: choice.time, dusk_sky: choice.sky };
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
 * Den korte linja for megleren (TG-NEW-193): bare valgene, som koder, f.eks.
 * «Tidlig skumring · Klar blå time». Himmelen utelates naar den ikke ble brukt
 * (sky_applied false), og et felt som mangler, utelates. null: ingen linje.
 */
export function duskLine(dusk: ReviewDusk | null): { time: string | null; sky: string | null } | null {
  if (dusk === null) return null;
  const sky = dusk.skyApplied === false ? null : dusk.sky;
  if (dusk.time === null && sky === null) return null;
  return { time: dusk.time, sky };
}
