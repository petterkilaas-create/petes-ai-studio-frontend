import type { OrderJob, StylingOrderParams } from "./api";
import type { ProcessStatus } from "../hooks/processStatus";
import { codeText, t, type Locale } from "./i18n/index.ts";
import { presetLabelKey } from "./presets.ts";

/**
 * Digital styling (S2-f og S3-f, KONTRAKT_BESTILLING): én bestilling er
 * ett bilde, ett romvalg og 1–3 stiler megleren velger (F1, Petter 25.10), og koster én
 * kvote-enhet (Petter 21.10). Kortet staar bak `ENABLED.digital_styling`
 * (paa fra S4, Dag 51). Rene funksjoner, saa reglene kan testes med node --test; bare
 * type-importer (api.ts kaster ved import naar NEXT_PUBLIC_API_BASE mangler).
 *
 * Feltet heter etter moebleringen, ikke rommet (`furnish_as`, S1-auditen
 * §2): etiketten er «Møbler som soverom», aldri «Soverom».
 */

/**
 * De 14 stilene (stilene v3, TG-NEW-257) i nr-rekkefoelgen 01–14 fra
 * `stilnavn_v3.json`. Det er menyens rekkefoelge og rekkefoelgen jobbene
 * sendes i. Backend krever ingen bestemt rekkefoelge.
 */
export const STYLING_STYLES = [
  "styling_moderne_nordisk",
  "styling_japandi",
  "styling_nordisk_klassisk",
  "styling_varm_minimalisme",
  "styling_sekelskifte",
  "styling_funkis",
  "styling_by_vintage",
  "styling_syttitall",
  "styling_dansk_farge",
  "styling_pastell",
  "styling_nordisk_kyst",
  "styling_hytte_tradisjon",
  "styling_hytte_fjell",
  "styling_urban_industri",
] as const;
export type StylingStyle = (typeof STYLING_STYLES)[number];
type ShortOf<T> = T extends `styling_${infer S}` ? S : never;
/** Id-en uten `styling_`, brukt i ordlista (`styling.style.<kort>`). */
export type StylingShort = ShortOf<StylingStyle>;

export function styleShort(style: StylingStyle): StylingShort {
  return style.slice("styling_".length) as StylingShort;
}

/** Er oppskriften Digital styling (`styling_…`, ogsaa de tre fra S2-f)? */
export function isStylingPreset(presetId: string | null | undefined): boolean {
  return presetId != null && presetId.startsWith("styling_");
}

/**
 * Stilen som tekst paa godkjenningssiden (B2): «Fargerik eklektisk» for de
 * 14, kortetiketten for de tre fra S2-f («Digital styling – skandinavisk»),
 * og null for en ukjent stil eller en oppskrift som ikke er styling.
 */
export function styleText(locale: Locale, presetId: string | null | undefined): string | null {
  if (!isStylingPreset(presetId)) return null;
  const style = STYLING_STYLES.find((s) => s === presetId);
  if (style !== undefined) return t(locale, `styling.style.${styleShort(style)}`);
  const key = presetLabelKey("scene_transform", presetId);
  return key === null ? null : t(locale, key);
}

/**
 * Hoeyst tre stiler per bestilling (F1, Petter 25.10). Backend godtar aatte
 * til B1 er live; hooken har fortsatt aatte faste poll-kall.
 */
export const MAX_ORDER_JOBS = 3;

/**
 * Romvalgene i velgeren, i samme rekkefoelge som `ST_ROOM` i backend. Sju
 * ved lansering (Petter 15.27); barnerom og kontor kom med i B2 (Petter
 * 22.10 kl. 17.48), etter sluttesten.
 */
export const FURNISH_AS_CHOICES = [
  "living",
  "living_dining",
  "bedroom",
  "kids_room",
  "kitchen_dining",
  "bathroom_decor",
  "hallway",
  "home_office",
  "balcony_terrace",
] as const;
export type FurnishAs = (typeof FURNISH_AS_CHOICES)[number];

