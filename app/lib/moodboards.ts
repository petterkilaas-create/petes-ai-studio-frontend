import data from "./moodboards.json" with { type: "json" };
import { FURNISH_AS_CHOICES, STYLING_STYLES, type FurnishAs, type StylingStyle } from "./styling.ts";
import { DEFAULT_BRAND } from "./brand.ts";
import type { MoodboardData, MoodboardStyle } from "../../scripts/moodboards/data.ts";

export type { MoodboardStyle } from "../../scripts/moodboards/data.ts";
import type { SvgNode } from "../../scripts/moodboards/parse.ts";
export type { SvgNode };

/**
 * Moodboardet per stil (D-3, dag 54): kategori, setning, «Tenk på»,
 * materialfliser, moebelkort, palett, «Passer for», «Unngå», anbefalt pynt og
 * eksempelbildet. moodboards.json lages av scripts/moodboards/lag-data.ts fra
 * Coworks moodboard, og moodboards.test.ts sjekker at den er lik kildene.
 * Innholdet finnes bare paa norsk (AVVIK 5 i RAPPORT_D3).
 */
const STYLES = (data as unknown as MoodboardData).stiler;

export const MOODBOARDS = Object.fromEntries(
  STYLING_STYLES.map((style) => {
    const board = STYLES.find((s) => s.id === style);
    if (board === undefined) throw new Error(`moodboards.json mangler ${style}`);
    return [style, board];
  })
) as Record<StylingStyle, MoodboardStyle>;

/** Ikonet paa romflisene (Styling.dc.html, «1 · Rommet»), per `furnish_as`. */
export const ROOM_ICONS = Object.fromEntries(
  FURNISH_AS_CHOICES.map((room) => {
    const icon = (data as unknown as MoodboardData).rom.find((r) => r.id === room);
    if (icon === undefined) throw new Error(`moodboards.json mangler ikonet for ${room}`);
    return [room, icon.ikon];
  })
) as Record<FurnishAs, SvgNode>;

/** Fyller `{brand}` i en moodboard-tekst med visningsnavnet (brand.ts). */
export function boardText(text: string): string {
  return text.split("{brand}").join(DEFAULT_BRAND.displayName);
}
