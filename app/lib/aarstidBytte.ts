import type { JobReviewDetail, StylingOrderResult } from "./api";
import { MAX_SEASONS, SEASONS, seasonOfPreset, SOURCE_SEASONS, TARGETS_BY_SOURCE, type Season, type SourceSeason } from "./aarstid.ts";
import { quotaView, type Quota } from "./quota.ts";

/**
 * «Lag i en annen årstid» (Dag 58, TG-NEW-273, A1): fra en ferdig
 * aarstidsjobb bestilles nye maalaarstider fra samme original
 * (POST /v1/jobs/{job_id}/aarstid). Det koster ett bilde av kvoten (Petter
 * 28.10); «Prøv igjen» i samme aarstid er fortsatt gratis (Korriger bildet).
 * Backend avgjoer uansett; her styrer reglene bare hva megleren ser og kan
 * velge. Rene funksjoner; bare type-import fra api.ts (den kaster ved import
 * naar NEXT_PUBLIC_API_BASE mangler).
 */

/** Statusene backend godtar (SEASON_SOURCE_STATUSES); andre gir 409 action_not_allowed. */
export const SWITCH_STATUSES: ReadonlySet<string> = new Set(["awaiting_approval", "succeeded"]);

export interface SeasonSwitch {
  /** Aarstiden bildet er tatt i, fra `disclosure.source_season`. */
  source: SourceSeason;
  /** Jobbens egen maalaarstid: grået ut, «Prøv igjen» er gratis. */
  own: Season;
  /** Maalene kilden stoetter (samme tabell som bestillingen), med `own`. */
  targets: readonly Season[];
}

type SwitchReview = Pick<JobReviewDetail, "presetId" | "status" | "isOwner" | "mediaDeletedAt" | "disclosure">;

/**
 * Valget for jobben, eller null naar knappen ikke vises: ikke en aarstidsjobb,
 * feil status, en annen brukers jobb (backend gir 409 ogsaa for admin),
 * slettede bilder, eller ukjent kilde (backend gir 409 season_source_missing).
 * Er det ingen andre maal enn jobbens egen aarstid, vises den heller ikke.
 */
export function seasonSwitch(review: SwitchReview): SeasonSwitch | null {
  const own = seasonOfPreset(review.presetId);
  if (own === null || !SWITCH_STATUSES.has(review.status)) return null;
  if (!review.isOwner || review.mediaDeletedAt != null) return null;
  const raw = review.disclosure?.sourceSeason ?? null;
  const source = SOURCE_SEASONS.find((s) => s === raw) ?? null;
  if (source === null) return null;
  const targets = TARGETS_BY_SOURCE[source];
  if (!targets.some((s) => s !== own)) return null;
  return { source, own, targets };
}

/**
 * Aarstidene som sendes, i SEASONS-rekkefoelgen, eller null naar «Bestill»
 * skal vaere av: ingen valgt, jobbens egen aarstid, et maal kilden ikke
 * stoetter, eller flere enn MAX_SEASONS. Ingenting kuttes i stillhet.
 */
export function switchSeasons(sw: SeasonSwitch, chosen: readonly Season[]): Season[] | null {
  if (chosen.includes(sw.own) || chosen.some((s) => !sw.targets.includes(s))) return null;
  const seasons = SEASONS.filter((s) => chosen.includes(s));
  if (seasons.length === 0 || seasons.length > MAX_SEASONS) return null;
  return seasons;
}

/** Legger til eller tar bort en aarstid. Jobbens egen og ulovlige legges aldri til. */
export function toggleSwitchSeason(sw: SeasonSwitch, chosen: readonly Season[], season: Season): Season[] {
  if (chosen.includes(season)) return chosen.filter((s) => s !== season);
  if (season === sw.own || !sw.targets.includes(season) || chosen.length >= MAX_SEASONS) return [...chosen];
  return [...chosen, season];
}

/**
 * Kostlinja under knappen. Admin og redaktoer har ingen kvote
 * (`limited: false`): ingen linje. Ukjent kvote (henter, 503): «Koster 1
 * bilde» uten tall. Tom kvote: knappen er grå, ikke skjult.
 */
export type SwitchCost =
  | { kind: "none" }
  | { kind: "unknown" }
  | { kind: "counter"; remaining: number };

export function switchCost(quota: Quota | null): SwitchCost {
  if (quota === null) return { kind: "unknown" };
  if (!quota.limited) return { kind: "none" };
  return { kind: "counter", remaining: Math.max(0, quota.remaining) };
}

/** Grå knapp: bare naar kvoten er kjent og brukt opp. */
export function switchExhausted(quota: Quota | null): boolean {
  return quotaView(quota).kind === "exhausted";
}

/** Den nye bestillingen aapnes paa foerste jobb som ble startet; null naar ingen ble det. */
export function firstStartedJob(result: Pick<StylingOrderResult, "jobs">): string | null {
  return result.jobs.find((j) => j.jobId !== null)?.jobId ?? null;
}

/**
 * `Idempotency-Key` for knappen. Ny noekkel for hvert nytt valg; et nytt
 * klikk med samme jobb og samme aarstider etter et forsoek uten 202 er samme
 * bestilling og faar samme noekkel, saa backend aldri trekker to ganger om
 * det foerste kallet egentlig kom fram (som OrderKeys). Etter 202 er neste
 * klikk en ny bestilling.
 */
export class SwitchKeys {
  private pending: { id: string; key: string } | null = null;
  private readonly newKey: () => string;

  constructor(newKey: () => string = () => crypto.randomUUID()) {
    this.newKey = newKey;
  }

  keyFor(jobId: string, seasons: readonly Season[]): string {
    const id = JSON.stringify([jobId, seasons]);
    if (this.pending !== null && this.pending.id === id) return this.pending.key;
    const key = this.newKey();
    this.pending = { id, key };
    return key;
  }

  accepted(): void {
    this.pending = null;
  }
}
