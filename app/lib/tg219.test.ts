import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { codeText } from "./i18n/index.ts";
import { MEGLER_REASON_CODES, meglerReason } from "./review.ts";

// TG-NEW-219 (dag 47): megleren ser grunnen naar Blaa himmel stopper et
// bilde i port 1, paa en linje over knappene.

const APP_DIR = fileURLToPath(new URL("..", import.meta.url));
const read = (rel: string) => readFileSync(join(APP_DIR, rel), "utf8");
const withoutComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

function stopped(reasonCodes: string[], status = "needs_review", code: string | null = "gate_review") {
  return { status, code, reasonCodes };
}

test("TG-NEW-219: hver av de tre kodene gir seg selv", () => {
  for (const code of MEGLER_REASON_CODES) {
    assert.equal(meglerReason(stopped([code])), code);
  }
});

test("TG-NEW-219: flere koder gir den foerste etter lista", () => {
  assert.equal(
    meglerReason(stopped(["sky_through_windows_only", "image_type_not_supported"])),
    "image_type_not_supported"
  );
  assert.equal(meglerReason(stopped(["analysis_uncertain", "sky_missing"])), "sky_missing");
});

test("TG-NEW-219: andre koder alene og tom liste gir null", () => {
  for (const code of ["image_type_untested", "analysis_disagreement", "__proto__", "toString"]) {
    assert.equal(meglerReason(stopped([code])), null, code);
  }
  assert.equal(meglerReason(stopped([])), null);
});

test("TG-NEW-219: bare ved needs_review og gate_review", () => {
  assert.equal(meglerReason(stopped(["sky_missing"], "awaiting_approval")), null);
  assert.equal(meglerReason(stopped(["sky_missing"], "needs_review", "fireplace_answer_missing")), null);
  assert.equal(meglerReason(stopped(["sky_missing"], "needs_review", null)), null);
});

test("TG-NEW-219: de tre tekstene staar ordrett i nb", () => {
  assert.equal(
    codeText("nb", "reasonCode", "image_type_not_supported"),
    "Blå himmel kan ikke brukes på bilder tatt innendørs."
  );
  assert.equal(codeText("nb", "reasonCode", "sky_missing"), "Bildet har ingen himmel som kan byttes.");
  assert.equal(codeText("nb", "reasonCode", "sky_through_windows_only"), "Himmelen synes bare gjennom vinduer.");
});

test("TG-NEW-219: siden sender grunnen for alle roller, og kortet viser den", () => {
  const page = withoutComments(read("(app)/godkjenning/[jobId]/page.tsx"));
  assert.match(page, /reason=\{meglerReason\(review\)\}/);
  assert.doesNotMatch(page, /reason=\{[^}]*admin/);
  const card = withoutComments(read("components/godkjenning/DecisionCard.tsx"));
  assert.match(card, /codeText\(locale, "reasonCode", reason\)/);
});
