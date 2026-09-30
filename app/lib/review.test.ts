import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildDecision,
  decisionControls,
  FIREPLACE_OPTIONS,
  fireplaceAnswerKey,
  outcome,
  reasonLength,
  reasonTooLong,
  resultImageUrl,
  shouldPoll,
  variantOptions,
} from "./review.ts";
import type { DecisionAction } from "./api.ts";

// Review-svar uten version (backend fra foer TG-NEW-130).
const NO_VERSION = { version: null };

function review(allowed: DecisionAction[], present = false, disagreement = false) {
  return { allowedActions: allowed, fireplace: { present, disagreement, answer: null } };
}

test("awaiting_approval (2d-1a): Godkjenn og Avvis, ingen Send videre", () => {
  const c = decisionControls(review(["approve", "reject"]), null);
  assert.deepEqual(c, {
    approve: true, reject: true, continue: false,
    fireplaceQuestion: false, continueEnabled: false, none: false,
  });
});

test("needs_review (2d-1a): bare Avvis, ogsaa naar bildet har peis", () => {
  const c = decisionControls(review(["reject"], true, true), null);
  assert.equal(c.reject, true);
  assert.equal(c.approve, false);
  assert.equal(c.continue, false);
  assert.equal(c.fireplaceQuestion, false);
});

test("continue uten peis: Send videre aktiv uten svar", () => {
  const c = decisionControls(review(["continue", "reject"]), null);
  assert.equal(c.fireplaceQuestion, false);
  assert.equal(c.continueEnabled, true);
});

test("continue med peis eller uenighet krever peissvar", () => {
  for (const [present, disagreement] of [[true, false], [false, true], [true, true]]) {
    const r = review(["continue", "reject"], present, disagreement);
    assert.equal(decisionControls(r, null).fireplaceQuestion, true);
    assert.equal(decisionControls(r, null).continueEnabled, false);
    assert.equal(decisionControls(r, "yes").continueEnabled, true);
    assert.equal(decisionControls(r, "no").continueEnabled, true);
  }
});

test("ingen handlinger gir none", () => {
  assert.equal(decisionControls(review([]), null).none, true);
});

test("buildDecision: begrunnelse bare ved reject, peissvar bare ved continue", () => {
  assert.deepEqual(buildDecision("approve", "tekst", "yes", NO_VERSION), { action: "approve" });
  assert.deepEqual(buildDecision("reject", "  Feil vindu  ", "yes", NO_VERSION), { action: "reject", reason: "Feil vindu" });
  assert.deepEqual(buildDecision("reject", "   ", null, NO_VERSION), { action: "reject" });
  assert.deepEqual(buildDecision("continue", "tekst", "no", NO_VERSION), { action: "continue", fireplace_fire: "no" });
  assert.deepEqual(buildDecision("continue", "", null, NO_VERSION), { action: "continue" });
});

test("peisvalgene sender fortsatt yes og no (2d-2d)", () => {
  assert.deepEqual(FIREPLACE_OPTIONS, [
    { value: "yes", key: "action.fireplaceLit" },
    { value: "no", key: "action.fireplaceNotLit" },
  ]);
  for (const { value } of FIREPLACE_OPTIONS) {
    assert.deepEqual(buildDecision("continue", "", value, NO_VERSION), { action: "continue", fireplace_fire: value });
  }
  assert.equal(fireplaceAnswerKey("yes"), "action.fireplaceLit");
  assert.equal(fireplaceAnswerKey("no"), "action.fireplaceNotLit");
});

test("begrunnelsen telles i tegn etter trimming, grense 500", () => {
  assert.equal(reasonLength("  æøå  "), 3);
  assert.equal(reasonLength("😀"), 1);
  assert.equal(reasonTooLong("a".repeat(500)), false);
  assert.equal(reasonTooLong("a".repeat(501)), true);
  assert.equal(reasonTooLong(` ${"a".repeat(500)} `), false);
});

