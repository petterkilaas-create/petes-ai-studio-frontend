import type { AssignmentCounts } from "./assignments.ts";
import { loadDraft, type DraftStorage } from "./board.ts";
import { t, type Locale, type UiKey } from "./i18n/index.ts";
import { imageCountText, orderCheckHref, orderDeliveryHref, orderImagesHref, orderServicesHref } from "./ordrer.ts";
import { playerHref } from "./player.ts";

/**
 * Fremdriftslinja nederst i ordresidene (Dag 59, FREMDRIFT; skissen
 * «fremdrift»): fem steg, Bilder → Tjenester → Kontroll → Godkjenning →
 * Last ned. Ny ordre hoerer til steg 1, og Annonsetekst staar utenfor linja
 * (Petter 30.10). Ren modul uten React, saa reglene testes med node --test.
 *
 * - `current` er steget for siden kunden staar paa (pageStep).
 * - Et steg er naadd (reachedStep): 1 alltid, 2 med minst ett bilde, 3 naar
 *   utkastet har elementer, 4 og 5 naar ordren har resultater.
 * - Steg foer `current` er ferdige. De er lenker bare naar de er naadd, og
 *   aldri til siden kunden staar paa (stopp 1, valg 1A: Kontroll er tom
 *   etter start, og bildesiden er steg 4 naar ordren har resultater).
 * - Steg etter `current` som er naadd, er lenker. Resten er graa.
 * - «Tilbake» gaar til naermeste naadde steg foer, men fra Godkjenning
 *   alltid til Tjenester (valg 1A).
 */

export const STEP_COUNT = 5;

export const ORDER_STEPS = ["images", "services", "check", "approval", "download"] as const;
export type OrderStep = (typeof ORDER_STEPS)[number];

/** Siden kunden staar paa. `new` er /ordrer/ny (ingen ordre ennaa). */
export type OrderPage = "new" | "images" | "services" | "check" | "player" | "delivery";

export type StepState = "done" | "current" | "reached" | "todo";

export interface ProgressStep {
  /** 1–5. */
  n: number;
  id: OrderStep;
  state: StepState;
  /** Lenken, eller null (graa, gjeldende side, ikke naadd eller ingen ordre). */
  href: string | null;
}

export interface OrderProgressView {
  current: number;
  steps: ProgressStep[];
  /** «Tilbake» i linja, eller null paa steg 1. */
  backHref: string | null;
}

/** Det linja trenger fra ordren. */
export type ProgressCounts = Pick<AssignmentCounts, "images" | "results" | "processing" | "toReview" | "needsAnswer">;

/** Steget for siden. Bildesiden er steg 4 naar ordren har resultater. */
export function pageStep(page: OrderPage, counts: Pick<AssignmentCounts, "results"> | null): number {
  switch (page) {
    case "new":
      return 1;
    case "images":
      return counts !== null && counts.results >= 1 ? 4 : 1;
    case "services":
      return 2;
    case "check":
      return 3;
    case "player":
      return 4;
    case "delivery":
      return 5;
  }
}

/** Siden et steg lenker til (bildesiden for Bilder, spilleren for Godkjenning). */
const STEP_PAGE: Readonly<Record<number, OrderPage>> = { 1: "images", 2: "services", 3: "check", 4: "player", 5: "delivery" };

export function stepHref(assignmentId: string, n: number): string {
  switch (n) {
    case 1:
      return orderImagesHref(assignmentId);
    case 2:
      return orderServicesHref(assignmentId);
    case 3:
      return orderCheckHref(assignmentId);
    case 4:
      return playerHref(assignmentId);
    default:
      return orderDeliveryHref(assignmentId);
  }
}

export function reachedStep(n: number, counts: Pick<AssignmentCounts, "images" | "results"> | null, draftCount: number): boolean {
  if (n === 1) return true;
  if (counts === null) return false;
  if (n === 2) return counts.images >= 1;
  if (n === 3) return draftCount >= 1;
  return counts.results >= 1;
}

/**
 * Linja for siden. `assignment` er null paa /ordrer/ny; `draftCount` er
 * antall elementer i utkastet paa brettet (loadDraft).
 */
export function orderProgress(
  page: OrderPage,
  assignment: { id: string; counts: Pick<AssignmentCounts, "images" | "results"> } | null,
  draftCount: number
): OrderProgressView {
  const counts = assignment?.counts ?? null;
  const current = pageStep(page, counts);
  const steps = ORDER_STEPS.map((id, i): ProgressStep => {
    const n = i + 1;
    const reached = reachedStep(n, counts, draftCount);
    const state: StepState = n < current ? "done" : n === current ? "current" : reached ? "reached" : "todo";
    const linked = assignment !== null && state !== "current" && state !== "todo" && reached && STEP_PAGE[n] !== page;
    return { n, id, state, href: linked ? stepHref(assignment.id, n) : null };
  });
  return { current, steps, backHref: assignment === null ? null : backHref(assignment.id, current, counts, draftCount) };
}

function backHref(
  assignmentId: string,
  current: number,
  counts: Pick<AssignmentCounts, "images" | "results"> | null,
  draftCount: number
): string | null {
  if (current === 4) return stepHref(assignmentId, 2);
  for (let n = current - 1; n >= 1; n--) {
    if (reachedStep(n, counts, draftCount)) return stepHref(assignmentId, n);
  }
  return null;
}

