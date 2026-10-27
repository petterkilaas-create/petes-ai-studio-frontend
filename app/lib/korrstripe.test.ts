import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { correctionKind, correctionView, type Lights } from "./correction.ts";
import {
  approveLocked,
  compareVariants,
  defaultEntry,
  ORIGINAL_ID,
  selectedEntry,
  stripLabel,
  stripShown,
  versionStrip,
  type StripImages,
} from "./compare.ts";
import { DICTIONARIES, t } from "./i18n/index.ts";
import type { LightState, ReviewLight, ReviewPanel, ReviewRound } from "./api.ts";

// Dag 57: korreksjonsstudioet FE-1 (ærlig retteinngang) og FE-c (versjonsstripa).

const APP = join(dirname(fileURLToPath(import.meta.url)), "..");
/** Uten kommentarer, saa en kommentar ikke kan oppfylle eller bryte en sjekk. */
const code = (rel: string) =>
  readFileSync(join(APP, rel), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const page = code("(app)/godkjenning/[jobId]/page.tsx");
const panel = code("components/godkjenning/CorrectionPanel.tsx");
const card = code("components/godkjenning/DecisionCard.tsx");
const strip = code("components/godkjenning/VersionStrip.tsx");
const lightbox = code("components/godkjenning/Lightbox.tsx");
const viewer = code("components/godkjenning/CompareViewer.tsx");

// ---------------------------------------------------------------------------
// FE-1: overskriften og hintet etter hva jobben har.
// ---------------------------------------------------------------------------

function light(key: string, run: number | null, state: LightState, editable = true): ReviewLight {
  return { key, id: key, run, type: "spotlight", location: null, box: null, reasonCode: null, editable, state };
}

const NO_LIGHTS: Lights = { approved: [], unstable: [], rejected: [] };
const SKUMRING: ReviewPanel[] = ["fireplace", "dusk", "lights", "correct"];

test("FE-1: lys som kan slaas av eller paa gir «lights», ogsaa naar peisen vises", () => {
  const lights: Lights = { ...NO_LIGHTS, approved: [light("L1", null, "approved")] };
  assert.equal(correctionKind({ lights, reviewPanels: SKUMRING }, false), "lights");
  assert.equal(correctionKind({ lights, reviewPanels: SKUMRING }, true), "lights");
  // En kandidat fra kjoering 1 eller 2 teller ogsaa.
  const candidate: Lights = { ...NO_LIGHTS, unstable: [light("r2:L3", 2, "candidate")] };
  assert.equal(correctionKind({ lights: candidate, reviewPanels: SKUMRING }, false), "lights");
  // Eldre backend uten review_panels: alt vises, som foer.
  assert.equal(correctionKind({ lights, reviewPanels: null }, false), "lights");
});

test("FE-1: bare peis gir «fireplace»; uten lys og peis «retry»", () => {
  assert.equal(correctionKind({ lights: NO_LIGHTS, reviewPanels: SKUMRING }, true), "fireplace");
  assert.equal(correctionKind({ lights: NO_LIGHTS, reviewPanels: SKUMRING }, false), "retry");
});

test("FE-1: laaste lys teller ikke som lys (ingen bryter aa vise)", () => {
  const locked: Lights = {
    approved: [light("L1", null, "approved", false)],
    unstable: [light("r3:L2", 3, "candidate")],
    rejected: [],
  };
  assert.equal(correctionKind({ lights: locked, reviewPanels: SKUMRING }, false), "retry");
  assert.equal(correctionKind({ lights: locked, reviewPanels: SKUMRING }, true), "fireplace");
});

test("FE-1: vilkaaret leses fra panelene, ikke tjenesten: uten lyspanelet er lysene ikke med", () => {
  const lights: Lights = { ...NO_LIGHTS, approved: [light("L1", null, "approved")] };
  // Styling og Klart vaer naar backend sender `correct` (RETRY_ALL_SERVICES).
  assert.equal(correctionKind({ lights, reviewPanels: ["style", "correct"] }, false), "retry");
  assert.equal(correctionKind({ lights: NO_LIGHTS, reviewPanels: ["correct"] }, false), "retry");
});

test("FE-1: «retry» har ny overskrift og nytt hint, uten «Lys i bildet: Ingen» og uten linja under knappene", () => {
  assert.deepEqual(correctionView("retry", { lightsShown: true, lightCount: 0 }), {
    titleKey: "correct.retryTitle",
    hintKey: "correct.retryHint",
    lightsList: false,
    footer: false,
  });
  assert.deepEqual(correctionView("retry", { lightsShown: false, lightCount: 0 }), {
    titleKey: "correct.retryTitle",
    hintKey: "correct.retryHint",
    lightsList: false,
    footer: false,
  });
  // Laaste lys staar fortsatt i lista («Kan ikke endres»).
  assert.equal(correctionView("retry", { lightsShown: true, lightCount: 2 }).lightsList, true);
});

test("FE-1: lys og peis som i dag", () => {
  const today = { titleKey: "correct.title", hintKey: "correct.hint", lightsList: true, footer: true };
  assert.deepEqual(correctionView("lights", { lightsShown: true, lightCount: 2 }), today);
  assert.deepEqual(correctionView("fireplace", { lightsShown: true, lightCount: 0 }), today);
  assert.deepEqual(correctionView("fireplace", { lightsShown: false, lightCount: 0 }), {
    titleKey: "correct.title",
    hintKey: null,
    lightsList: false,
    footer: true,
  });
});

test("FE-1: tekstene paa nb og en", () => {
  assert.equal(t("nb", "correct.retryTitle"), "Lag et nytt forsøk");
  assert.equal(t("nb", "correct.retryHint"), "Bildet lages på nytt fra originalen med de samme valgene.");
  assert.equal(t("en", "correct.retryTitle"), "Make a new attempt");
  assert.equal(t("en", "correct.retryHint"), "The image is made again from the original with the same choices.");
  // Lys-teksten er uendret.
  assert.equal(t("nb", "correct.title"), "Korriger lyskildene");
  assert.equal(t("nb", "correct.hint"), "Slå lysene av eller på nedenfor.");
});

test("FE-1: panelet bruker correctionView, og siden gir det correctionKind fra review-svaret", () => {
  assert.match(panel, /const view = correctionView\(kind, \{ lightsShown, lightCount: rows\.length \}\);/);
  assert.match(panel, /\{t\(locale, view\.titleKey\)\}/);
  assert.match(panel, /\{view\.hintKey !== null && <p[^>]*>\{t\(locale, view\.hintKey\)\}<\/p>\}/);
  assert.match(panel, /\{view\.lightsList && \(/);
  assert.match(panel, /\{view\.footer && <p[^>]*>\{t\(locale, "correct\.newImageFromOriginal"\)\}<\/p>\}/);
  assert.doesNotMatch(panel, /"correct\.title"|"correct\.hint"/);
  assert.match(page, /const kind = correctionKind\(review, fireplaceShown\);/);
  assert.match(page, /<CorrectionPanel[\s\S]*?kind=\{kind\}[\s\S]*?\/>/);
  // Ingen tjenestenavn i vilkaaret.
  assert.doesNotMatch(code("lib/correction.ts"), /presetId|styling|klart_vaer|skumring/);
});

// ---------------------------------------------------------------------------
// FE-c: versjonsstripa.
// ---------------------------------------------------------------------------

function round(n: number, extra: Partial<ReviewRound> = {}): ReviewRound {
  return { round: n, current: false, previewUrl: `p${n}.jpg`, rawPreviewUrl: `raw${n}.jpg`, choices: null, ...extra };
}

function images(rounds: ReviewRound[] | null, extra: Partial<StripImages> = {}): StripImages & { rounds: ReviewRound[] | null } {
  return {
    originalUrl: "orig.jpg",
    previewUrl: "top-preview.jpg",
    rawPreviewUrl: "top-raw.jpg",
    previous: { previewUrl: "top-previous.jpg" },
    rounds,
    ...extra,
  };
}

/** Tre versjoner, sendt nyeste foerst, med hull (runde 2 mangler). */
const THREE = images([round(3, { current: true }), round(0), round(1)]);

const stripOf = (imgs: ReturnType<typeof images>, isAdmin = false) =>
  versionStrip(imgs, compareVariants(imgs, { isAdmin }));

test("FE-c: originalen foerst, saa versjonene eldst foerst, ogsaa naar backend sender nyeste foerst", () => {
  const s = stripOf(THREE);
  assert.deepEqual(s.map((e) => e.id), [ORIGINAL_ID, "r0", "r1", "r3"]);
  assert.deepEqual(s.map((e) => e.url), ["orig.jpg", "p0.jpg", "p1.jpg", "p3.jpg"]);
});

test("FE-c: etikettene «Original», «Versjon 1», «Versjon 2 · nå» (nummeret fra backend, ikke plassen)", () => {
  const s = stripOf(images([round(1, { current: true }), round(0)]));
  const labels = (locale: "nb" | "en") => s.map((e) => stripLabel(locale, e, { choices: false }));
  assert.deepEqual(labels("nb"), ["Original", "Versjon 1", "Versjon 2 · nå"]);
  assert.deepEqual(labels("en"), ["Original", "Version 1", "Version 2 · now"]);
  // Hull: runde 3 heter «Versjon 4».
  assert.equal(stripLabel("nb", stripOf(THREE)[3], { choices: false }), "Versjon 4 · nå");
  // Ordet er «Versjon», aldri «Runde» (F2).
  assert.doesNotMatch(JSON.stringify(labels("nb")), /Runde/);
});

test("FE-c: rå varianter (admin) til slutt, eldst foerst; megleren ser dem ikke", () => {
  const imgs = images([round(1, { current: true }), round(0)]);
  assert.deepEqual(stripOf(imgs, true).map((e) => e.id), [ORIGINAL_ID, "r0", "r1", "r0-raw", "r1-raw"]);
  assert.deepEqual(stripOf(imgs, false).map((e) => e.id), [ORIGINAL_ID, "r0", "r1"]);
});

test("FE-c: mangler lenken, er miniatyren null (plassholder), aldri en annen lenke", () => {
  const s = stripOf(images([round(1, { current: true }), round(0, { previewUrl: null })], { originalUrl: null }));
  assert.deepEqual(s.map((e) => e.url), [null, null, "p1.jpg"]);
});

test("FE-c: gamle jobber uten rounds: forrige runde, saa løftet, med lenkene fra de gamle feltene", () => {
  const s = stripOf(images(null));
  assert.deepEqual(s.map((e) => e.id), [ORIGINAL_ID, "legacy-previous", "legacy-lifted"]);
  assert.deepEqual(s.map((e) => e.url), ["orig.jpg", "top-previous.jpg", "top-preview.jpg"]);
  assert.equal(defaultEntry(s)?.id, "legacy-lifted");
});

test("FE-c: stripa vises bare med minst to versjoner, som velgeren foer", () => {
  assert.equal(stripShown(stripOf(images([]))), false);
  assert.equal(stripShown(stripOf(images([round(0, { current: true })]))), false);
  assert.equal(stripShown(stripOf(images([round(0), round(1, { current: true })]))), true);
});

test("FE-c: standard er gjeldende versjon, ellers den nyeste, aldri originalen", () => {
  assert.equal(defaultEntry(stripOf(THREE))?.id, "r3");
  const current0 = stripOf(images([round(0, { current: true }), round(1)]));
  assert.equal(defaultEntry(current0)?.id, "r0");
  const noCurrent = stripOf(images([round(0), round(1)]));
  assert.equal(defaultEntry(noCurrent)?.id, "r1");
  assert.equal(defaultEntry(stripOf(images([]))), null);
  assert.equal(selectedEntry(stripOf(images([])), null), null);
});

test("FE-c: valget fra id, ogsaa originalen; ukjent id gir standarden", () => {
  const s = stripOf(THREE);
  assert.equal(selectedEntry(s, ORIGINAL_ID)?.kind, "original");
  assert.equal(selectedEntry(s, "r1")?.id, "r1");
  assert.equal(selectedEntry(s, "r9")?.id, "r3");
  assert.equal(selectedEntry(s, null)?.id, "r3");
});

test("FE-c: «Godkjenn» er laast for originalen og eldre versjoner, aapen for den nyeste", () => {
  const s = stripOf(THREE);
  assert.equal(approveLocked(s, selectedEntry(s, null)), false);
  assert.equal(approveLocked(s, selectedEntry(s, "r3")), false);
  assert.equal(approveLocked(s, selectedEntry(s, "r1")), true);
  assert.equal(approveLocked(s, selectedEntry(s, "r0")), true);
  assert.equal(approveLocked(s, selectedEntry(s, ORIGINAL_ID)), true);
  // Rått fra modellen (admin) er ikke det som godkjennes.
  const admin = stripOf(THREE, true);
  assert.equal(approveLocked(admin, selectedEntry(admin, "r3-raw")), true);
  // Uten versjoner er det ingenting aa laase.
  const none = stripOf(images([]));
  assert.equal(approveLocked(none, selectedEntry(none, null)), false);
  assert.equal(approveLocked(none, selectedEntry(none, ORIGINAL_ID)), false);
});

test("FE-c: laasen i kortet: knappen er laast og teksten vises, krysset og advarselen er som foer", () => {
  assert.match(card, /disabled=\{locked \|\| approveLock \|\| !approveEnabled\(additions\.level, compared, acknowledged\)\}/);
  assert.match(card, /\{controls\.approve && approveLock && \(\s*<p className="text-sm text-ink-2" role="status">\s*\{t\(locale, "compare\.approveLatest"\)\}/);
  // Krysset laases ikke av versjonen.
  assert.match(card, /checked=\{compared\}\s+disabled=\{locked\}/);
  assert.match(page, /const approveLock = approveLocked\(strip, entry\);/);
  assert.match(page, /approveLock=\{approveLock\}/);
  assert.equal(t("nb", "compare.approveLatest"), "Gå til den nyeste versjonen for å godkjenne.");
  assert.equal(t("en", "compare.approveLatest"), "Go to the latest version to approve.");
});

test("FE-c: stripa paa siden og i lysboksen; «Original» viser bare originalen; «Hold for original» staar", () => {
  assert.equal(page.match(/<VersionStrip\b/g)?.length, 2);
  assert.doesNotMatch(page, /<VariantPicker\b/);
  assert.match(page, /const strip = versionStrip\(review\.images, variants\);/);
  assert.match(page, /const shown = entry\?\.kind === "variant" \? entry\.variant : null;/);
  // Siden: uten valgt variant vises bare originalen (CompareViewer med result null).
  assert.match(page, /result=\{shown === null \? null : \{ url: shownUrl, label: shownLabel \}\}/);
  assert.match(page, /originalOnly=\{originalShown\}/);
  assert.match(lightbox, /const mode: Mode = originalOnly \? "result" : chosenMode;/);
  assert.match(lightbox, /\{!originalOnly && \(/);
  assert.match(viewer, /<HoldButton holding=\{held\} onHold=\{setHolding\} locale=\{locale\} \/>/);
  // Komponenten: knapper med aria-pressed, miniatyr uten alt (etiketten er teksten).
  assert.match(strip, /aria-pressed=\{selected\}/);
  assert.match(strip, /if \(!stripShown\(strip\)\) return null;/);
  assert.match(strip, /alt=""/);
  assert.equal(DICTIONARIES.nb.ui["compare.versions"], "Versjoner");
  assert.equal(DICTIONARIES.en.ui["compare.versions"], "Versions");
});