/**
 * Pyntnivaaene megleren kan velge (TG-NEW-257, Petter 12.43): Lite, Middels
 * og Mye. «Anbefalt for stilen» er null og sendes ikke; da bruker backend
 * stilens eget nivaa.
 */
export const DECOR_LEVELS = [1, 3, 5] as const;
export type DecorLevel = (typeof DECOR_LEVELS)[number];

export interface StylingChoice {
  /** null til megleren har valgt: ingen romtype er forhaandsvalgt. */
  furnishAs: FurnishAs | null;
  /** «Rommet er tomt for løse møbler» (Petter 3A). */
  roomEmpty: boolean;
  /** Stilene megleren har valgt. Ingen er forhaandsvalgt. */
  styles: StylingStyle[];
  /** Mengde pynt; null er «Anbefalt for stilen», valgt fra start. */
  decor: DecorLevel | null;
  /**
   * Meglerens oensker (TG-NEW-250), tom fra start. Sendes bare for stuene
   * (WISH_ROOMS); i et annet rom kan teksten staa, men den foelger ikke med.
   */
  wishes: string;
}

export const EMPTY_STYLING: StylingChoice = { furnishAs: null, roomEmpty: false, styles: [], decor: null, wishes: "" };

/**
 * Rommene der oenskefeltet vises og `wishes` sendes (Petter 24.10 og 26.10):
 * planleggeren kjoerer bare for stuene. Backend gir 400 for andre rom.
 */
export const WISH_ROOMS = ["living", "living_dining"] as const satisfies readonly FurnishAs[];

/** Hoeyst 300 tegn, talt i kodepunkter som i backend. */
export const WISHES_MAX = 300;

export function isWishRoom(room: FurnishAs | null): boolean {
  return room !== null && (WISH_ROOMS as readonly FurnishAs[]).includes(room);
}

/** Antall tegn i kodepunkter (`Array.from`), som backend teller: en emoji er ett tegn. */
export function wishesLength(text: string): number {
  return Array.from(text).length;
}

/** Teksten klemt til WISHES_MAX kodepunkter (feltet, som paa lerretet). */
export function clampWishes(text: string): string {
  return wishesLength(text) <= WISHES_MAX ? text : Array.from(text).slice(0, WISHES_MAX).join("");
}

/**
 * Forslagene aa trykke paa (testet i oenskeproben, Dag 54). `text` er det som
 * legges i feltet og sendes, alltid paa norsk (tekst til planleggeren);
 * knappen viser `styling.wish.<id>` paa brukerens spraak.
 */
export const WISH_SUGGESTIONS = {
  sofa_window: "Sofaen mot vinduet",
  round_table: "Rundt spisebord",
  long_table: "Langbord til åtte personer",
  table_window: "Spisebordet ved vinduet",
  no_armchair: "Ingen lenestol",
  door_free: "Hold området ved døra fritt",
} as const;
export type WishSuggestion = keyof typeof WISH_SUGGESTIONS;

const SUGGESTIONS_BY_ROOM: Readonly<Record<(typeof WISH_ROOMS)[number], readonly WishSuggestion[]>> = {
  living: ["sofa_window", "no_armchair", "door_free"],
  living_dining: ["sofa_window", "round_table", "long_table", "table_window", "no_armchair", "door_free"],
};

/** Forslagene for rommet, i fast rekkefoelge; ingen for andre rom. */
export function wishSuggestions(room: FurnishAs | null): readonly WishSuggestion[] {
  return room === "living" || room === "living_dining" ? SUGGESTIONS_BY_ROOM[room] : [];
}

/**
 * Teksten med forslaget lagt til, med «. » mellom (bare mellomrom naar teksten
 * alt slutter med punktum), eller null naar det ikke er plass innenfor WISHES_MAX.
 */
