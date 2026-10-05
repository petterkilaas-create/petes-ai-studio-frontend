import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { PollOutcome } from "./jobState.ts";

// TG-NEW-134: nye forsoek ved kaldstart. Egen fil fordi jobState.test.ts er
// laast med sjekksum (design.test.ts, D1). fetch og ventingen er falske:
// ingen nettverkskall og ingen timere.
process.env.NEXT_PUBLIC_API_BASE = "http://api.test";
const api = await import("./api.ts");
const { afterPoll } = await import("./jobState.ts");
const { POLL_TRANSIENT_DELAYS_MS, RETRY_DELAYS_MS, TransientError, getWithRetry, retryClock } = await import(
  "./retry.ts"
);

const realFetch = globalThis.fetch;
const getToken = async () => "tok";

/** Pausene som ble bedt om, i stedet for ekte venting. */
let slept: number[] = [];
retryClock.sleep = async (ms: number) => {
  slept.push(ms);
};

afterEach(() => {
  globalThis.fetch = realFetch;
  slept = [];
});

const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);

type Step = number | "network";

/** fetch som gir svarene i rekkefoelge (siste gjentas) og teller kallene. */
function scriptFetch(steps: Step[], body: unknown = []) {
  const calls: { method: string; auth: string | null }[] = [];
  globalThis.fetch = (async (_url: string, init?: RequestInit) => {
    const step = steps[Math.min(calls.length, steps.length - 1)];
    calls.push({
      method: init?.method ?? "GET",
      auth: new Headers(init?.headers).get("Authorization"),
    });
    if (step === "network") throw new TypeError("Failed to fetch");
    return new Response(JSON.stringify(body), { status: step, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  return calls;
}

// --- Hjelperen -------------------------------------------------------------

test("TG134: pausene for GET er 20 s til sammen, og for polling 20 s", () => {
  assert.deepEqual(RETRY_DELAYS_MS, [1000, 2000, 3000, 4000, 5000, 5000]);
  assert.equal(sum(RETRY_DELAYS_MS), 20_000);
  assert.deepEqual(POLL_TRANSIENT_DELAYS_MS, [2000, 4000, 6000, 8000]);
  assert.equal(sum(POLL_TRANSIENT_DELAYS_MS), 20_000);
});

test("TG134: GET med nettverksfeil og saa 200 lykkes etter nytt forsoek", async () => {
  const calls = scriptFetch(["network", 200]);
  let retries = 0;
  const rows = await api.listJobs({ getToken, onRetry: () => retries++ });
  assert.deepEqual(rows, []);
  assert.equal(calls.length, 2);
  assert.equal(retries, 1);
  assert.deepEqual(slept, [1000]);
});

for (const status of [502, 503, 504]) {
  test(`TG134: GET ${status} proeves paa nytt`, async () => {
    const calls = scriptFetch([status, status, 200]);
    await api.listJobs({ getToken });
    assert.equal(calls.length, 3);
    assert.deepEqual(slept, [1000, 2000]);
  });
}

for (const status of [400, 404, 500]) {
  test(`TG134: GET ${status} proeves ikke paa nytt`, async () => {
    const calls = scriptFetch([status, 200]);
    await assert.rejects(api.listJobs({ getToken }), (e: unknown) => e instanceof api.ListJobsError);
    assert.equal(calls.length, 1);
    assert.deepEqual(slept, []);
  });
}

test("TG134: getReview proever 503 paa nytt, men ikke 404 og 500", async () => {
  let calls = scriptFetch([503, 404]);
  assert.deepEqual(await api.getReview({ jobId: "j1", getToken }), { kind: "not_found" });
  assert.equal(calls.length, 2);
  calls = scriptFetch([500, 404]);
  assert.deepEqual(await api.getReview({ jobId: "j1", getToken }), { kind: "error", httpStatus: 500 });
  assert.equal(calls.length, 1);
});

test("TG134: POST (postDecision) proeves ikke paa nytt ved 503 eller nettverksfeil", async () => {
  const decision = { action: "approve" as const };
  let calls = scriptFetch([503, 200], { status: "approved" });
  await api.postDecision({ jobId: "j1", decision, getToken });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, "POST");

  calls = scriptFetch(["network", 200]);
  await assert.rejects(api.postDecision({ jobId: "j1", decision, getToken }), TypeError);
  assert.equal(calls.length, 1);
  assert.deepEqual(slept, []);
});

test("TG134: etter 20 s kommer den vanlige feilen (nettverk) og det vanlige svaret (503)", async () => {
  let calls = scriptFetch(["network"]);
  await assert.rejects(api.listJobs({ getToken }), (e: unknown) => e instanceof TypeError);
  assert.equal(calls.length, RETRY_DELAYS_MS.length + 1);
  assert.ok(sum(slept) <= 20_000);
  assert.deepEqual(slept, [...RETRY_DELAYS_MS]);

  slept = [];
  calls = scriptFetch([503]);
  assert.deepEqual(await api.getReview({ jobId: "j1", getToken }), { kind: "unavailable" });
  assert.equal(calls.length, 7);
  assert.equal(sum(slept), 20_000);

  slept = [];
  scriptFetch([503]);
  await assert.rejects(api.listJobs({ getToken }), (e: unknown) => e instanceof api.ListJobsError && e.httpStatus === 503);
  assert.equal(sum(slept), 20_000);
});

test("TG134: 401 og saa 200 virker som foer (ferskt token, ingen pause)", async () => {
  const tokens: (boolean | undefined)[] = [];
  const freshToken = async (o?: { skipCache?: boolean }) => {
    tokens.push(o?.skipCache);
    return o?.skipCache ? "fresh" : "old";
  };
  const calls = scriptFetch([401, 200]);
  await api.listJobs({ getToken: freshToken });
  assert.deepEqual(
    calls.map((c) => c.auth),
    ["Bearer old", "Bearer fresh"]
  );
  assert.deepEqual(tokens, [undefined, true]);
  assert.deepEqual(slept, []);
});

test("TG134: getWithRetry kaster andre feil enn TypeError med en gang", async () => {
  let n = 0;
  await assert.rejects(
    getWithRetry(async () => {
      n++;
      throw new Error("Not authenticated: Clerk token unavailable");
    }),
    /Not authenticated/
  );
  assert.equal(n, 1);
  assert.deepEqual(slept, []);
});

// --- Pollingen (afterPoll) --------------------------------------------------

test("TG134: pollJob kaster TransientError ved nettverksfeil og 502-504, ikke ved 500", async () => {
  for (const step of ["network", 502, 503, 504] as const) {
    scriptFetch([step]);
    await assert.rejects(api.pollJob({ jobId: "j1", getToken }), (e: unknown) => e instanceof TransientError);
  }
  scriptFetch([500]);
  await assert.rejects(
    api.pollJob({ jobId: "j1", getToken }),
    (e: unknown) => e instanceof Error && !(e instanceof TransientError) && /pollJob failed \(500\)/.test(e.message)
  );
  // pollJob venter aldri selv: afterPoll styrer pausene.
  assert.deepEqual(slept, []);
});

/**
 * Hookens poll-loekke (afterPoll) mot pollJob med en serie svar, uten
 * timere. Klokka gaar med ventetidene; `failUntilMs` gir nettverksfeil til
 * klokka har passert grensen, deretter `after`.
 */
async function runPollLoop(opts: {
  failUntilMs: number;
  fail?: Step;
  after: { status: number; body: unknown }[];
}) {
  let clock = 0;
  let calls = 0;
  let afterIndex = 0;
  globalThis.fetch = (async () => {
    calls++;
    if (clock < opts.failUntilMs) {
      const fail = opts.fail ?? "network";
      if (fail === "network") throw new TypeError("Failed to fetch");
      return new Response("<html>Service Unavailable</html>", { status: fail });
    }
    const { status, body } = opts.after[Math.min(afterIndex++, opts.after.length - 1)];
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  const delays: number[] = [];
  let consecutiveErrors = 0;
  for (let i = 0; i < 20; i++) {
    let outcome: PollOutcome;
    try {
      outcome = { ok: true, result: await api.pollJob({ jobId: "j1", getToken }) };
    } catch (error) {
      outcome = { ok: false, error };
    }
    const step = afterPoll(outcome, consecutiveErrors);
    if (step.kind !== "wait") return { calls, delays, step, clock };
    delays.push(step.delayMs);
    clock += step.delayMs;
    consecutiveErrors = step.consecutiveErrors;
  }
  throw new Error("pollingen stoppet ikke");
}

test("TG134: pollingen taaler en kaldstart (nettverksfeil i ca. 12 s) og blir ferdig", async () => {
  const { calls, delays, step } = await runPollLoop({
    failUntilMs: 12_000,
    after: [
      { status: 202, body: { status: "running" } },
      { status: 200, body: { status: "succeeded", result_url: "https://x/r.png", job_id: "j1" } },
    ],
  });
  assert.deepEqual(delays, [2000, 4000, 6000, 2000]);
  assert.equal(calls, 5);
  assert.equal(step.kind, "terminal");
  assert.equal(step.kind === "terminal" && step.state.status, "done");
});

test("TG134: pollingen taaler 503 i ca. 12 s paa samme maate", async () => {
  const { delays, step } = await runPollLoop({
    failUntilMs: 12_000,
    fail: 503,
    after: [{ status: 200, body: { status: "failed", code: "job_failed" } }],
  });
  assert.deepEqual(delays, [2000, 4000, 6000]);
  assert.equal(step.kind === "terminal" && step.state.status, "failed");
});

test("TG134: vedvarende nettverksfeil gir opp etter 20 s med pauser", async () => {
  const { calls, delays, step } = await runPollLoop({ failUntilMs: Infinity, after: [] });
  assert.deepEqual(delays, [...POLL_TRANSIENT_DELAYS_MS]);
  assert.equal(sum(delays), 20_000);
  assert.equal(calls, 5);
  assert.equal(step.kind, "gave_up");
  assert.match(step.kind === "gave_up" ? step.error : "", /pollJob failed \(network\)/);
});

test("TG134: 500 i pollingen gir fortsatt opp etter tre kall (2 s og 4 s)", async () => {
  const { calls, delays, step } = await runPollLoop({
    failUntilMs: 0,
    after: [{ status: 500, body: { detail: "x" } }],
  });
  assert.equal(calls, 3);
  assert.deepEqual(delays, [2000, 4000]);
  assert.equal(step.kind, "gave_up");
});
