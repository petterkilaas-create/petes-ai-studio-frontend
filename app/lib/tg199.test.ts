import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DICTIONARIES } from "./i18n/index.ts";
import { decisionControls } from "./review.ts";
import type { DecisionAction } from "./api.ts";

// TG-NEW-199 (Petter 11.10, valg A): godkjenningssiden minner megleren paa
// aa sjekke at bildemodellen ikke har lagt til noe, bare naar «Godkjenn»
// vises, for alle roller. D-5a (Petter 25.10): linja «action.checkAdded» er
// erstattet av sjekklista per tjeneste (<ul>, tekstene i checklist.test.ts),
// med de samme reglene: bare med «Godkjenn», foer knappene, ikke i
// rettingen og bare i ordlista. Lista staar under advarselen eller
// merknaden fra kontrollen (tg199pr4.test.ts), fordi kontrollen ikke ser alt.
const APP = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");
/** Uten kommentarer, saa en kommentar ikke kan oppfylle eller bryte en sjekk. */
const code = (rel: string) => read(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const card = code("components/godkjenning/DecisionCard.tsx");
const page = code("(app)/godkjenning/[jobId]/page.tsx");

test("TG199 og D-5a: «action.checkAdded» er borte fra ordlista og koden", () => {
  assert.ok(!Object.hasOwn(DICTIONARIES.nb.ui, "action.checkAdded"));
  assert.ok(!Object.hasOwn(DICTIONARIES.en.ui, "action.checkAdded"));
  assert.doesNotMatch(card, /action\.checkAdded/);
  assert.doesNotMatch(page, /action\.checkAdded/);
});

test("TG199 og D-5a: lista vises bare sammen med «Godkjenn» (controls.approve)", () => {
  assert.equal(card.match(/<ul\b/g)?.length, 1, "lista står én gang i kortet");
  assert.equal(card.match(/CHECKLISTS\[checklist\]/g)?.length, 1);
  // Lista står i blokka som bare vises med controls.approve, og blokka slutter etter lista.
  const block = card.indexOf("{controls.approve && (\n            <div");
  const list = card.indexOf("<ul ");
  const blockEnd = card.indexOf("</div>\n          )}", block);
  assert.ok(block !== -1 && list > block && list < blockEnd, "lista er inne i controls.approve-blokka");
  // Uten liste (ukjent tjeneste) står bare krysset.
  assert.match(card, /\{checklist !== null && \(\s*<div>\s*<p id=\{checklistId\}/);
  // Tittelen over lista, og lista er merket med den.
  assert.match(card, /\{t\(locale, "checklist\.title"\)\}\s*<\/p>\s*<ul aria-labelledby=\{checklistId\}/);
  assert.match(card, /\{CHECKLISTS\[checklist\]\.map\(\(key\) => \(\s*<li key=\{key\}>\{t\(locale, key\)\}<\/li>\s*\)\)\}/);
  // Samme vern som knappen.
  assert.match(card, /\{controls\.approve && \(\s*<button\s+onClick=\{\(\) => onDecide\("approve"\)\}/);
});

test("TG199 og D-5a: lista og krysset står over knappene og ikke i rettingen", () => {
  const list = card.indexOf("<ul ");
  const box = card.indexOf('type="checkbox"');
  const correctionBranch = card.indexOf("correction !== null ? (");
  const otherwise = card.indexOf(") : (", correctionBranch);
  const buttons = card.indexOf('<div className="flex flex-wrap gap-3">');
  const approveButton = card.indexOf('onDecide("approve")');
  assert.ok(correctionBranch !== -1 && otherwise > correctionBranch, "kortet har grenen for rettingen");
  assert.ok(list > otherwise && box > otherwise, "lista og krysset er i grenen uten retting");
  assert.ok(list < box, "krysset under lista");
  assert.ok(box < buttons && box < approveButton, "lista og krysset står før knappene");
});

test("TG199 og D-5a: siden og kortet har ingen egen kopi av tekstene", () => {
  const texts = Object.entries(DICTIONARIES.nb.ui)
    .concat(Object.entries(DICTIONARIES.en.ui))
    .filter(([key]) => key.startsWith("checklist."))
    .map(([, text]) => text);
  assert.equal(texts.length, 32, "16 nøkler på nb og en (peisen i kveldsbilde, sjekklister_v2)");
  for (const text of texts) {
    assert.ok(!page.includes(text) && !card.includes(text), `bare i ordlista: ${text}`);
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
