import { test, before, afterEach } from "node:test";
import assert from "node:assert/strict";

// api.ts kaster ved import uten NEXT_PUBLIC_API_BASE — sett en dummy-verdi
// foer dynamisk import. fetch mockes; ingen nettverkskall.
process.env.NEXT_PUBLIC_API_BASE = "http://api.test";
const api = await import("./api.ts");

const realFetch = globalThis.fetch;
const getToken = async () => "tok";

function mockFetch(status: number, body: unknown, headers: Record<string, string> = {}) {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json", ...headers },
    })) as typeof fetch;
}

before(() => {
  assert.equal(api.API_BASE, "http://api.test");
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

test("200 awaiting_approval gir resultUrl (terminalt)", async () => {
  mockFetch(200, { status: "awaiting_approval", result_url: "https://x/signed.png", job_id: "j1" });
  const r = await api.pollJob({ jobId: "j1", getToken });
  assert.deepEqual(r, { kind: "awaiting_approval", resultUrl: "https://x/signed.png", jobId: "j1" });
});

test("200 awaiting_approval uten result_url gir unknown", async () => {
  mockFetch(200, { status: "awaiting_approval" });
  const r = await api.pollJob({ jobId: "j1", getToken });
  assert.equal(r.kind, "unknown");
});

test("200 needs_review gir code og reasons, uten bilde", async () => {
  mockFetch(200, { status: "needs_review", code: "fireplace_answer_missing", reasons: ["peis uten svar", 3] });
  const r = await api.pollJob({ jobId: "j1", getToken });
  assert.deepEqual(r, {
    kind: "needs_review",
    review: { code: "fireplace_answer_missing", reasons: ["peis uten svar"] },
  });
});

test("200 med ukjent status gir unknown, ikke failed", async () => {
  mockFetch(200, { status: "teleported" });
  const r = await api.pollJob({ jobId: "j1", getToken });
  assert.deepEqual(r, { kind: "unknown", status: "teleported", httpStatus: 200 });
});

test("200 uten status-felt gir unknown", async () => {
  mockFetch(200, {});
  const r = await api.pollJob({ jobId: "j1", getToken });
  assert.deepEqual(r, { kind: "unknown", status: null, httpStatus: 200 });
});

test("200 rejected er uendret (failed + rejection)", async () => {
  mockFetch(200, { status: "rejected", code: "rejected_interior", message: "Interiør" });
  const r = await api.pollJob({ jobId: "j1", getToken });
  assert.deepEqual(r, {
    kind: "failed",
    detail: "Interiør",
    rejection: { reason: "interior", message: "Interiør" },
  });
});

test("202 running er fortsatt pending med Retry-After", async () => {
  mockFetch(202, { status: "running" }, { "Retry-After": "3" });
  const r = await api.pollJob({ jobId: "j1", getToken });
  assert.deepEqual(r, { kind: "pending", status: "running", retryAfterMs: 3000 });
});

test("202 med ukjent status gir unknown (ingen evig polling)", async () => {
  mockFetch(202, { status: "awaiting_approval" });
  const r = await api.pollJob({ jobId: "j1", getToken });
  assert.deepEqual(r, { kind: "unknown", status: "awaiting_approval", httpStatus: 202 });
});

test("listJobs normaliserer ukjente statuser til unknown", async () => {
  const row = { service: "scene_transform", created_at: null, result_url: null, variant_urls: null, error: null };
  mockFetch(200, [
    { ...row, job_id: "a", status: "awaiting_approval" },
    { ...row, job_id: "b", status: "needs_review" },
    { ...row, job_id: "c", status: "cancelled" },
    { ...row, job_id: "d", status: 42 },
    { ...row, job_id: "e", status: "succeeded" },
  ]);
  const rows = await api.listJobs({ getToken });
  assert.deepEqual(
    rows.map((r) => r.status),
    ["awaiting_approval", "needs_review", "unknown", "unknown", "succeeded"]
  );
});

// ---- 2d-1: avvist av megleren, listing, review og decision -----------------

function captureFetch(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  return calls;
}

test("200 failed + rejected_by_reviewer gir egen sluttstatus med begrunnelse", async () => {
  mockFetch(200, { status: "failed", code: "rejected_by_reviewer", reason: "Feil vindu" });
  const r = await api.pollJob({ jobId: "j1", getToken });
  assert.deepEqual(r, { kind: "rejected_by_reviewer", reason: "Feil vindu" });
});

test("rejected_by_reviewer uten begrunnelse gir reason null", async () => {
  for (const reason of [null, undefined, "", "  ", 7]) {
    mockFetch(200, { status: "failed", code: "rejected_by_reviewer", reason });
    const r = await api.pollJob({ jobId: "j1", getToken });
    assert.deepEqual(r, { kind: "rejected_by_reviewer", reason: null }, String(reason));
  }
});

test("200 failed med annen kode er fortsatt unknown (ikke avvist)", async () => {
  mockFetch(200, { status: "failed", code: "something_else" });
  const r = await api.pollJob({ jobId: "j1", getToken });
  assert.equal(r.kind, "unknown");
});

test("listJobs sender statusfilteret og leser code/reason", async () => {
  const row = { service: "scene_transform", created_at: null, result_url: null, variant_urls: null };
  const calls = captureFetch(200, [
    { ...row, job_id: "a", status: "failed", error: "rejected_by_reviewer: x", code: "rejected_by_reviewer", reason: "x" },
    { ...row, job_id: "b", status: "needs_review", error: null, code: "needs_review", reason: null },
    { ...row, job_id: "c", status: "succeeded", error: null },
  ]);
  const rows = await api.listJobs({ statuses: api.WAITING_FOR_ME_STATUSES, getToken });
  assert.equal(
    new URL(calls[0].url).searchParams.get("status"),
    "awaiting_approval,needs_review"
  );
  assert.deepEqual(
    rows.map((r) => [r.code, r.reason]),
    [["rejected_by_reviewer", "x"], ["needs_review", null], [null, null]]
  );
});

test("listJobs uten filter sender ikke status", async () => {
  const calls = captureFetch(200, []);
  await api.listJobs({ getToken });
  assert.equal(new URL(calls[0].url).searchParams.has("status"), false);
});

const REVIEW_BODY = {
  job_id: "j1",
  status: "needs_review",
  code: "gate_review",
  reason_codes: ["analysis_uncertain", "brand_new_code"],
  flag_codes: ["sky_visibility_disagreement"],
  allowed_actions: ["reject", "teleport"],
  valid_runs: 2,
  fireplace: { present: true, disagreement: false, answer: null },
  image_type: { value: "interior", run_values: ["interior", "exterior_facade"] },
  sky_visibility: { value: "limited", run_values: ["limited", "limited"] },
  lights: {
    approved: [{ id: "L1", type: "pendant", location: "over bordet" }],
    unstable: [{ id: "L2", type: "floor_lamp", location: "hjørnet", run: 1 }],
    rejected: [{ id: "L3", type: "candle", location: "vindu", run: 2, reason_code: "not_confirmed" }],
  },
  images: { original_url: "https://x/o.jpg", result_url: null, raw_url: null },
  decisions: [],
};

test("getReview 200 normaliserer svaret og ignorerer ukjente handlinger", async () => {
  const calls = captureFetch(200, REVIEW_BODY);
  const r = await api.getReview({ jobId: "j 1", getToken });
  assert.equal(calls[0].url, "http://api.test/v1/jobs/j%201/review");
  assert.equal(r.kind, "ok");
  if (r.kind !== "ok") return;
  assert.deepEqual(r.review.allowedActions, ["reject"]);
  assert.deepEqual(r.review.reasonCodes, ["analysis_uncertain", "brand_new_code"]);
  // Svar fra foer 2d-2a (uten key/editable/state) gir laaste lyskilder.
  assert.deepEqual(r.review.lights.rejected[0], {
    key: null, id: "L3", run: 2, type: "candle", location: "vindu", reasonCode: "not_confirmed",
    editable: false, state: null,
  });
  assert.deepEqual(r.review.correction, { roundsLeft: 0, lastRoundFailed: false });
  assert.equal(r.review.images.previous, null);
  assert.equal(r.review.lights.approved[0].reasonCode, null);
  assert.deepEqual(r.review.imageType.runValues, ["interior", "exterior_facade"]);
  assert.equal(r.review.images.originalUrl, "https://x/o.jpg");
});

test("normalizeReview krasjer ikke paa tomt eller oedelagt svar", () => {
  for (const raw of [null, {}, [], "x", { lights: "x", images: 3, fireplace: [], decisions: [1, null] }]) {
    const r = api.normalizeReview(raw, "j1");
    assert.equal(r.jobId, "j1");
    assert.equal(r.status, "unknown");
    assert.deepEqual(r.allowedActions, []);
    assert.deepEqual(r.lights, { approved: [], unstable: [], rejected: [] });
    assert.equal(r.fireplace.present, false);
  }
});

test("getReview 404, 503 og 500", async () => {
  captureFetch(404, { detail: "job not found" });
  assert.deepEqual(await api.getReview({ jobId: "j1", getToken }), { kind: "not_found" });
  captureFetch(503, { detail: "decisions not available" });
  assert.deepEqual(await api.getReview({ jobId: "j1", getToken }), { kind: "unavailable" });
  captureFetch(500, {});
  assert.deepEqual(await api.getReview({ jobId: "j1", getToken }), { kind: "error", httpStatus: 500 });
});

test("parseDecisionResponse: 200, 202, 409, 422, 404 og annet", () => {
  assert.deepEqual(api.parseDecisionResponse(200, { job_id: "j1", status: "succeeded" }), {
    kind: "updated", status: "succeeded",
  });
  assert.deepEqual(api.parseDecisionResponse(202, { status: "running", status_url: "/v1/jobs/j1" }), {
    kind: "poll", status: "running",
  });
  assert.deepEqual(
    api.parseDecisionResponse(409, { detail: { code: "status_changed", status: "succeeded" } }),
    { kind: "status_changed", status: "succeeded" }
  );
  assert.deepEqual(
    api.parseDecisionResponse(409, { detail: { code: "action_not_allowed", status: "needs_review" } }),
    { kind: "blocked", code: "action_not_allowed", fields: [], overrideCode: null }
  );
  assert.deepEqual(
    api.parseDecisionResponse(422, { detail: { code: "invalid_decision", fields: ["reason"] } }),
    { kind: "blocked", code: "invalid_decision", fields: ["reason"], overrideCode: null }
  );
  // Uten detail-innpakning godtas ogsaa.
  assert.deepEqual(api.parseDecisionResponse(422, { code: "invalid_decision", fields: ["action"] }), {
    kind: "blocked", code: "invalid_decision", fields: ["action"], overrideCode: null,
  });
  assert.deepEqual(api.parseDecisionResponse(404, { detail: "job not found" }), { kind: "not_found" });
  assert.deepEqual(api.parseDecisionResponse(500, null), { kind: "error", httpStatus: 500 });
  assert.deepEqual(api.parseDecisionResponse(409, "tekst"), {
    kind: "blocked", code: null, fields: [], overrideCode: null,
  });
});

test("parseDecisionResponse for Rett (2d-2a): correction_limit, override_code og 503", () => {
  assert.deepEqual(
    api.parseDecisionResponse(409, {
      detail: { code: "correction_limit", rounds_used: 1, max_rounds: 1, rounds_left: 0 },
    }),
    { kind: "blocked", code: "correction_limit", fields: [], overrideCode: null }
  );
  assert.deepEqual(
    api.parseDecisionResponse(422, {
      detail: { code: "invalid_decision", fields: ["overrides"], override_code: "too_many_lights" },
    }),
    { kind: "blocked", code: "invalid_decision", fields: ["overrides"], overrideCode: "too_many_lights" }
  );
  assert.deepEqual(api.parseDecisionResponse(503, { detail: { code: "archive_failed" } }), {
    kind: "unavailable", code: "archive_failed",
  });
  assert.deepEqual(api.parseDecisionResponse(503, { detail: "decisions not available" }), {
    kind: "unavailable", code: null,
  });
});

test("normalizeReview leser Rett-feltene (2d-2a)", () => {
  const r = api.normalizeReview(
    {
      allowed_actions: ["approve", "reject", "correct"],
      lights: {
        approved: [
          { key: "L1", id: "L1", run: null, type: "pendant", location: "x", editable: true, state: "approved" },
          { key: "L2", id: "L2", run: null, type: "pendant", location: "y", editable: true, state: "teleported" },
        ],
        unstable: [{ key: "r2:L3", id: "L3", run: 2, type: "spotlight", editable: false, state: "promoted" }],
        rejected: [],
      },
      correction: { rounds_used: 1, rounds_left: 0, max_rounds: 1, last_round_failed: true },
      images: {
        original_url: "o", result_url: "r", raw_url: "rr",
        previous: { round: 0, result_url: "p", raw_url: "pr" },
      },
    },
    "j1"
  );
  assert.deepEqual(r.allowedActions, ["approve", "reject", "correct"]);
  assert.deepEqual(r.lights.approved[0], {
    key: "L1", id: "L1", run: null, type: "pendant", location: "x", reasonCode: null,
    editable: true, state: "approved",
  });
  assert.equal(r.lights.approved[1].state, null, "ukjent state");
  assert.equal(r.lights.unstable[0].run, 2);
  assert.equal(r.lights.unstable[0].editable, false);
  assert.deepEqual(r.correction, { roundsLeft: 0, lastRoundFailed: true });
  assert.deepEqual(r.images.previous, { round: 0, resultUrl: "p", rawUrl: "pr" });
  // Negativt eller oedelagt rundetall blir 0.
  assert.equal(api.normalizeReview({ correction: { rounds_left: -1 } }, "j1").correction.roundsLeft, 0);
  assert.equal(api.normalizeReview({ correction: { rounds_left: "1" } }, "j1").correction.roundsLeft, 0);
});

test("normalizeReview leser dusk (2f-a): true, false, null og uten feltet", () => {
  const dusk = (raw: unknown) => api.normalizeReview({ dusk: raw }, "j1").dusk;
  assert.deepEqual(dusk({ time: "late", sky: "starry", sky_applied: true }), {
    time: "late", sky: "starry", skyApplied: true,
  });
  assert.equal(dusk({ time: "late", sky: "starry", sky_applied: false })?.skyApplied, false);
  assert.equal(dusk({ time: "early", sky: "clear", sky_applied: null })?.skyApplied, null);
  // Backend foer 2f-a: ingen dusk, og ingen krasj.
  assert.equal(api.normalizeReview({}, "j1").dusk, null);
  for (const raw of [null, "late", 42, ["late"]]) assert.equal(dusk(raw), null, String(raw));
  assert.deepEqual(dusk({ time: 3, sky_applied: "yes" }), { time: null, sky: null, skyApplied: null });
});

test("postDecision sender JSON-body og tolker svaret", async () => {
  const calls = captureFetch(200, { job_id: "j1", status: "failed", code: "rejected_by_reviewer", reason: "x" });
  const r = await api.postDecision({
    jobId: "j1",
    decision: { action: "reject", reason: "x" },
    getToken,
  });
  assert.deepEqual(r, { kind: "updated", status: "failed" });
  assert.equal(calls[0].url, "http://api.test/v1/jobs/j1/decision");
  assert.equal(calls[0].init?.method, "POST");
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), { action: "reject", reason: "x" });
  const headers = calls[0].init?.headers as Record<string, string>;
  assert.equal(headers.Authorization, "Bearer tok");
  assert.equal(headers["Content-Type"], "application/json");
});

test("postDecision 401 proever en gang til med ferskt token", async () => {
  let n = 0;
  const skips: unknown[] = [];
  globalThis.fetch = (async () => {
    n += 1;
    return new Response(JSON.stringify(n === 1 ? {} : { status: "succeeded" }), {
      status: n === 1 ? 401 : 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  const r = await api.postDecision({
    jobId: "j1",
    decision: { action: "approve" },
    getToken: async (o?: { skipCache?: boolean }) => {
      skips.push(o?.skipCache);
      return "tok";
    },
  });
  assert.equal(n, 2);
  assert.deepEqual(skips, [undefined, true]);
  assert.deepEqual(r, { kind: "updated", status: "succeeded" });
});
