/** Felles klasser for markedssiden (MS2). Bare tokens, som i appen. */

export { FOCUS } from "../godkjenning/classes";

/** Innholdsbredden fra utkastet: 1320 px med luft paa sidene. */
export const CONTAINER = "mx-auto box-border w-full max-w-[1320px] px-[clamp(16px,4vw,48px)]";

/** Luft over og under en seksjon (utkastet: clamp(56px, 7vw, 104px)). */
export const SECTION_Y = "py-[clamp(56px,7vw,104px)]";

/** Seksjon med hvit bakgrunn og strek over og under (utkastet). */
export const SECTION_BAND = "border-y border-line bg-surface";

/** Overskriften i en seksjon (utkastet: Instrument Serif, clamp(36px, 4vw, 56px)). */
export const H2 =
  "m-0 text-balance font-display text-[clamp(36px,4vw,56px)] font-normal leading-[1.05] tracking-[-0.01em] text-ink";

/** Ingressen under overskriften. */
export const LEAD = "m-0 max-w-[40em] text-pretty text-[17px] leading-[1.55] text-ink-2";

/** Liten AI-merkelapp (som i slideren og i appen). */
export const AI_CHIP =
  "inline-flex size-[22px] shrink-0 items-center justify-center rounded-full bg-ink text-[12px] font-bold tracking-[-0.02em] text-surface";
