import type { ImageTypeHint, ImageTypeView, JobReviewDetail } from "./api";
import type { UiKey } from "./i18n";
import type { Note } from "./review";
import type { Tool } from "./services";

/**
 * «Hvor er bildet tatt?» (TG-NEW-268, backend #257 bak IMAGE_TYPE_CHOICE):
 * valget ved bestilling, og merknadene paa godkjenningssiden naar analysen ser
 * noe annet. Rene regler, skilt ut saa de kan testes med node --test. Bare
 * type-importer: api.ts kaster ved import naar NEXT_PUBLIC_API_BASE mangler.
 */

/** «La analysen avgjøre» er standard og sendes ikke. */
export type ImageTypeChoice = "auto" | ImageTypeHint;

/** Fast rekkefoelge paa knappene. */
const HINT_ORDER: readonly ImageTypeHint[] = ["interior", "exterior", "aerial"];

/** Valgene for tjenesten: «La analysen avgjøre» foerst, saa de lovlige. Ingen valg: tom liste (ingen velger). */
export function imageTypeChoices(tool: Pick<Tool, "imageTypeHints"> | null | undefined): ImageTypeChoice[] {
  const hints = tool?.imageTypeHints ?? [];
  const allowed = HINT_ORDER.filter((h) => hints.includes(h));
  return allowed.length === 0 ? [] : ["auto", ...allowed];
}

/**
 * Feltet i params_json: bare naar megleren har valgt, og bare et valg
 * tjenesten godtar. Et valg fra en annen tjeneste foelger aldri med.
 */
export function imageTypeParams(
  tool: Pick<Tool, "imageTypeHints"> | null | undefined,
  choice: ImageTypeChoice
): { image_type_hint: ImageTypeHint } | Record<string, never> {
  if (choice === "auto") return {};
  return imageTypeChoices(tool).includes(choice) ? { image_type_hint: choice } : {};
}

/** Knappen og ordet etter «Du valgte» og «Bildetype:». */
export function choiceKey(choice: ImageTypeChoice): UiKey {
  return `imageTypeChoice.${choice}`;
}

/** Hva bildet er laget som (`value`), eller null for `other` og ukjente typer. */
function madeKey(value: string | null): UiKey | null {
  switch (value) {
    case "interior":
      return "imageTypeMade.interior";
    case "exterior_facade":
    case "balcony_terrace":
      return "imageTypeMade.exterior";
    case "aerial":
      return "imageTypeMade.aerial";
    default:
      return null;
  }
}

/** Ordet for en kjoering. Fasaden er «fra bakken» naar megleren valgte Drone (Cowork 27.10, 1.1). */
function runWord(run: string, hint: ImageTypeHint): UiKey | "other" | null {
  switch (run) {
    case "interior":
      return "imageTypeWord.interior";
    case "exterior_facade":
      return hint === "aerial" ? "imageTypeWord.ground" : "imageTypeWord.exterior";
    case "balcony_terrace":
      return "imageTypeWord.balcony";
    case "aerial":
      return "imageTypeWord.aerial";
    case "other":
      return "other";
    default:
      return null;
  }
}

/**
 * Merknaden `image_type_broker_differs`: «Du valgte {hint}, men analysen mente
 * at bildet er tatt {analysis}. Bildet er laget som {made}. …». Ordene for
 * kjoeringene staar i rekkefoelge uten like ord to ganger, med «eller»
 * mellom. Balkongen tas ut naar fasaden er med, og `other` naar andre ord
 * finnes. Bare `other`: egen setning. Mangler valget, typen eller
 * kjoeringene: den generelle merknaden, aldri tomme felt. Ingen kode: null.
 */
export function brokerDiffersNote(
  review: Pick<JobReviewDetail, "flagCodes"> & { imageType: ImageTypeView }
): Note | null {
  if (!review.flagCodes.includes("image_type_broker_differs")) return null;
  const { hint, value, runValues } = review.imageType;
  const made = madeKey(value);
  if (!hint || made === null) return { key: "note.unknown" };
  const words: (UiKey | "other")[] = [];
  for (const run of runValues) {
    const word = runWord(run, hint);
    if (word !== null && !words.includes(word)) words.push(word);
  }
  const known = words.filter((w): w is UiKey => w !== "other");
  const shown = known.includes("imageTypeWord.exterior") || known.includes("imageTypeWord.ground")
    ? known.filter((w) => w !== "imageTypeWord.balcony")
    : known;
  const base = { hint: [choiceKey(hint)], made: [made] };
  if (shown.length > 0) {
    return { key: "note.image_type_broker_differs", words: { ...base, analysis: shown } };
  }
  if (words.includes("other")) return { key: "note.image_type_broker_differs.other", words: base };
  return { key: "note.unknown" };
}

/**
 * «Bildetype: Utendørs (valgt ved bestilling)» (Cowork 27.10, valg 2A): bare
 * naar typen er valgt av megleren. Naar analysen avgjorde, vises ingenting.
 */
export function imageTypeLine(review: { imageType: ImageTypeView }): Note | null {
  const { source, hint } = review.imageType;
  if (source !== "broker" || !hint) return null;
  return { key: "review.imageTypeChosen", words: { type: [choiceKey(hint)] } };
}
