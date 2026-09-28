import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canOpenReview,
  hasResultImage,
  isRejectedByReviewer,
  statusVariant,
} from "./statusVariants.ts";

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

test("avvist av megleren kjennes paa code, ikke paa error-teksten", () => {
  assert.equal(isRejectedByReviewer({ status: "failed", code: "rejected_by_reviewer" }), true);
  assert.equal(isRejectedByReviewer({ status: "failed", code: null }), false);
  assert.equal(isRejectedByReviewer({ status: "failed", code: "needs_review" }), false);
  assert.equal(isRejectedByReviewer({ status: "succeeded", code: "rejected_by_reviewer" }), false);
});

test("Åpne kontroll bare for Til kontroll og Til gjennomgang", () => {
  assert.equal(canOpenReview("awaiting_approval"), true);
  assert.equal(canOpenReview("needs_review"), true);
  for (const s of ["succeeded", "failed", "running", "unknown", "rejected"]) {
    assert.equal(canOpenReview(s), false, s);
  }
});