/** Antall elementer i utkastet paa brettet (steg 3 er naadd ved minst ett). */
export function draftCount(storage: DraftStorage | null, assignmentId: string, imageIds: Iterable<string>): number {
  return loadDraft(storage, assignmentId, imageIds)?.items.length ?? 0;
}

/** Fyllet paa PC: fra midten av steg 1 til midten av `step`, i prosent av linja. */
export function fillPercent(step: number): number {
  const clamped = Math.min(STEP_COUNT, Math.max(1, step));
  return ((clamped - 1) / (STEP_COUNT - 1)) * 100;
}

// --- tekst ---------------------------------------------------------------------

const STEP_NAME: Readonly<Record<OrderStep, UiKey>> = {
  images: "progress.step.images",
  services: "progress.step.services",
  check: "progress.step.check",
  approval: "progress.step.approval",
  download: "progress.step.download",
};

export function stepName(locale: Locale, id: OrderStep): string {
  return t(locale, STEP_NAME[id]);
}

/**
 * Underteksten: bare data siden har fra foer, ellers ingenting (null).
 * Ferdig Bilder: «N bilder». Naa: Bilder «Last opp og velg rom»,
 * Tjenester `servicesNow` (totalsText fra brettet), Kontroll «Se over og
 * start», Godkjenning «N behandles · N til godkjenning · N trenger svar».
 * Steget etter `current`: «Neste».
 */
export function stepSub(
  locale: Locale,
  step: ProgressStep,
  current: number,
  counts: ProgressCounts | null,
  servicesNow: string | null = null
): string | null {
  if (step.state === "done") {
    return step.id === "images" && counts !== null ? imageCountText(locale, counts.images) : null;
  }
  if (step.state === "current") {
    switch (step.id) {
      case "images":
        return t(locale, "progress.now.images");
      case "services":
        return servicesNow;
      case "check":
        return t(locale, "progress.now.check");
      case "approval":
        return counts === null ? null : approvalNow(locale, counts);
      default:
        return null;
    }
  }
  return step.n === current + 1 ? t(locale, "progress.next") : null;
}

/** «2 behandles · 3 til godkjenning · 1 trenger svar», bare delene med tall; null naar alle er 0. */
export function approvalNow(locale: Locale, counts: Pick<ProgressCounts, "processing" | "toReview" | "needsAnswer">): string | null {
  const parts: string[] = [];
  if (counts.processing > 0) parts.push(t(locale, "orders.results.processing", { n: counts.processing }));
  if (counts.toReview > 0) parts.push(t(locale, "orders.results.toReview", { n: counts.toReview }));
  if (counts.needsAnswer > 0) parts.push(t(locale, "orders.results.needsAnswer", { n: counts.needsAnswer }));
  return parts.length === 0 ? null : parts.join(" · ");
}

/** Teksten for skjermleser: «Bilder: ferdig», «Tjenester: du er her», «Last ned: gjenstår». */
export function stepAria(locale: Locale, step: ProgressStep): string {
  const label = stepName(locale, step.id);
  if (step.state === "done") return t(locale, "progress.aria.done", { label });
  if (step.state === "current") return t(locale, "progress.aria.current", { label });
  return t(locale, "progress.aria.todo", { label });
}

/** Mobil: «Steg 2 av 5 · Tjenester» (delt i to, saa navnet kan vaere fet). */
export function mobileStepText(locale: Locale, current: number): string {
  return t(locale, "progress.mobileStep", { n: current, count: STEP_COUNT });
}

/** Mobil: «Neste: Kontroll», eller «Siste steg» paa Last ned. */
export function mobileNextText(locale: Locale, current: number): string {
  const next = ORDER_STEPS[current];
  return next === undefined ? t(locale, "progress.last") : t(locale, "progress.nextNamed", { label: stepName(locale, next) });
}

// --- fyllet glir (sessionStorage) ----------------------------------------------

export type StepMemory = Pick<Storage, "getItem" | "setItem">;

/** Uten merkenavnet (design.test.ts). */
export function stepMemoryKey(assignmentId: string): string {
  return `ordre.steg.${assignmentId}.v1`;
}

/** sessionStorage, eller null: tilgangen kan kaste (blokkert lagring) eller mangle (server). */
export function sessionMemory(): StepMemory | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

/** Forrige steg for ordren (1–5), eller null. Feil svelges. */
export function readLastStep(storage: StepMemory | null, assignmentId: string): number | null {
  if (storage === null) return null;
  try {
    const n = Number(storage.getItem(stepMemoryKey(assignmentId)));
    return Number.isInteger(n) && n >= 1 && n <= STEP_COUNT ? n : null;
  } catch {
    return null;
  }
}

/** Husk steget for ordren. Feil (full lagring, privat modus) svelges. */
export function saveLastStep(storage: StepMemory | null, assignmentId: string, step: number): void {
  if (storage === null) return;
  try {
    storage.setItem(stepMemoryKey(assignmentId), String(step));
  } catch {
    // Lagringen er utilgjengelig; fyllet starter da paa gjeldende steg.
  }
}

// --- dobbeltklikk ---------------------------------------------------------------

/**
 * Bare én start om gangen (Kontroll): `run` mens forrige kjoering gaar,
 * gjoer ingenting. Holdes i en ref, saa vernet virker foer React har tegnet
 * knappen graa (to klikk i samme oeyeblikk).
 */
export class OneAtATime {
  private busy = false;

  get running(): boolean {
    return this.busy;
  }

  async run(fn: () => Promise<void>): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      await fn();
    } finally {
      this.busy = false;
    }
  }
}
