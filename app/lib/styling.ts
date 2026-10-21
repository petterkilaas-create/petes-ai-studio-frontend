import type { OrderJob, StylingOrderParams } from "./api";
import type { ProcessStatus } from "../hooks/processStatus";

/**
 * Digital styling (S2-f, KONTRAKT_BESTILLING): én bestilling er ett bilde,
 * ett romvalg og alle tre stilene, og koster én kvote-enhet. Kortet staar
 * bak `ENABLED.digital_styling` (av til S4). Rene funksjoner, saa reglene
 * kan testes med node --test; bare type-importer (api.ts kaster ved import
 * naar NEXT_PUBLIC_API_BASE mangler).
 *
 * Feltet heter etter moebleringen, ikke rommet (`furnish_as`, S1-auditen
 * §2): etiketten er «Møbler som soverom», aldri «Soverom».
 */

/** Stilene i den rekkefoelgen jobbene startes og kortene vises. */
export const STYLING_STYLES = ["styling_skandinavisk", "styling_familie", "styling_moderne"] as const;
export type StylingStyle = (typeof STYLING_STYLES)[number];

/** Hoeyst tre stiler per bestilling (kontrakten), saa hooken har tre faste poll-kall. */
export const MAX_ORDER_JOBS = 3;

/**
 * Romvalgene i velgeren ved lansering (Petter 15.27). Backend godtar ogsaa
 * `kids_room` og `home_office`, men de vises ikke.
 */
export const FURNISH_AS_CHOICES = [
  "living",
  "living_dining",
  "bedroom",
  "kitchen_dining",
  "bathroom_decor",
  "hallway",
  "balcony_terrace",
] as const;
export type FurnishAs = (typeof FURNISH_AS_CHOICES)[number];

export interface StylingChoice {
  /** null til megleren har valgt: ingen romtype er forhaandsvalgt. */
  furnishAs: FurnishAs | null;
  /** «Rommet er tomt for løse møbler» (Petter 3A). */
  roomEmpty: boolean;
}

export const EMPTY_STYLING: StylingChoice = { furnishAs: null, roomEmpty: false };

/** `params_json` for bestillingen, eller null naar valget ikke er komplett (da er «Bestill» av). */
export function stylingParams(choice: StylingChoice): StylingOrderParams | null {
  if (choice.furnishAs === null || !choice.roomEmpty) return null;
  return { styles: [...STYLING_STYLES], furnish_as: choice.furnishAs, room_empty_confirmed: true };
}

/** `service` i OrderKeys: bestillingen har ikke eget service-felt. */
export const STYLING_ORDER_SERVICE = "styling_order";

/**
 * Jobben som skal polles for en rad, eller null: `not_started` (og en rad
 * uten id) polles aldri. useJobStatus(null) gjoer ingen kall.
 */
export function pollJobId(job: OrderJob | undefined): string | null {
  if (job === undefined || job.status === "not_started") return null;
  return job.jobId;
}

/**
 * Samlet status for bestillingen (merket oeverst paa Tjenester). Ikke
 * startet regnes som feilet (Petter 21.10). Alle feilet: kvoten kan vaere
 * gitt tilbake, saa siden henter den paa nytt.
 */
export function orderStatus(input: {
  isSubmitting: boolean;
  failed: boolean;
  cards: readonly { notStarted: boolean; status: ProcessStatus }[];
}): ProcessStatus {
  const { isSubmitting, failed, cards } = input;
  if (isSubmitting) return "uploading";
  if (failed) return "failed";
  if (cards.length === 0) return "idle";
  const statuses = cards.map((c) => (c.notStarted ? "failed" : c.status));
  if (statuses.some((s) => s === "uploading" || s === "running" || s === "idle")) return "running";
  if (statuses.some((s) => s === "awaiting_approval" || s === "needs_review")) return "awaiting_approval";
  if (statuses.every((s) => s === "failed")) return "failed";
  return statuses.every((s) => s === statuses[0]) ? statuses[0] : "done";
}
