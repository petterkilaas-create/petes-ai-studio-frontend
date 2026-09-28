import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildDecision,
  decisionControls,
  outcome,
  reasonLength,
  reasonTooLong,
  resultImageUrl,
  shouldPoll,
  variantOptions,
} from "./review.ts";
import type { DecisionAction } from "./api.ts";

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
  assert.deepEqual(buildDecision("approve", "tekst", "yes"), { action: "approve" });
  assert.deepEqual(buildDecision("reject", "  Feil vindu  ", "yes"), { action: "reject", reason: "Feil vindu" });
  assert.deepEqual(buildDecision("reject", "   ", null), { action: "reject" });
  assert.deepEqual(buildDecision("continue", "tekst", "no"), { action: "continue", fireplace_fire: "no" });
  assert.deepEqual(buildDecision("continue", "", null), { action: "continue" });
});

test("begrunnelsen telles i tegn etter trimming, grense 500", () => {
  assert.equal(reasonLength("  æøå  "), 3);
  assert.equal(reasonLength("😀"), 1);
  assert.equal(reasonTooLong("a".repeat(500)), false);
  assert.equal(reasonTooLong("a".repeat(501)), true);
  assert.equal(reasonTooLong(` ${"a".repeat(500)} `), false);
});

test("bryter løftet/rått bare naar begge bildene finnes", () => {
  const both = { originalUrl: "o", resultUrl: "lifted", rawUrl: "raw", previous: null };
  assert.deepEqual(variantOptions(both), ["lifted", "raw"]);
  assert.equal(resultImageUrl(both, "lifted"), "lifted");
  assert.equal(resultImageUrl(both, "raw"), "raw");
  const onlyResult = { originalUrl: "o", resultUrl: "lifted", rawUrl: null, previous: null };
  assert.deepEqual(variantOptions(onlyResult), []);
  assert.equal(resultImageUrl(onlyResult, "raw"), "lifted");
  const none = { originalUrl: "o", resultUrl: null, rawUrl: null, previous: null };
  assert.equal(resultImageUrl(none, "lifted"), null);
});

test("«Forrige runde» bare naar images.previous har et bilde", () => {
  const previous = { round: 0, resultUrl: "prev", rawUrl: "prev-raw" };
  const both = { originalUrl: "o", resultUrl: "lifted", rawUrl: "raw", previous };
  assert.deepEqual(variantOptions(both), ["lifted", "raw", "previous"]);
  assert.equal(resultImageUrl(both, "previous"), "prev");
  const onlyResult = { originalUrl: "o", resultUrl: "lifted", rawUrl: null, previous };
  assert.deepEqual(variantOptions(onlyResult), ["lifted", "previous"]);
  const rawOnly = { ...both, previous: { round: 0, resultUrl: null, rawUrl: "prev-raw" } };
  assert.equal(resultImageUrl(rawOnly, "previous"), "prev-raw");
  const empty = { ...both, previous: { round: 0, resultUrl: null, rawUrl: null } };
  assert.deepEqual(variantOptions(empty), ["lifted", "raw"]);
  // Uten previous faller «Forrige runde» tilbake til gjeldende bilde.
  assert.equal(resultImageUrl({ ...both, previous: null }, "previous"), "lifted");
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
