import { test } from "node:test";
import assert from "node:assert/strict";
import { hasResultImage, statusVariant } from "./statusVariants.ts";

test("nye statuser har egne etiketter", () => {
  assert.equal(statusVariant("awaiting_approval").label, "Til kontroll");
  assert.equal(statusVariant("needs_review").label, "Til gjennomgang");
});

test("ukjente verdier gir standardvarianten, ingen krasj", () => {
  for (const raw of ["cancelled", "teleported", "", "__proto__", "toString"]) {
    const v = statusVariant(raw);
    assert.equal(v.label, "Ukjent status", raw);
    assert.equal(typeof v.cls, "string");
  }
});

test("thumbnail for succeeded og awaiting_approval", () => {
  assert.equal(hasResultImage("succeeded"), true);
  assert.equal(hasResultImage("awaiting_approval"), true);
  assert.equal(hasResultImage("needs_review"), false);
  assert.equal(hasResultImage("unknown"), false);
});
