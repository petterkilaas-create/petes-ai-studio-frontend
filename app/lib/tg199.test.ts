import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { t } from "./i18n/index.ts";
import { decisionControls } from "./review.ts";
import type { DecisionAction } from "./api.ts";

// TG-NEW-199 (Petter 11.10, valg A): til den automatiske kontrollen er paa
// plass, minner godkjenningssiden megleren paa aa sjekke at bildemodellen
// ikke har lagt til noe. Én linje over knappene, bare naar «Godkjenn» vises,
// for begge stiler og begge roller. Ingen avkrysning.
const APP = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");
/** Uten kommentarer, saa en kommentar ikke kan oppfylle eller bryte en sjekk. */
const code = (rel: string) => read(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const card = code("components/godkjenning/DecisionCard.tsx");
const page = code("(app)/godkjenning/[jobId]/page.tsx");

const NB = "Sjekk at bildet ikke har fått nye vinduer, dører, lamper eller glass i dører. Sammenlign med originalen.";
const EN = "Check that the image has no new windows, doors, lamps or glass in doors. Compare with the original.";

test("TG199: teksten paa norsk og engelsk", () => {
  assert.equal(t("nb", "action.checkAdded"), NB);
  assert.equal(t("en", "action.checkAdded"), EN);
});

test("TG199: linja vises bare sammen med «Godkjenn» (controls.approve)", () => {
  const uses = card.match(/"action\.checkAdded"/g) ?? [];
  assert.equal(uses.length, 1, "linja står én gang i kortet");
  assert.match(
    card,
    /\{controls\.approve && <p className="text-sm text-ink">\{t\(locale, "action\.checkAdded"\)\}<\/p>\}/
  );
  // Samme vern som knappen.
  assert.match(card, /\{controls\.approve && \(\s*<button\s+onClick=\{\(\) => onDecide\("approve"\)\}/);
});

test("TG199: linja står over knappene og ikke i rettingen", () => {
  const line = card.indexOf('"action.checkAdded"');
  const correctionBranch = card.indexOf("correction !== null ? (");
  const otherwise = card.indexOf(") : (", correctionBranch);
  const buttons = card.indexOf('<div className="flex flex-wrap gap-3">');
  const approveButton = card.indexOf('onDecide("approve")');
  assert.ok(correctionBranch !== -1 && otherwise > correctionBranch, "kortet har grenen for rettingen");
  assert.ok(line > otherwise, "linja er i grenen uten retting");
  assert.ok(line < buttons && line < approveButton, "linja står før knappene");
});

test("TG199: siden har ingen egen kopi av teksten", () => {
  assert.doesNotMatch(page, /action\.checkAdded/);
  for (const text of [NB, EN]) {
    assert.ok(!page.includes(text) && !card.includes(text), "teksten bare i ordlista");
  }
});

test("TG199: controls.approve følger bare allowed_actions", () => {
  const review = (allowed: DecisionAction[]) => ({
    allowedActions: allowed,
    fireplace: { present: false, disagreement: false, answer: null },
  });
  assert.equal(decisionControls(review(["approve", "reject"]), null).approve, true);
  assert.equal(decisionControls(review(["reject"]), null).approve, false);
  assert.equal(decisionControls(review(["continue", "reject"]), null).approve, false);
  assert.equal(decisionControls(review([]), null).approve, false);
});
