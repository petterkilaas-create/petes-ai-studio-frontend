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

/**
 * Oppskriftene under `scene_transform`. Klart vaer (K2) gjenbruker kortets
 * tittel som etikett, saa «Blå himmel» har en kilde; den kan ikke bestilles
 * foer `ENABLED.klart_vaer` slaas paa (K3).
 */
const SCENE_PRESETS: readonly ScenePreset[] = [
  {
    ids: ["skumring", "skumring_interior"],
    labelKey: "service.scene_transform",
    workingKey: "media.working.scene_transform",
    fileSlug: "kveldsbilde",
  },
  {
    ids: ["klart_vaer"],
    labelKey: "express.tool.klart_vaer.title",
    workingKey: "media.working.klart_vaer",
    fileSlug: "blaahimmel",
  },
  // Digital styling (S2-f): én oppfoering per stil. Etikett og filnavn nevner
  // bare stilen, aldri rommet (S1-auditen §2), og ingen tekst lover samme
  // moebler paa tvers av bilder (§8).
  {
    ids: ["styling_skandinavisk"],
    labelKey: "styling.preset.skandinavisk",
    workingKey: "media.working.styling",
    fileSlug: "styling-skandinavisk",
  },
  {
    ids: ["styling_familie"],
    labelKey: "styling.preset.familie",
    workingKey: "media.working.styling",
    fileSlug: "styling-familie",
  },
  {
    ids: ["styling_moderne"],
    labelKey: "styling.preset.moderne",
    workingKey: "media.working.styling",
    fileSlug: "styling-moderne",
  },
  // Stilene fra S3-f, med navn fra stilene v3. De tre over staar igjen for
  // historikken.
  {
    ids: ["styling_moderne_nordisk"],
    labelKey: "styling.preset.moderne_nordisk",
    workingKey: "media.working.styling",
    fileSlug: "styling-moderne-nordisk",
  },
  {
    ids: ["styling_varm_minimalisme"],
    labelKey: "styling.preset.varm_minimalisme",
    workingKey: "media.working.styling",
    fileSlug: "styling-varm-minimalisme",
  },
  {
    ids: ["styling_japandi"],
    labelKey: "styling.preset.japandi",
    workingKey: "media.working.styling",
    fileSlug: "styling-japandi",
  },
  {
    ids: ["styling_nordisk_klassisk"],
    labelKey: "styling.preset.nordisk_klassisk",
    workingKey: "media.working.styling",
    fileSlug: "styling-nordisk-klassisk",
  },
  {
    ids: ["styling_dansk_farge"],
    labelKey: "styling.preset.dansk_farge",
    workingKey: "media.working.styling",
    fileSlug: "styling-dansk-farge",
  },
  {
    ids: ["styling_by_vintage"],
    labelKey: "styling.preset.by_vintage",
    workingKey: "media.working.styling",
    fileSlug: "styling-by-vintage",
  },
  {
    ids: ["styling_hytte_fjell"],
    labelKey: "styling.preset.hytte_fjell",
    workingKey: "media.working.styling",
    fileSlug: "styling-hytte-fjell",
  },
  {
    ids: ["styling_nordisk_kyst"],
    labelKey: "styling.preset.nordisk_kyst",
    workingKey: "media.working.styling",
    fileSlug: "styling-nordisk-kyst",
  },
  // Stilene v3 (TG-NEW-257): de seks nye. fileSlug kommer fra id-en; stilene
  // over beholder sin, ogsaa der navnet er endret.
  {
    ids: ["styling_sekelskifte"],
    labelKey: "styling.preset.sekelskifte",
    workingKey: "media.working.styling",
    fileSlug: "styling-sekelskifte",
  },
  {
    ids: ["styling_funkis"],
    labelKey: "styling.preset.funkis",
    workingKey: "media.working.styling",
    fileSlug: "styling-funkis",
  },
  {
    ids: ["styling_syttitall"],
    labelKey: "styling.preset.syttitall",
    workingKey: "media.working.styling",
    fileSlug: "styling-syttitall",
  },
  {
    ids: ["styling_pastell"],
    labelKey: "styling.preset.pastell",
    workingKey: "media.working.styling",
    fileSlug: "styling-pastell",
  },
  {
    ids: ["styling_hytte_tradisjon"],
    labelKey: "styling.preset.hytte_tradisjon",
    workingKey: "media.working.styling",
    fileSlug: "styling-hytte-tradisjon",
  },
  {
    ids: ["styling_urban_industri"],
    labelKey: "styling.preset.urban_industri",
    workingKey: "media.working.styling",
    fileSlug: "styling-urban-industri",
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
