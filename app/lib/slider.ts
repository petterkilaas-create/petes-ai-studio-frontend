/**
 * Slideren mot originalen (D2a). Rene funksjoner uten import, saa de kan
 * testes med node --test. Verdien er hvor mye av originalen som vises, i
 * prosent fra venstre, alltid 0–100.
 *
 * WCAG 2.5.7: slideren skal kunne styres uten aa dra. Tastaturet gaar via
 * sliderKey, og klikk eller trykk paa sporet via valueFromPointer.
 */

export const SLIDER_START = 50;
const STEP = 2;
const BIG_STEP = 10;

export function clampPercent(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

/**
 * Ny verdi for en tast, eller null naar tasten ikke styrer slideren (da
 * faar nettleseren den, f.eks. Tab). Pil gir 2 (med Shift 10), PageUp og
 * PageDown 10, Home 0 og End 100.
 */
export function sliderKey(value: number, key: string, shift = false): number | null {
  const step = shift ? BIG_STEP : STEP;
  switch (key) {
    case "ArrowRight":
    case "ArrowUp":
      return clampPercent(value + step);
    case "ArrowLeft":
    case "ArrowDown":
      return clampPercent(value - step);
    case "PageUp":
      return clampPercent(value + BIG_STEP);
    case "PageDown":
      return clampPercent(value - BIG_STEP);
    case "Home":
      return 0;
    case "End":
      return 100;
    default:
      return null;
  }
}

/** Verdien der pekeren treffer sporet, rundet til helt tall. Utenfor sporet gir 0 eller 100. */
export function valueFromPointer(clientX: number, left: number, width: number): number {
  if (!(width > 0)) return SLIDER_START;
  return Math.round(clampPercent(((clientX - left) / width) * 100));
}
