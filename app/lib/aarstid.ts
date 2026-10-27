import type { AarstidOrderParams } from "./api";
import { t, type Locale, type UiKey } from "./i18n/index.ts";

/**
 * Aarstider (TG-NEW-271, Dag 57): ett bilde, kilden («Når er bildet tatt?»)
 * og 1–3 maalaarstider, én kvote-enhet per bestilling og én jobb per
 * aarstid (POST /v1/orders/aarstid). Reglene speiler backend
 * (`prompt_modules_aarstid.py`: SEASONS, SOURCE_SEASONS og TEXT_BY_PAIR).
 * Backend avgjoer uansett; her styrer de bare hva megleren kan velge.
 * Rene funksjoner, saa reglene kan testes med node --test; bare type-import
 * fra api.ts (den kaster ved import naar NEXT_PUBLIC_API_BASE mangler).
 */

/** Aarstidene i fast rekkefoelge (backend SEASONS). vaar er sen vaar, vinter er snoe. */
export const SEASONS = ["hoest", "vaar", "sommer", "vinter"] as const;
export type Season = (typeof SEASONS)[number];

/**
 * Kildene megleren kan velge, i rekkefoelgen paa knappene (Sommer, Høst,
 * Vår). Vinter som kilde stoettes ikke ennaa (backend gir 400
 * season_source_not_supported), saa den vises ikke.
 */
export const SOURCE_SEASONS = ["sommer", "hoest", "vaar"] as const satisfies readonly Season[];
export type SourceSeason = (typeof SOURCE_SEASONS)[number];

/**
 * De lovlige maalene per kilde (backend TEXT_BY_PAIR), i SEASONS-rekkefoelgen.
 * Aldri samme aarstid som kilden, og ikke vaar til sommer i foerste versjon.
 */
export const TARGETS_BY_SOURCE: Readonly<Record<SourceSeason, readonly Season[]>> = {
  sommer: ["hoest", "vaar", "vinter"],
  vaar: ["hoest", "vinter"],
  hoest: ["vaar", "sommer", "vinter"],
};

/** Hoeyst tre aarstider per bestilling (backend ORDER_MAX_SEASONS). */
export const MAX_SEASONS = 3;

/** Forhaandsvalget per maalaarstid (backend PRESET_BY_SEASON). */
export const AARSTID_PRESETS: Readonly<Record<Season, string>> = {
  hoest: "aarstid_hoest",
  vaar: "aarstid_vaar",
  sommer: "aarstid_sommer",
  vinter: "aarstid_vinter",
};

/** `service` i OrderKeys for aarstider: skiller noekkelen fra en styling-bestilling. */
export const AARSTID_ORDER_SERVICE = "aarstid_order";

export interface AarstidChoice {
  /** null til megleren har valgt: ingen kilde er forhaandsvalgt. */
  source: SourceSeason | null;
  /** Maalaarstidene megleren har valgt. Ingen er forhaandsvalgt. */
  seasons: Season[];
}

export const EMPTY_AARSTID: AarstidChoice = { source: null, seasons: [] };

/** De lovlige maalene for kilden; ingen kilde gir ingen. */
export function targetsFor(source: SourceSeason | null): readonly Season[] {
  return source === null ? [] : TARGETS_BY_SOURCE[source];
}

/**
 * Ny kilde: maalene som ikke er lovlige for den, tas bort (aldri samme som
 * kilden). De som fortsatt er lovlige, staar.
 */
export function chooseSource(choice: AarstidChoice, source: SourceSeason): AarstidChoice {
  const allowed = targetsFor(source);
  return { source, seasons: choice.seasons.filter((s) => allowed.includes(s)) };
}

/**
 * Legger til aarstiden, eller tar den bort om den er valgt. Et maal som ikke
 * er lovlig for kilden, legges aldri til, og med MAX_SEASONS valgt legges
 * ingen ny til. En valgt kan alltid tas bort.
 */
export function toggleSeason(choice: AarstidChoice, season: Season): AarstidChoice {
  if (choice.seasons.includes(season)) return { ...choice, seasons: choice.seasons.filter((s) => s !== season) };
  if (!targetsFor(choice.source).includes(season) || choice.seasons.length >= MAX_SEASONS) {
    return { ...choice, seasons: [...choice.seasons] };
  }
  return { ...choice, seasons: [...choice.seasons, season] };
}

/**
 * `params_json` for bestillingen, eller null naar valget ikke er komplett
 * (da er «Bestill» av). Aarstidene sendes uten duplikater og i den faste
 * rekkefoelgen (SEASONS), saa `Idempotency-Key` blir stabil. Et maal som ikke
 * er lovlig for kilden, eller flere enn MAX_SEASONS, gir null: ingenting
 * sendes, og ingen aarstid kuttes. Bildetypen er alltid «Utendørs», det eneste
 * backend godtar for aarstider.
 */
export function aarstidParams(choice: AarstidChoice): AarstidOrderParams | null {
  if (choice.source === null || !(SOURCE_SEASONS as readonly string[]).includes(choice.source)) return null;
  const allowed = targetsFor(choice.source);
  if (choice.seasons.some((s) => !allowed.includes(s))) return null;
  const seasons = SEASONS.filter((s) => choice.seasons.includes(s));
  if (seasons.length === 0 || seasons.length > MAX_SEASONS) return null;
  return { seasons, source_season: choice.source, image_type_hint: "exterior" };
}

/** Aarstiden som ord («Høst»), til knappene, fanene og linjene i historikken. */
export function seasonKey(season: Season): UiKey {
  return `aarstid.season.${season}`;
}

/** Er oppskriften en aarstid (`aarstid_…`)? */
export function isAarstidPreset(presetId: string | null | undefined): boolean {
  return presetId != null && presetId.startsWith("aarstid_");
}

/** Maalaarstiden for et forhaandsvalg, eller null for en ukjent eller annen oppskrift. */
export function seasonOfPreset(presetId: string | null | undefined): Season | null {
  return SEASONS.find((s) => AARSTID_PRESETS[s] === presetId) ?? null;
}

/** Aarstiden som tekst («Høst») for et forhaandsvalg, eller null for alt annet. */
export function seasonText(locale: Locale, presetId: string | null | undefined): string | null {
  const season = seasonOfPreset(presetId);
  return season === null ? null : t(locale, seasonKey(season));
}

/**
 * Teksten i den faste bestillingslinja: for eksempel «2 årstider · Tatt om
 * sommeren». `missing` er det foerste som mangler for at «Bestill» skal
 * virke (kilden, saa en aarstid), eller null naar valget er komplett.
 */
export function aarstidSummary(
  locale: Locale,
  choice: AarstidChoice
): { text: string; short: string; missing: string | null } {
  const n = choice.seasons.length;
  const seasons = t(locale, n === 0 ? "aarstid.summary.seasons.0" : n === 1 ? "aarstid.summary.seasons.1" : "aarstid.summary.seasons.n", { n });
  const source = t(locale, choice.source === null ? "aarstid.summary.noSource" : `aarstid.summary.source.${choice.source}`);
  const missing =
    choice.source === null
      ? t(locale, "aarstid.summary.missingSource")
      : n === 0
        ? t(locale, "aarstid.summary.missingSeason")
        : null;
  const text = [seasons, source].join(" · ");
  return { text, short: text, missing };
}
