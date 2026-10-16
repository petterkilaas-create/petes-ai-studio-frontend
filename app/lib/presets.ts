import type { JobReviewDetail, ReviewPanel } from "./api";
import type { UiKey } from "./i18n/index.ts";
import { serviceLabelKey } from "./statusVariants.ts";

/**
 * Oppskriftene (G3, G1_PLAN §4 og §7): etikett, ventetekst, filnavn og
 * paneler slaas opp paa (service, preset), ikke bare service. Nye tjenester
 * som Klart vaer blir egne `preset_id` under `scene_transform`, ikke nye
 * `service`-verdier. Rene funksjoner, saa de kan testes med node --test;
 * bare type-import fra api.ts, som kaster ved import naar
 * NEXT_PUBLIC_API_BASE mangler.
 *
 * `preset_id` finnes ikke mens jobben kjoerer (null). Da brukes skumring
 * som reserve, saa kortet heter «Kveldsbilde» som foer (Petters valg 2).
 * En ukjent, ikke-null oppskrift faar aldri «Kveldsbilde».
 */

interface ScenePreset {
  /** `preset_id`-ene fra backend som hoerer til oppfoeringen. */
  ids: readonly string[];
  labelKey: UiKey;
  workingKey: UiKey;
  /** Foerste del av filnavnet ved nedlasting: `<slug>-ai_<8 tegn>.jpg`. */
  fileSlug: string;
}

/** Oppskriftene under `scene_transform`. K2 legger til klart_vaer. */
const SCENE_PRESETS: readonly ScenePreset[] = [
  {
    ids: ["skumring", "skumring_interior"],
    labelKey: "service.scene_transform",
    workingKey: "media.working.scene_transform",
    fileSlug: "kveldsbilde",
  },
];

/** Reserven mens `preset_id` mangler (null): skumring. */
const RESERVE: ScenePreset = SCENE_PRESETS[0];

/** Oppfoeringen for en oppskrift; null/undefined gir reserven, ukjent gir null. */
function scenePreset(presetId: string | null | undefined): ScenePreset | null {
  if (presetId == null) return RESERVE;
  return SCENE_PRESETS.find((p) => p.ids.includes(presetId)) ?? null;
}

/**
 * Tjenestenavnet fra ordlista, eller null (kortet viser da en prettifisert
 * utgave av id-en). `scene_transform` slaas opp paa oppskriften; andre
 * tjenester som `serviceLabelKey`.
 */
export function presetLabelKey(service: string, presetId?: string | null): UiKey | null {
  if (service !== "scene_transform") return serviceLabelKey(service);
  return scenePreset(presetId)?.labelKey ?? null;
}

/** «Lager kveldsbilde …» etter tjeneste og oppskrift. Ukjent: «Lager bildet …». */
export function presetWorkingKey(service: string | null | undefined, presetId?: string | null): UiKey {
  switch (service) {
    case "scene_transform":
      return scenePreset(presetId)?.workingKey ?? "media.working.generic";
    case "privacy_blur":
      return "media.working.privacy_blur";
    default:
      return "media.working.generic";
  }
}

/**
 * Foerste del av filnavnet ved nedlasting. Kjent oppskrift og reserven:
 * slugen i tabellen. Ukjent: id-en med bare a-z og 0-9, eller «bilde» naar
 * ingenting er igjen.
 */
export function presetFileSlug(presetId?: string | null): string {
  const known = scenePreset(presetId);
  if (known !== null) return known.fileSlug;
  return (presetId ?? "").toLowerCase().replace(/[^a-z0-9]/g, "") || "bilde";
}

/** Alle panelene, i fast rekkefoelge. */
export const ALL_PANELS: readonly ReviewPanel[] = ["fireplace", "dusk", "style", "lights", "correct"];

/** Panelene som vises: `review_panels` fra backend, eller alle fem naar feltet mangler (null). */
export function shownPanels(reviewPanels: readonly ReviewPanel[] | null | undefined): readonly ReviewPanel[] {
  return reviewPanels ?? ALL_PANELS;
}

/**
 * Vises panelet for denne jobben? Uten `reviewPanels` (backend foer G1c,
 * eller kall som ikke sender feltet) vises alt, som foer.
 */
export function panelShown(review: Partial<Pick<JobReviewDetail, "reviewPanels">>, panel: ReviewPanel): boolean {
  return shownPanels(review.reviewPanels).includes(panel);
}

/** Panelene i «Stemning og lys» (MoodPanel). */
const MOOD_PANELS: readonly ReviewPanel[] = ["fireplace", "dusk", "style", "lights"];

const NO_LIGHTS: JobReviewDetail["lights"] = { approved: [], unstable: [], rejected: [] };

/** Det MoodPanel faar se: data for skjulte paneler er tomme (G3). */
export interface MoodReview {
  dusk: JobReviewDetail["dusk"];
  style: JobReviewDetail["style"] | null;
  fireplace: JobReviewDetail["fireplace"];
  lights: JobReviewDetail["lights"];
  /** Dusk-panelet vises (tidspunkt og himmel). */
  duskShown: boolean;
  /** «Lys som tennes» vises. */
  lightsShown: boolean;
}

/**
 * Dataene «Stemning og lys» viser, med skjulte paneler tomme: dusk og stil
 * null, peissvaret null og ingen lys. Hjelperne i dusk.ts gir da ingen rad.
 * null naar alle fire panelene er borte: da rendres ikke panelet. Uten
 * `reviewPanels` er dataene uendret.
 */
export function moodReview(
  review: Pick<JobReviewDetail, "dusk" | "style" | "lights" | "fireplace"> &
    Partial<Pick<JobReviewDetail, "reviewPanels">>
): MoodReview | null {
  if (!MOOD_PANELS.some((p) => panelShown(review, p))) return null;
  const duskShown = panelShown(review, "dusk");
  const lightsShown = panelShown(review, "lights");
  return {
    dusk: duskShown ? review.dusk : null,
    style: panelShown(review, "style") ? review.style : null,
    fireplace: panelShown(review, "fireplace") ? review.fireplace : { ...review.fireplace, answer: null },
    lights: lightsShown ? review.lights : NO_LIGHTS,
    duskShown,
    lightsShown,
  };
}
