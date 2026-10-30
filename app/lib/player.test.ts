import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseAssignment, type AssignmentImage } from "./assignments.ts";
import { t } from "./i18n/index.ts";
import {
  allReviewed,
  assignmentProgress,
  nextToReview,
  playerOrder,
  progress,
  startPos,
  stripKey,
} from "./player.ts";

/**
 * Spilleren (FE-0, audit punkt 5 og 6): rekkefoelgen, «Neste til godkjenning»,
 * fremdriften og piltastene. Eksempelet er ordren med 8 bilder.
 */
const SAMPLE = parseAssignment(
  JSON.parse(readFileSync(new URL("./testdata/assignment_v1.json", import.meta.url), "utf-8"))
);
const IMAGES: AssignmentImage[] = SAMPLE?.images ?? [];

test("rekkefoelgen: bildene etter position, resultatene i rekkefoelge, bilder uten resultat med", () => {
  assert.deepEqual(
    playerOrder(IMAGES).map((p) => p.resultId ?? `(${p.imageId})`),
    ["job_1a", "job_1b", "job_2a", "(img_3)", "job_4a", "job_5a", "job_5b", "job_6a", "job_7a", "job_7b", "(img_8)"]
  );
});

test("startPos: det foerste som venter paa megleren", () => {
  assert.deepEqual(startPos(IMAGES), { imageId: "img_1", resultId: "job_1a" });
  assert.equal(startPos([]), null);
});

test("nextToReview: neste som venter etter gjeldende, ogsaa «Trenger svar», og rundt til starten", () => {
  assert.deepEqual(nextToReview(IMAGES, { imageId: "img_1", resultId: "job_1a" }), { imageId: "img_4", resultId: "job_4a" });
  assert.deepEqual(nextToReview(IMAGES, { imageId: "img_4", resultId: "job_4a" }), { imageId: "img_5", resultId: "job_5a" });
  assert.deepEqual(nextToReview(IMAGES, { imageId: "img_5", resultId: "job_5a" }), { imageId: "img_7", resultId: "job_7b" });
  assert.deepEqual(nextToReview(IMAGES, { imageId: "img_7", resultId: "job_7b" }), { imageId: "img_1", resultId: "job_1a" });
  // Fra et bilde uten resultater.
  assert.deepEqual(nextToReview(IMAGES, { imageId: "img_3", resultId: null }), { imageId: "img_4", resultId: "job_4a" });
  // Ukjent plass leter fra starten.
  assert.deepEqual(nextToReview(IMAGES, { imageId: "borte", resultId: "x" }), { imageId: "img_1", resultId: "job_1a" });
});

test("nextToReview: bare gjeldende venter gir gjeldende; ingenting venter gir null", () => {
  const one = IMAGES.map((img) => ({
    ...img,
    results: img.results.map((r) => (r.resultId === "job_5a" ? r : { ...r, displayStatus: "approved" as const })),
  }));
  assert.deepEqual(nextToReview(one, { imageId: "img_5", resultId: "job_5a" }), { imageId: "img_5", resultId: "job_5a" });
  const none = one.map((img) => ({ ...img, results: img.results.map((r) => ({ ...r, displayStatus: "approved" as const })) }));
  assert.equal(nextToReview(none, { imageId: "img_5", resultId: "job_5a" }), null);
  assert.deepEqual(startPos(none), { imageId: "img_1", resultId: "job_1a" });
  assert.equal(nextToReview([], null), null);
});

test("fremdriften: «4 av 9 gjennomgått · 1 behandles» for eksempelet", () => {
  const p = assignmentProgress(IMAGES);
  assert.deepEqual(p, { reviewed: 4, total: 9, processing: 1, waiting: 4 });
  assert.equal(t("nb", "player.progress", { reviewed: p.reviewed, total: p.total }), "4 av 9 gjennomgått");
  assert.equal(t("nb", "player.processing", { n: p.processing }), "1 behandles");
  assert.equal(allReviewed(p), false);
});

test("fremdriften per bilde, og feilede og ikke startede telles ikke", () => {
  const img7 = IMAGES.find((i) => i.id === "img_7");
  assert.deepEqual(progress(img7?.results ?? []), { reviewed: 1, total: 2, processing: 0, waiting: 1 });
  const base = img7?.results[0];
  assert.ok(base);
  const p = progress([
    { ...base, displayStatus: "approved" },
    { ...base, displayStatus: "failed" },
    { ...base, displayStatus: "not_started" },
    { ...base, displayStatus: null },
  ]);
  assert.deepEqual(p, { reviewed: 1, total: 1, processing: 0, waiting: 0 });
  assert.equal(allReviewed(p), true);
  assert.equal(allReviewed(progress([])), false);
});

test("stripKey: piltastene, Home og End uten aa gaa rundt; andre taster gir null", () => {
  assert.equal(stripKey("ArrowRight", 0, 8), 1);
  assert.equal(stripKey("ArrowRight", 7, 8), 7);
  assert.equal(stripKey("ArrowLeft", 0, 8), 0);
  assert.equal(stripKey("ArrowLeft", 3, 8), 2);
  assert.equal(stripKey("Home", 5, 8), 0);
  assert.equal(stripKey("End", 2, 8), 7);
  assert.equal(stripKey("Enter", 2, 8), null);
  assert.equal(stripKey(" ", 2, 8), null);
  assert.equal(stripKey("ArrowRight", 0, 0), null);
  assert.equal(stripKey("ArrowRight", 99, 8), 7);
});
