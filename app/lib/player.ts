import type { AssignmentImage, AssignmentResult } from "./assignments.ts";

/**
 * Spilleren paa ordresiden (TG-NEW-277, FE-0; audit punkt 5 og 6): rekkefoelgen
 * paa resultatene, «Neste til kontroll», fremdriften og piltastene i
 * bildestripa. Rene funksjoner uten React.
 */

/** Hvor spilleren staar: bildet, og resultatet (fanen) paa bildet, eller null for et bilde uten resultater. */
export interface PlayerPos {
  imageId: string;
  resultId: string | null;
}

/** Resultater som venter paa megleren: til kontroll, eller trenger svar. */
export function needsReviewer(result: AssignmentResult): boolean {
  return result.displayStatus === "to_review" || result.displayStatus === "needs_answer";
}

/** Alle plassene i rekkefoelge: bildene etter `position`, resultatene i rekkefoelgen fra backend. */
export function playerOrder(images: readonly AssignmentImage[]): PlayerPos[] {
  const out: PlayerPos[] = [];
  for (const image of images) {
    if (image.results.length === 0) out.push({ imageId: image.id, resultId: null });
    for (const r of image.results) out.push({ imageId: image.id, resultId: r.resultId });
  }
  return out;
}

function resultAt(images: readonly AssignmentImage[], pos: PlayerPos): AssignmentResult | null {
  const image = images.find((i) => i.id === pos.imageId);
  return image?.results.find((r) => r.resultId === pos.resultId) ?? null;
}

function samePos(a: PlayerPos, b: PlayerPos): boolean {
  return a.imageId === b.imageId && a.resultId === b.resultId;
}

/**
 * Neste resultat som venter paa megleren etter `cur`, rundt til starten
 * (skissen `findNext`). Gjeldende plass tas med til slutt, saa et resultat
 * som fortsatt venter, ikke hoppes over. null naar ingenting venter. Ukjent
 * `cur` (bildet er borte) leter fra starten.
 */
export function nextToReview(images: readonly AssignmentImage[], cur: PlayerPos | null): PlayerPos | null {
  const order = playerOrder(images);
  if (order.length === 0) return null;
  const at = cur === null ? -1 : order.findIndex((p) => samePos(p, cur));
  for (let step = 1; step <= order.length; step++) {
    const pos = order[(at + step + order.length) % order.length];
    const result = resultAt(images, pos);
    if (result !== null && needsReviewer(result)) return pos;
  }
  return null;
}

/**
 * Hvor spilleren starter: det foerste som venter paa megleren, ellers det
 * foerste resultatet, ellers det foerste bildet. null uten bilder.
 */
export function startPos(images: readonly AssignmentImage[]): PlayerPos | null {
  const order = playerOrder(images);
  return nextToReview(images, null) ?? order.find((p) => p.resultId !== null) ?? order[0] ?? null;
}

/**
 * Fremdriften: «6 av 9 kontrollert · 1 behandles». Kontrollert = godkjent
 * eller ikke brukt. Feilede og ikke startede resultater telles ikke med
 * (det er ingenting aa kontrollere).
 */
export interface Progress {
  reviewed: number;
  total: number;
  processing: number;
  waiting: number;
}

export function progress(results: readonly AssignmentResult[]): Progress {
  let reviewed = 0;
  let total = 0;
  let processing = 0;
  let waiting = 0;
  for (const r of results) {
    switch (r.displayStatus) {
      case "approved":
      case "not_used":
        reviewed++;
        total++;
        break;
      case "processing":
        processing++;
        total++;
        break;
      case "to_review":
      case "needs_answer":
        waiting++;
        total++;
        break;
      default:
        break;
    }
  }
  return { reviewed, total, processing, waiting };
}

/** Fremdriften for hele ordren. */
export function assignmentProgress(images: readonly AssignmentImage[]): Progress {
  return progress(images.flatMap((i) => i.results));
}

/** Alt er kontrollert, og ingenting behandles: «Gå til nedlasting». */
export function allReviewed(p: Progress): boolean {
  return p.total > 0 && p.reviewed === p.total;
}

/**
 * Piltastene i bildestripa (roving tabindex): ←/→ ett steg, Home/End til
 * endene, uten aa gaa rundt. null for andre taster (la nettleseren ta dem).
 */
export function stripKey(key: string, index: number, count: number): number | null {
  if (count <= 0) return null;
  const last = count - 1;
  const i = Math.min(Math.max(index, 0), last);
  switch (key) {
    case "ArrowLeft":
      return Math.max(i - 1, 0);
    case "ArrowRight":
      return Math.min(i + 1, last);
    case "Home":
      return 0;
    case "End":
      return last;
    default:
      return null;
  }
}
