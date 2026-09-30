import { test } from "node:test";
import assert from "node:assert/strict";
import { outputView, terminalState } from "./jobState.ts";
import { deriveProcessStatus, isProcessingStatus } from "../hooks/processStatus.ts";

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
  assert.equal(terminalState({ kind: "pending", status: "running" }), null);
});

test("awaiting_approval: bilde fra previewUrl, polling stopper, isProcessing false", () => {
  const s = terminalState({ kind: "awaiting_approval", previewUrl: "https://x/j1_preview_abc.jpg", jobId: "j1" });
  assert.ok(s);
  assert.equal(s.status, "awaiting_approval");
  assert.equal(s.imageUrl, "https://x/j1_preview_abc.jpg");
  assert.equal(s.error, null);
  const ps = processStatusFor(s.status);
  assert.equal(ps, "awaiting_approval");
  assert.equal(isProcessingStatus(ps), false);
});

test("needs_review: review uten bilde, polling stopper, isProcessing false", () => {
  const review = { code: "gate_review", reasons: ["r1"] };
  const s = terminalState({ kind: "needs_review", review });
  assert.ok(s);
  assert.equal(s.status, "needs_review");
  assert.equal(s.imageUrl, null);
  assert.deepEqual(s.review, review);
  assert.equal(s.error, null);
  assert.equal(isProcessingStatus(processStatusFor(s.status)), false);
});

test("unknown (200 og 202) stopper polling, isProcessing false", () => {
  for (const httpStatus of [200, 202]) {
    const s = terminalState({ kind: "unknown", status: "x", httpStatus });
    assert.ok(s);
    assert.equal(s.status, "unknown");
    assert.equal(s.error, null);
    assert.equal(isProcessingStatus(processStatusFor(s.status)), false);
  }
});

test("sync privacy_blur (L4): blob-URL fra submitJob gir done og vises i Output", () => {
  const syncResultUrl = "blob:http://localhost:3000/abc";
  const ps = deriveProcessStatus({
    isSubmitting: false,
    submitError: null,
    syncResultUrl,
    jobId: null,
    jobStatus: "idle",
  });
  assert.equal(ps, "done");
  assert.equal(isProcessingStatus(ps), false);
  assert.deepEqual(outputView(ps, syncResultUrl), { kind: "image", url: syncResultUrl });
});

test("failed med rejection beholder dagens oppfoersel", () => {
  const rejection = { reason: "interior" as const, message: "m" };
  const s = terminalState({ kind: "failed", detail: "d", rejection });
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
  const s = terminalState({ kind: "rejected_by_reviewer", reason: "Feil vindu" });
  assert.ok(s);
  assert.equal(s.status, "rejected_by_reviewer");
  assert.equal(s.reviewerReason, "Feil vindu");
  assert.equal(s.error, null);
  assert.equal(s.rejection, null);
  const ps = processStatusFor(s.status);
  assert.equal(ps, "rejected_by_reviewer");
  assert.equal(isProcessingStatus(ps), false);
});

test("done fra JSON (L3) bruker previewUrl", () => {
  const s = terminalState({ kind: "done", previewUrl: "https://x/j1_preview_abc.jpg", jobId: "j1" });
  assert.equal(s?.status, "done");
  assert.equal(s?.imageUrl, "https://x/j1_preview_abc.jpg");
  const none = terminalState({ kind: "done", previewUrl: null, jobId: "j1" });
  assert.equal(none?.imageUrl, null);
});

test("awaiting_approval uten previewUrl gir imageUrl null (plassholder)", () => {
  const s = terminalState({ kind: "awaiting_approval", previewUrl: null, jobId: "j1" });
  assert.equal(s?.status, "awaiting_approval");
  assert.equal(s?.imageUrl, null);
});

test("Express Output: previewUrl gir bilde, ellers plassholder ved awaiting_approval/done", () => {
  assert.deepEqual(outputView("awaiting_approval", "https://x/p.jpg"), { kind: "image", url: "https://x/p.jpg" });
  assert.deepEqual(outputView("awaiting_approval", null), { kind: "placeholder" });
  assert.deepEqual(outputView("done", null), { kind: "placeholder" });
  assert.deepEqual(outputView("running", null), { kind: "empty" });
  assert.deepEqual(outputView("idle", null), { kind: "empty" });
  // Hele kjeden: poll med bare result_url gir aldri bilde.
  const s = terminalState({ kind: "awaiting_approval", previewUrl: null, jobId: "j1" });
  assert.deepEqual(outputView(s!.status, s!.imageUrl), { kind: "placeholder" });
});
