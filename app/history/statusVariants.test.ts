import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canOpenReview,
  openLinkKey,
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

test("openLinkKey: Åpne bare paa egne godkjente skumringsjobber, ellers som foer (merking PR 4)", () => {
  const job = (status: string, service = "scene_transform", isOwner = true) =>
    ({ status, service, isOwner }) as Parameters<typeof openLinkKey>[0];
  assert.equal(openLinkKey(job("succeeded")), "history.open");
  // Andres jobb (admin, scope=all): ingen nedlasting, derfor ingen lenke.
  assert.equal(openLinkKey(job("succeeded", "scene_transform", false)), null);
  // Andre tjenester har ingen godkjenningsside.
  assert.equal(openLinkKey(job("succeeded", "magic_cleanup")), null);
  // Som foer: Åpne kontroll ogsaa paa andres jobber (bare lesing).
  assert.equal(openLinkKey(job("awaiting_approval")), "history.openReview");
  assert.equal(openLinkKey(job("needs_review", "scene_transform", false)), "history.openReview");
  for (const s of ["failed", "running", "queued", "rejected", "unknown"]) {
    assert.equal(openLinkKey(job(s)), null, s);
  }
});
