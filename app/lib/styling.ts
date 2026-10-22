import type { OrderJob, StylingOrderParams } from "./api";
import type { ProcessStatus } from "../hooks/processStatus";

/**
 * Digital styling (S2-f og S3-f, KONTRAKT_BESTILLING): én bestilling er
 * ett bilde, ett romvalg og 1–8 stiler megleren velger, og koster én
 * kvote-enhet (Petter 21.10). Kortet staar bak `ENABLED.digital_styling`
 * (paa fra S4, Dag 51). Rene funksjoner, saa reglene kan testes med node --test; bare
 * type-importer (api.ts kaster ved import naar NEXT_PUBLIC_API_BASE mangler).
 *
 * Feltet heter etter moebleringen, ikke rommet (`furnish_as`, S1-auditen
 * §2): etiketten er «Møbler som soverom», aldri «Soverom».
 */

/**
 * De aatte stilene (S3-f) i den faste rekkefoelgen jobbene startes og kortene
 * vises, samme som `ST_STYLE` i backend.
 */
export const STYLING_STYLES = [
  "styling_moderne_nordisk",
  "styling_varm_minimalisme",
  "styling_japandi",
  "styling_nordisk_klassisk",
  "styling_dansk_farge",
  "styling_by_vintage",
  "styling_hytte_fjell",
  "styling_nordisk_kyst",
] as const;
export type StylingStyle = (typeof STYLING_STYLES)[number];
type ShortOf<T> = T extends `styling_${infer S}` ? S : never;
/** Id-en uten `styling_`, brukt i ordlista (`styling.style.<kort>`). */
export type StylingShort = ShortOf<StylingStyle>;

export function styleShort(style: StylingStyle): StylingShort {
  return style.slice("styling_".length) as StylingShort;
}

/** Hoeyst aatte stiler per bestilling (kontrakten), saa hooken har aatte faste poll-kall. */
export const MAX_ORDER_JOBS = 8;

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
  /** Stilene megleren har valgt. Ingen er forhaandsvalgt. */
  styles: StylingStyle[];
}

export const EMPTY_STYLING: StylingChoice = { furnishAs: null, roomEmpty: false, styles: [] };

/** Legger til stilen, eller tar den bort om den er valgt. */
export function toggleStyle(styles: readonly StylingStyle[], id: StylingStyle): StylingStyle[] {
  return styles.includes(id) ? styles.filter((s) => s !== id) : [...styles, id];
}

/**
 * `params_json` for bestillingen, eller null naar valget ikke er komplett (da
 * er «Bestill» av). Stilene sendes uten duplikater og i den faste
 * rekkefoelgen, saa `Idempotency-Key` og duplikatsvaret blir stabile.
 */
export function stylingParams(choice: StylingChoice): StylingOrderParams | null {
  if (choice.furnishAs === null || !choice.roomEmpty) return null;
  const styles = STYLING_STYLES.filter((s) => choice.styles.includes(s));
  if (styles.length === 0) return null;
  return { styles, furnish_as: choice.furnishAs, room_empty_confirmed: true };
}

/**
 * Minste ventetid mellom to poll per kort naar jobben venter (S3-auditen §2):
 * 2 s × ⌈n/3⌉, minst 2 s. 1–3 stiler gir 2 s, 4–6 gir 4 s og 7–8 gir 6 s.
 */
export function orderPollDelayMs(jobCount: number): number {
  return 2000 * Math.max(1, Math.ceil(jobCount / 3));
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
