import { test } from "node:test";
import assert from "node:assert/strict";
import { afterPoll } from "./jobState.ts";

// afterPoll (TG-NEW-156): regelen for neste steg i useJobStatus. Egen fil
// fordi jobState.test.ts er laast med sjekksum (design.test.ts, D1).

test("afterPoll: failed-svar er terminalt med en gang, uansett tidligere feil", () => {
  for (const errors of [0, 1, 2]) {
    const step = afterPoll({ ok: true, result: { kind: "failed", detail: "job_failed" } }, errors);
    assert.equal(step.kind, "terminal");
    assert.equal(step.kind === "terminal" && step.state.status, "failed");
    assert.equal(step.kind === "terminal" && step.state.error, "job_failed");
  }
});

test("afterPoll: pending venter Retry-After eller 2 s og nullstiller feiltelleren", () => {
  assert.deepEqual(afterPoll({ ok: true, result: { kind: "pending", status: "running", retryAfterMs: 3000 } }, 2), {
    kind: "wait",
    delayMs: 3000,
    consecutiveErrors: 0,
  });
  assert.deepEqual(afterPoll({ ok: true, result: { kind: "pending", status: "queued" } }, 1), {
    kind: "wait",
    delayMs: 2000,
    consecutiveErrors: 0,
  });
});

test("afterPoll: kastet feil gir 2 s, 4 s og saa failed med feilteksten, som foer", () => {
  const error = new Error("pollJob failed (500): x");
  assert.deepEqual(afterPoll({ ok: false, error }, 0), { kind: "wait", delayMs: 2000, consecutiveErrors: 1 });
  assert.deepEqual(afterPoll({ ok: false, error }, 1), { kind: "wait", delayMs: 4000, consecutiveErrors: 2 });
  assert.deepEqual(afterPoll({ ok: false, error }, 2), { kind: "gave_up", error: "pollJob failed (500): x" });
  assert.deepEqual(afterPoll({ ok: false, error: "nett" }, 2), { kind: "gave_up", error: "nett" });
});
