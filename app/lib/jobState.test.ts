import { test } from "node:test";
import assert from "node:assert/strict";
import { terminalState } from "./jobState.ts";
import { deriveProcessStatus, isProcessingStatus } from "../hooks/processStatus.ts";

const noBlob = () => {
  throw new Error("toObjectUrl skal ikke kalles");
};

function processStatusFor(jobStatus: Parameters<typeof deriveProcessStatus>[0]["jobStatus"]) {
  return deriveProcessStatus({
    isSubmitting: false,
    submitError: null,
    syncResultUrl: null,
    jobId: "j1",
    jobStatus,
  });
}

test("pending er ikke terminalt (polling fortsetter)", () => {
  assert.equal(terminalState({ kind: "pending", status: "running" }, noBlob), null);
});

test("awaiting_approval: bilde fra signert URL, polling stopper, isProcessing false", () => {
  const s = terminalState(
    { kind: "awaiting_approval", resultUrl: "https://x/signed.png", jobId: "j1" },
    noBlob
  );
  assert.ok(s);
  assert.equal(s.status, "awaiting_approval");
  assert.equal(s.imageUrl, "https://x/signed.png");
  assert.equal(s.error, null);
  const ps = processStatusFor(s.status);
  assert.equal(ps, "awaiting_approval");
  assert.equal(isProcessingStatus(ps), false);
});

test("needs_review: review uten bilde, polling stopper, isProcessing false", () => {
  const review = { code: "gate_review", reasons: ["r1"] };
  const s = terminalState({ kind: "needs_review", review }, noBlob);
  assert.ok(s);
  assert.equal(s.status, "needs_review");
  assert.equal(s.imageUrl, null);
  assert.deepEqual(s.review, review);
  assert.equal(s.error, null);
  assert.equal(isProcessingStatus(processStatusFor(s.status)), false);
});

test("unknown (200 og 202) stopper polling, isProcessing false", () => {
  for (const httpStatus of [200, 202]) {
    const s = terminalState({ kind: "unknown", status: "x", httpStatus }, noBlob);
    assert.ok(s);
    assert.equal(s.status, "unknown");
    assert.equal(s.error, null);
    assert.match(s.unknownDetail ?? "", new RegExp(`HTTP ${httpStatus}`));
    assert.equal(isProcessingStatus(processStatusFor(s.status)), false);
  }
});

test("done bruker object-URL fra blob", () => {
  const s = terminalState(
    { kind: "done", imageBlob: new Blob(["x"]), jobId: "j1" },
    () => "blob:abc"
  );
  assert.equal(s?.status, "done");
  assert.equal(s?.imageUrl, "blob:abc");
});

test("failed med rejection beholder dagens oppfoersel", () => {
  const rejection = { reason: "interior" as const, message: "m" };
  const s = terminalState({ kind: "failed", detail: "d", rejection }, noBlob);
  assert.equal(s?.status, "failed");
  assert.equal(s?.error, "m");
  assert.deepEqual(s?.rejection, rejection);
});

test("pending-jobb gir running og isProcessing true", () => {
  const ps = processStatusFor("pending");
  assert.equal(ps, "running");
  assert.equal(isProcessingStatus(ps), true);
});

test("rejected_by_reviewer: egen sluttstatus, ikke failed, polling stopper", () => {
  const s = terminalState({ kind: "rejected_by_reviewer", reason: "Feil vindu" }, noBlob);
  assert.ok(s);
  assert.equal(s.status, "rejected_by_reviewer");
  assert.equal(s.reviewerReason, "Feil vindu");
  assert.equal(s.error, null);
  assert.equal(s.rejection, null);
  const ps = processStatusFor(s.status);
  assert.equal(ps, "rejected_by_reviewer");
  assert.equal(isProcessingStatus(ps), false);
});
