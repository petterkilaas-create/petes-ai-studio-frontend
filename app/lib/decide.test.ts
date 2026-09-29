import { test } from "node:test";
import assert from "node:assert/strict";
import { runDecision, type InFlight } from "./decide.ts";
import { buildDecision } from "./review.ts";
import type { DecisionOutcome, DecisionRequest } from "./api.ts";

/**
 * Siden i miniatyr: `shown` er review-svaret som vises, `refetch` bytter det
 * ut, og `send` bygger body fra det som vises naar brukeren klikker.
 */
function page(first: number | null, afterRefetch: number | null, outcomes: DecisionOutcome[]) {
  const state = {
    shown: { version: first },
    inFlight: { current: false } as InFlight,
    sent: [] as DecisionRequest[],
    log: [] as string[],
  };
  const run = (opts: { send?: () => Promise<DecisionOutcome> } = {}) => {
    const review = state.shown;
    return runDecision({
      inFlight: state.inFlight,
      send:
        opts.send ??
        (async () => {
          state.sent.push(buildDecision("reject", "", null, review));
          state.log.push("send");
          return outcomes.shift() ?? { kind: "updated", status: null };
        }),
      refetch: async () => {
        state.log.push("refetch");
        state.shown = { version: afterRefetch };
      },
      handle: (out) => state.log.push(`handle:${out.kind}`),
      onStart: () => state.log.push("start"),
      onError: () => state.log.push("error"),
      onSettled: () => state.log.push("settled"),
    });
  };
  return { state, run };
}

test("409 status_changed henter review paa nytt, og neste klikk sender ny versjon", async () => {
  const { state, run } = page(1, 2, [{ kind: "status_changed", status: "awaiting_approval" }]);
  assert.equal(await run(), true);
  assert.deepEqual(state.log, ["start", "send", "refetch", "handle:status_changed", "settled"]);
  assert.deepEqual(state.shown, { version: 2 });
  await run();
  assert.deepEqual(state.sent.map((b) => b.expected_version), [1, 2]);
});

test("200 henter review paa nytt; 202, blocked og error gjoer det ikke", async () => {
  const { state, run } = page(1, 2, [
    { kind: "updated", status: "succeeded" },
    { kind: "poll", status: "running" },
    { kind: "blocked", code: "action_not_allowed", fields: [], overrideCode: null },
    { kind: "unavailable", code: "archive_failed" },
    { kind: "not_found" },
    { kind: "error", httpStatus: 500 },
  ]);
  for (let i = 0; i < 6; i++) await run();
  assert.equal(state.log.filter((l) => l === "refetch").length, 1);
  assert.equal(state.log.indexOf("refetch"), 2);
});

test("dobbeltklikk: bare ett kall, og vernet slippes etterpaa", async () => {
  const { state, run } = page(1, 1, []);
  let release: (out: DecisionOutcome) => void = () => {};
  const slow = () =>
    new Promise<DecisionOutcome>((resolve) => {
      state.log.push("send");
      release = resolve;
    });
  const first = run({ send: slow });
  assert.equal(await run({ send: slow }), false);
  assert.equal(state.inFlight.current, true);
  release({ kind: "updated", status: null });
  assert.equal(await first, true);
  assert.equal(state.inFlight.current, false);
  assert.deepEqual(state.log, ["start", "send", "refetch", "handle:updated", "settled"]);
  assert.equal(await run(), true);
});

test("feil under sending gir feilmelding og slipper vernet", async () => {
  const { state, run } = page(1, 1, []);
  const failing = async (): Promise<DecisionOutcome> => {
    throw new Error("nett");
  };
  assert.equal(await run({ send: failing }), true);
  assert.deepEqual(state.log, ["start", "error", "settled"]);
  assert.equal(state.inFlight.current, false);
});

test("uten version sendes ikke expected_version, ogsaa etter ny henting", async () => {
  const { state, run } = page(null, null, [{ kind: "status_changed", status: "needs_review" }]);
  await run();
  await run();
  for (const body of state.sent) assert.equal("expected_version" in body, false);
});