export function addSuggestion(text: string, id: WishSuggestion): string | null {
  const suggestion = WISH_SUGGESTIONS[id];
  const base = text.trimEnd();
  const next = base === "" ? suggestion : `${base}${base.endsWith(".") ? " " : ". "}${suggestion}`;
  return wishesLength(next) <= WISHES_MAX ? next : null;
}

/**
 * Legger til stilen, eller tar den bort om den er valgt. Med MAX_ORDER_JOBS
 * valgt legges ingen ny til; en valgt kan alltid tas bort.
 */
export function toggleStyle(styles: readonly StylingStyle[], id: StylingStyle): StylingStyle[] {
  if (styles.includes(id)) return styles.filter((s) => s !== id);
  return styles.length >= MAX_ORDER_JOBS ? [...styles] : [...styles, id];
}

/**
 * `params_json` for bestillingen, eller null naar valget ikke er komplett (da
 * er «Bestill» av). Stilene sendes uten duplikater og i den faste
 * rekkefoelgen, saa `Idempotency-Key` og duplikatsvaret blir stabile. Flere
 * enn MAX_ORDER_JOBS gir ogsaa null: ingenting sendes, og ingen stil kuttes.
 * `decor_level` sendes bare for 1, 3 og 5; et annet nivaa gir null paa samme
 * maate, saa valget aldri endres stille. `wishes` (trimmet) sendes bare for
 * stuene og bare naar det ikke er tomt; over WISHES_MAX gir null. Oensket er
 * med i params, saa `Idempotency-Key` skiller bestillinger med ulike oensker.
 */
export function stylingParams(choice: StylingChoice): StylingOrderParams | null {
  if (choice.furnishAs === null || !choice.roomEmpty) return null;
  const styles = STYLING_STYLES.filter((s) => choice.styles.includes(s));
  if (styles.length === 0 || styles.length > MAX_ORDER_JOBS) return null;
  let params: StylingOrderParams = { styles, furnish_as: choice.furnishAs, room_empty_confirmed: true };
  if (choice.decor !== null) {
    if (!DECOR_LEVELS.includes(choice.decor)) return null;
    params = { ...params, decor_level: choice.decor };
  }
  // Oensket sist, og bare for stuene og naar det ikke er tomt (TG-NEW-250).
  // Uten oenske er params byte-like med foer, og noekkelen utelates helt.
  if (!isWishRoom(choice.furnishAs)) return params;
  const wishes = choice.wishes.trim();
  if (wishes === "") return params;
  if (wishesLength(wishes) > WISHES_MAX) return null;
  return { ...params, wishes };
}

/**
 * Teksten i den faste bestillingslinja (D-3 kompakt): for eksempel «2 stiler
 * · Middels pynt · Møbler som stue og spisestue». `short` er uten rommet (én
 * linje paa mobil). `missing` er det foerste som mangler for at «Bestill»
 * skal virke, i samme rekkefoelge som velgeren (rom, stil, kryss), eller null
 * naar valget er komplett. Samme regler som stylingParams.
 */
export function stylingSummary(
  locale: Locale,
  choice: StylingChoice
): { text: string; short: string; missing: string | null } {
  const n = choice.styles.length;
  const styles = t(locale, n === 0 ? "styling.summary.styles.0" : n === 1 ? "styling.summary.styles.1" : "styling.summary.styles.n", { n });
  const decor = t(locale, `styling.summary.decor.${choice.decor ?? "default"}`);
  const room = choice.furnishAs === null ? t(locale, "styling.summary.noRoom") : codeText(locale, "furnishAs", choice.furnishAs);
  const missing =
    choice.furnishAs === null
      ? t(locale, "styling.summary.missingRoom")
      : n === 0
        ? t(locale, "styling.summary.missingStyle")
        : !choice.roomEmpty
          ? t(locale, "styling.summary.missingEmpty")
          : null;
  return { text: [styles, decor, room].join(" · "), short: `${styles} · ${decor}`, missing };
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
