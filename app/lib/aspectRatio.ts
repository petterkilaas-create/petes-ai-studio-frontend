/**
 * Aspect-ratio-hjelper for tjenester som krever EKSPLISITT aspect_ratio
 * (f.eks. virtual_stage — backend gir HTTP 422 uten, og godtar IKKE
 * "match_input_image"). Delt fil saa logikken kan gjenbrukes naar flere
 * v1-tjenester trenger samme beregning (Dag 21+).
 *
 * Gyldige verdier er backendens enum. Rekkefoelgen er landskap -> kvadrat
 * -> portrett; den brukes ikke i utvelgelsen (naermeste vinner), men gjoer
 * lista lett aa lese.
 */
export const VALID_ASPECT_RATIOS = [
  "21:9",
  "16:9",
  "4:3",
  "3:2",
  "1:1",
  "2:3",
  "3:4",
  "9:16",
  "9:21",
] as const;

export type AspectRatio = (typeof VALID_ASPECT_RATIOS)[number];

/** Desimalverdien (w/h) til et "W:H"-format. */
function ratioValue(ratio: AspectRatio): number {
  const [w, h] = ratio.split(":").map(Number);
  return w / h;
}

/**
 * Naermeste gyldige aspect_ratio fra bildets faktiske dimensjoner.
 *
 * Naermeste = minste absolutte differanse i ratio-verdi (width/height som
 * desimaltall). Ugyldige/ikke-positive dimensjoner faller tilbake til
 * "1:1" (trygt nullpunkt — kvadrat foretrekker ingen orientering).
 */
export function nearestAspectRatio(width: number, height: number): AspectRatio {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return "1:1";
  }

  const target = width / height;

  let best: AspectRatio = VALID_ASPECT_RATIOS[0];
  let bestDiff = Infinity;
  for (const ratio of VALID_ASPECT_RATIOS) {
    const diff = Math.abs(ratioValue(ratio) - target);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = ratio;
    }
  }
  return best;
}