// Lekkasjen L2: de gamle feltene er fylt ut i alle testene under, saa et
// tilbakefall til resultUrl/rawUrl blir fanget.
const OLD = { originalUrl: "o", resultUrl: "lifted.png", rawUrl: "raw.png" };
const OLD_PREV = { round: 0, resultUrl: "prev.png", rawUrl: "prev-raw.png" };

test("bildet kommer fra previewUrl", () => {
  const images = { ...OLD, previewUrl: "p.jpg", rawPreviewUrl: null, previous: null };
  assert.equal(resultImageUrl(images, "lifted"), "p.jpg");
});

test("previewUrl null gir plassholder (null), aldri resultUrl eller rawUrl", () => {
  const images = { ...OLD, previewUrl: null, rawPreviewUrl: null, previous: null };
  for (const v of ["lifted", "raw", "previous"] as const) {
    assert.equal(resultImageUrl(images, v), null, v);
  }
});

test("«Rått» bare naar rawPreviewUrl finnes, og viser da den", () => {
  const admin = { ...OLD, previewUrl: "p.jpg", rawPreviewUrl: "rp.jpg", previous: null };
  assert.deepEqual(variantOptions(admin), ["lifted", "raw"]);
  assert.equal(resultImageUrl(admin, "raw"), "rp.jpg");
  const owner = { ...OLD, previewUrl: "p.jpg", rawPreviewUrl: null, previous: null };
  assert.deepEqual(variantOptions(owner), []);
  assert.equal(resultImageUrl(owner, "raw"), null, "rått faller ikke tilbake til rawUrl");
});

test("«Forrige runde» vises fra previous.previewUrl", () => {
  const images = {
    ...OLD, previewUrl: "p.jpg", rawPreviewUrl: null,
    previous: { ...OLD_PREV, previewUrl: "pp.jpg" },
  };
  assert.deepEqual(variantOptions(images), ["lifted", "previous"]);
  assert.equal(resultImageUrl(images, "previous"), "pp.jpg");
  const notReady = { ...images, previous: { ...OLD_PREV, previewUrl: null } };
  assert.deepEqual(variantOptions(notReady), ["lifted", "previous"]);
  assert.equal(resultImageUrl(notReady, "previous"), null, "plassholder, aldri previous.resultUrl");
  const admin = { ...images, rawPreviewUrl: "rp.jpg" };
  assert.deepEqual(variantOptions(admin), ["lifted", "raw", "previous"]);
  // Uten forrige runde: ingen knapp, og ikke gjeldende bilde under feil etikett.
  const first = { ...images, previous: null };
  assert.deepEqual(variantOptions(first), []);
  assert.equal(resultImageUrl(first, "previous"), null);
});

test("outcome: venter gir null, ellers riktig linje", () => {
  assert.equal(outcome({ status: "awaiting_approval", decisions: [] }), null);
  assert.equal(outcome({ status: "needs_review", decisions: [] }), null);
  assert.deepEqual(outcome({ status: "succeeded", decisions: [] }), { key: "review.statusSucceeded", reason: null });
  assert.deepEqual(outcome({ status: "running", decisions: [] }), { key: "review.statusRunning", reason: null });
  const rejected = {
    status: "failed",
    decisions: [{ action: "reject", at: "t", byRole: "owner", reason: "Feil vindu" }],
  };
  assert.deepEqual(outcome(rejected), { key: "review.statusRejected", reason: "Feil vindu" });
  assert.deepEqual(outcome({ status: "failed", decisions: [] }), { key: "review.statusOther", reason: null });
  assert.deepEqual(outcome({ status: "teleported", decisions: [] }), { key: "review.statusOther", reason: null });
});

test("shouldPoll: bare queued og running", () => {
  assert.equal(shouldPoll("running"), true);
  assert.equal(shouldPoll("queued"), true);
  for (const s of ["awaiting_approval", "needs_review", "succeeded", "failed", "unknown", ""]) {
    assert.equal(shouldPoll(s), false, s);
  }
});
