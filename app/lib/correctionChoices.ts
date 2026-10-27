import type { CorrectionChoices, JobReviewDetail, ReviewOrder } from "./api";
import { DUSK_CARDS, isDuskStyle, isValidChoice, type DuskChoice } from "./dusk.ts";
import { DECOR_LEVELS, STYLING_STYLES, type DecorLevel, type StylingStyle } from "./styling.ts";

/**
 * «Endre valg» i «Rett» (TG-NEW-145, FE-a, Dag 57). Kontrakt:
 * ~/dev/_handoff/dag57/KONTRAKT_ENDRE_VALG.md. Velgerne vises bare naar
 * review-svaret sier det (`correction.choices_accepted` og
 * `current_choices`); ingen regel leser tjenestenavnet. Body-en har bare
 * valgene som er endret. Rene funksjoner, saa de kan testes med node --test;
 * bare type-import fra api.ts (den kaster ved import uten NEXT_PUBLIC_API_BASE).
 */

/** Hvilken velger «Rett» viser: Kveldsbilde, styling, eller ingen (Klart vaer, Aarstider, flagget av). */
export type ChoicesKind = "dusk" | "styling" | null;

export function choicesKind(review: Pick<JobReviewDetail, "correction">): ChoicesKind {
  const accepted = review.correction.choicesAccepted ?? [];
  if ((review.correction.currentChoices ?? null) === null) return null;
  if (accepted.includes("dusk_style")) return "dusk";
  if (accepted.includes("style")) return "styling";
  return null;
}

/** Valgene i velgeren. null er «ingen valgt» (en gammel stil som ikke er et kort eller i drift). */
export interface ChoiceState {
  dusk: DuskChoice | null;
  style: StylingStyle | null;
  decor: DecorLevel | null;
}

export const NO_CHOICES: ChoiceState = { dusk: null, style: null, decor: null };

/**
 * Forvalget: valgene gjeldende bilde ble laget med. En gammel kveldsstil
 * (v1/v2) gir intet kort, og en himmel stilen ikke har gir stilens standard.
 * En stil utenfor de 14 gir ingen valgt stil.
 */
export function initialChoices(review: Pick<JobReviewDetail, "correction">): ChoiceState {
  const current = review.correction.currentChoices ?? null;
  if (current === null) return NO_CHOICES;
  const duskStyle = current.duskStyle;
  const dusk: DuskChoice | null =
    duskStyle !== null && isDuskStyle(duskStyle)
      ? {
          style: duskStyle,
          sky:
            current.duskSky !== null && isValidChoice(duskStyle, current.duskSky)
              ? (current.duskSky as DuskChoice["sky"])
              : DUSK_CARDS[duskStyle].skies[0],
        }
      : null;
  const style = STYLING_STYLES.find((s) => s === current.style) ?? null;
  const decor = DECOR_LEVELS.find((d) => d === current.decorLevel) ?? null;
  return { dusk, style, decor };
}

/**
 * `choices` i body: bare det som er endret fra forvalget. Ny kveldsstil sender
 * `dusk_style`, og `dusk_sky` bare for stiler med himmelvalg (Blå time, Sen
 * kveld); samme stil med ny himmel sender bare `dusk_sky`. `dusk_time` sendes
 * aldri. Styling sender `style` og `decor_level` (null er stilens eget nivaa).
 */
export function choicesBody(kind: ChoicesKind, initial: ChoiceState, state: ChoiceState): CorrectionChoices {
  const out: CorrectionChoices = {};
  if (kind === "dusk" && state.dusk !== null) {
    const styleChanged = initial.dusk === null || state.dusk.style !== initial.dusk.style;
    if (styleChanged) out.dusk_style = state.dusk.style;
    const hasSkies = DUSK_CARDS[state.dusk.style].skies.length > 1;
    if (hasSkies && (styleChanged || state.dusk.sky !== initial.dusk?.sky)) out.dusk_sky = state.dusk.sky;
  }
  if (kind === "styling") {
    if (state.style !== null && state.style !== initial.style) out.style = state.style;
    if (state.decor !== initial.decor) out.decor_level = state.decor;
  }
  return out;
}

/**
 * Stilene i velgeren (V-b, Petter 27.10): de 14, uten stiler som er en annen
 * jobb i samme bestilling (`order.jobs[].preset_id`, som er stilen i
 * gjeldende bilde, V-a). Jobbens egen stil vises alltid.
 */
export function correctionStyles(
  order: ReviewOrder | null,
  jobId: string,
  current: StylingStyle | null
): StylingStyle[] {
  const others = new Set((order?.jobs ?? []).filter((j) => j.jobId !== jobId).map((j) => j.presetId));
  return STYLING_STYLES.filter((s) => s === current || !others.has(s));
}
