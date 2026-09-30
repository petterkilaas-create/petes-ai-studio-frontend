import { test, before, afterEach } from "node:test";
import assert from "node:assert/strict";

// api.ts kaster ved import uten NEXT_PUBLIC_API_BASE — sett en dummy-verdi
// foer dynamisk import. fetch mockes; ingen nettverkskall.
process.env.NEXT_PUBLIC_API_BASE = "http://api.test";
const api = await import("./api.ts");
const { buildDecision } = await import("./review.ts");
const { buildCorrection, initialToggles } = await import("./correction.ts");

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

test("200 awaiting_approval gir previewUrl, aldri result_url (L2)", async () => {
  mockFetch(200, {
    status: "awaiting_approval",
    result_url: "https://x/signed.png",
    preview_url: "https://x/j1_preview_abc.jpg",
    job_id: "j1",
  });
  const r = await api.pollJob({ jobId: "j1", getToken });
  assert.deepEqual(r, { kind: "awaiting_approval", previewUrl: "https://x/j1_preview_abc.jpg", jobId: "j1" });
});

test("200 awaiting_approval uten preview_url gir previewUrl null, ikke result_url (L2)", async () => {
  for (const body of [
    { status: "awaiting_approval", result_url: "https://x/signed.png", preview_url: null },
    { status: "awaiting_approval", result_url: "https://x/signed.png" },
    { status: "awaiting_approval" },
  ]) {
    mockFetch(200, body);
    const r = await api.pollJob({ jobId: "j1", getToken });
    assert.deepEqual(r, { kind: "awaiting_approval", previewUrl: null, jobId: "j1" });
  }
});

test("200 JSON succeeded med preview_url gir done med URL (L3-formen)", async () => {
  mockFetch(200, { status: "succeeded", preview_url: "https://x/j1_preview_abc.jpg", job_id: "j1" });
  const r = await api.pollJob({ jobId: "j1", getToken });
  assert.deepEqual(r, { kind: "done", previewUrl: "https://x/j1_preview_abc.jpg", jobId: "j1" });
  // Uten preview_url: fortsatt done, men uten bilde (plassholder).
  mockFetch(200, { status: "succeeded", result_url: "https://x/j1.png" });
  const bare = await api.pollJob({ jobId: "j1", getToken });
  assert.deepEqual(bare, { kind: "done", previewUrl: null, jobId: "j1" });
});

test("200 som ikke er JSON ved succeeded gir unknown, og bodyen leses ikke (L4)", async () => {
  for (const headers of [
    { "Content-Type": "image/png", "X-Job-ID": "j2", "X-Result-URL": "https://x/j2.png" },
    {} as Record<string, string>,
  ]) {
    const read: string[] = [];
    let res: Response | null = null;
    globalThis.fetch = (async () => {
      res = new Response(new Uint8Array([137, 80, 78, 71]), { status: 200, headers });
      for (const method of ["blob", "json", "text", "arrayBuffer"] as const) {
        const original = res[method].bind(res);
        Object.defineProperty(res, method, {
          value: () => {
            read.push(method);
            return original();
          },
        });
      }
      return res;
    }) as typeof fetch;
    const r = await api.pollJob({ jobId: "j1", getToken });
    assert.deepEqual(r, { kind: "unknown", status: null, httpStatus: 200 });
    assert.deepEqual(read, [], "res.blob (eller annen lesing) kalles ikke");
    assert.equal(res!.bodyUsed, false);
    assert.doesNotMatch(JSON.stringify(r), /j2/);
  }
});

test("submitJob: sync 200 med bytes gir blob (privacy_blur, L4 beholder den)", async () => {
  globalThis.fetch = (async () =>
    new Response(new Uint8Array([137, 80, 78, 71]), {
      status: 200,
      headers: { "Content-Type": "image/png", "X-Request-ID": "req1" },
    })) as typeof fetch;
  const r = await api.submitJob({
    service: "privacy_blur",
    image: new File([new Uint8Array([1])], "a.jpg", { type: "image/jpeg" }),
    getToken,
  });
  assert.equal(r.kind, "sync");
  if (r.kind !== "sync") return;
  assert.ok(r.imageBlob instanceof Blob);
  assert.equal(r.imageBlob.size, 4);
  assert.equal(r.requestId, "req1");
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

test("listJobs: scope=all bare for «all», og statusfilteret foelger med", async () => {
  const calls = captureFetch(200, []);
  await api.listJobs({ scope: "all", statuses: api.WAITING_FOR_ME_STATUSES, getToken });
  await api.listJobs({ scope: "mine", statuses: api.WAITING_FOR_ME_STATUSES, getToken });
  await api.listJobs({ getToken });
  const params = calls.map((c) => new URL(c.url).searchParams);
  assert.equal(params[0].get("scope"), "all");
  assert.equal(params[0].get("status"), "awaiting_approval,needs_review");
  // «Mine jobber» sender ingenting (taaler eldre backend).
  assert.equal(params[1].has("scope"), false);
  assert.equal(params[1].get("status"), "awaiting_approval,needs_review");
  assert.equal(params[2].has("scope"), false);
});

test("listJobs leser is_owner og owner_short; uten feltene er raden egen", async () => {
  const row = { service: "scene_transform", status: "succeeded", created_at: null, result_url: null, variant_urls: null, error: null };
  captureFetch(200, [
    { ...row, job_id: "a", is_owner: false, owner_short: "abc123" },
    { ...row, job_id: "b", is_owner: true, owner_short: "zzz999" },
    { ...row, job_id: "c" },
    { ...row, job_id: "d", is_owner: false, owner_short: null },
  ]);
  const rows = await api.listJobs({ scope: "all", getToken });
  assert.deepEqual(
    rows.map((r) => [r.isOwner, r.ownerShort]),
    [[false, "abc123"], [true, "zzz999"], [true, null], [false, null]]
  );
});

test("listJobs 403 og 422 kaster ListJobsError med koden", async () => {
  mockFetch(403, { detail: { code: "scope_not_allowed" } });
  await assert.rejects(api.listJobs({ scope: "all", getToken }), (err: unknown) => {
    assert.ok(err instanceof api.ListJobsError);
    assert.equal(err.httpStatus, 403);
    assert.equal(err.code, "scope_not_allowed");
    return true;
  });
  mockFetch(422, { detail: { code: "invalid_scope", allowed: ["mine", "all"] } });
  await assert.rejects(api.listJobs({ scope: "all", getToken }), (err: unknown) => {
    assert.ok(err instanceof api.ListJobsError);
    assert.equal(err.httpStatus, 422);
    assert.equal(err.code, "invalid_scope");
    return true;
  });
  // Svar uten JSON-body: kode null, ingen krasj.
  globalThis.fetch = (async () => new Response("boom", { status: 500 })) as typeof fetch;
  await assert.rejects(api.listJobs({ getToken }), (err: unknown) => {
    assert.ok(err instanceof api.ListJobsError);
    assert.equal(err.code, null);
    return true;
  });
});

test("parseCapabilities: bare view_all === true gir viewAll", () => {
  assert.deepEqual(api.parseCapabilities({ capabilities: { view_all: true, future: 1 } }), { viewAll: true });
  for (const raw of [
    { capabilities: { view_all: false } },
    { capabilities: { view_all: "true" } },
    { capabilities: {} },
    { user_id: "u" },
    null,
    "x",
  ]) {
    assert.deepEqual(api.parseCapabilities(raw), { viewAll: false }, JSON.stringify(raw));
  }
});

test("getCapabilities kaller /me, og feil gir viewAll false", async () => {
  const calls = captureFetch(200, { user_id: "u", capabilities: { view_all: true } });
  assert.deepEqual(await api.getCapabilities({ getToken }), { viewAll: true });
  assert.equal(new URL(calls[0].url).pathname, "/me");
  mockFetch(500, { detail: "x" });
  assert.deepEqual(await api.getCapabilities({ getToken }), { viewAll: false });
  globalThis.fetch = (async () => {
    throw new Error("nett");
  }) as typeof fetch;
  assert.deepEqual(await api.getCapabilities({ getToken }), { viewAll: false });
});

test("normalizeReview: is_owner false gir bare lesing; mangler feltet, er jobben egen", () => {
  assert.equal(api.normalizeReview({ is_owner: false }, "j").isOwner, false);
  assert.equal(api.normalizeReview({ is_owner: true }, "j").isOwner, true);
  assert.equal(api.normalizeReview({}, "j").isOwner, true);
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
    assert.equal(r.version, null);
  }
});

// ---- TG-NEW-130: version fra review, expected_version i decision ---------

test("normalizeReview: version er et heltall >= 0, ellers null", () => {
  assert.equal(api.normalizeReview({ ...REVIEW_BODY, version: 1 }, "j1").version, 1);
  assert.equal(api.normalizeReview({ ...REVIEW_BODY, version: 0 }, "j1").version, 0);
  assert.equal(api.normalizeReview(REVIEW_BODY, "j1").version, null);
  for (const bad of ["0", -1, 1.5, true, null, Number.NaN]) {
    assert.equal(api.normalizeReview({ ...REVIEW_BODY, version: bad }, "j1").version, null, String(bad));
  }
});

/** Henter review, sender alle fire handlingene og gir body-ene slik fetch fikk dem. */
async function sentBodies(reviewBody: unknown): Promise<Record<string, unknown>[]> {
  captureFetch(200, reviewBody);
  const r = await api.getReview({ jobId: "j1", getToken });
  assert.equal(r.kind, "ok");
  if (r.kind !== "ok") return [];
  const review = r.review;
  const calls = captureFetch(200, { job_id: "j1", status: "succeeded" });
  const decisions = [
    buildDecision("approve", "", null, review),
    buildDecision("reject", "Feil vindu", null, review),
    buildDecision("continue", "", "yes", review),
    buildCorrection(review, initialToggles(review.lights), false, null),
  ];
  for (const decision of decisions) await api.postDecision({ jobId: "j1", decision, getToken });
  return calls.map((c) => JSON.parse(String(c.init?.body)));
}

test("alle fire handlingene sender expected_version lik review.version", async () => {
  for (const version of [7, 0]) {
    const bodies = await sentBodies({ ...REVIEW_BODY, version });
    assert.deepEqual(bodies.map((b) => b.action), ["approve", "reject", "continue", "correct"]);
    for (const body of bodies) assert.equal(body.expected_version, version, String(body.action));
  }
});

test("uten version i review sendes ikke expected_version, og ingenting krasjer", async () => {
  const bodies = await sentBodies(REVIEW_BODY);
  assert.equal(bodies.length, 4);
  for (const body of bodies) assert.equal("expected_version" in body, false, String(body.action));
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
  assert.deepEqual(r.images.previous, { round: 0, previewUrl: null });
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

// ---- Merking PR 2: disclosure fra review --------------------------------

test("normalizeReview beholder disclosure med alle felt, og taaler at den mangler", () => {
  const disclosure = {
    version: "1",
    base: "evening_from_day",
    time: "late",
    scope: "interior",
    edited: ["interior_lamps", "candles", "fireplace_fire"],
    source: "recorded",
    status: "ok",
  };
  assert.deepEqual(api.normalizeReview({ ...REVIEW_BODY, disclosure }, "j1").disclosure, disclosure);
  assert.equal(api.normalizeReview(REVIEW_BODY, "j1").disclosure, null);
  assert.equal(api.normalizeReview({ ...REVIEW_BODY, disclosure: null }, "j1").disclosure, null);
  assert.deepEqual(api.normalizeReview({ disclosure: { edited: [] } }, "j1").disclosure, {
    version: null, base: null, time: null, scope: null, edited: [], source: null, status: null,
  });
});

test("normalizeReview: ugyldig edited blir null, aldri filtrert", () => {
  for (const edited of [["sky", 3], "sky", null, undefined, [null]]) {
    const r = api.normalizeReview({ disclosure: { base: "evening_from_day", edited, status: "ok" } }, "j1");
    assert.equal(r.disclosure?.edited, null, JSON.stringify(edited));
  }
});

// ---- Lekkasjen L2: merkede forhaandsvisninger og miniatyrer ----------------

test("normalizeReview leser preview_url, raw_preview_url og previous.preview_url", () => {
  const r = api.normalizeReview(
    {
      images: {
        original_url: "o", result_url: "r", raw_url: "rr",
        preview_url: "p.jpg", raw_preview_url: "rp.jpg",
        previous: { round: 0, result_url: "pr", raw_url: "prr", preview_url: "pp.jpg" },
      },
    },
    "j1"
  );
  assert.equal(r.images.previewUrl, "p.jpg");
  assert.equal(r.images.rawPreviewUrl, "rp.jpg");
  assert.equal(r.images.previous?.previewUrl, "pp.jpg");
});

test("normalizeReview: de gamle feltene ignoreres, objektet har bare de nye (L4)", () => {
  const r = api.normalizeReview(
    {
      images: {
        original_url: "o", result_url: "r", raw_url: "rr",
        preview_url: "p.jpg", raw_preview_url: null,
        previous: { round: 1, result_url: "pr", raw_url: "prr", preview_url: "pp.jpg" },
      },
    },
    "j1"
  );
  assert.deepEqual(r.images, {
    originalUrl: "o",
    previous: { round: 1, previewUrl: "pp.jpg" },
    previewUrl: "p.jpg",
    rawPreviewUrl: null,
  });
  assert.doesNotMatch(JSON.stringify(r), /resultUrl|rawUrl|"r"|"rr"|"pr"|"prr"/);
});

test("listJobs: de gamle feltene ignoreres, raden har dem ikke (L4)", async () => {
  mockFetch(200, [
    {
      job_id: "a", service: "scene_transform", status: "succeeded", created_at: null, error: null,
      result_url: "https://x/a.png", variant_urls: ["https://x/a_v1.png"], variant_count: 1,
      thumb_url: "https://x/a_thumb_abc.jpg",
    },
  ]);
  const [row] = await api.listJobs({ getToken });
  assert.equal(row.thumbUrl, "https://x/a_thumb_abc.jpg");
  for (const key of ["resultUrl", "variantUrls", "variantCount", "result_url", "variant_urls", "variant_count"]) {
    assert.equal(key in row, false, key);
  }
  assert.doesNotMatch(JSON.stringify(row), /\.png/);
});

test("normalizeReview: nye felt som er null, tomme eller mangler, blir null", () => {
  for (const images of [
    { result_url: "r", raw_url: "rr", preview_url: null, raw_preview_url: null, previous: { round: 0, result_url: "pr", preview_url: null } },
    { result_url: "r", raw_url: "rr", preview_url: "", raw_preview_url: 3, previous: { round: 0, result_url: "pr" } },
    { result_url: "r", raw_url: "rr", previous: { round: 0, result_url: "pr" } },
  ]) {
    const r = api.normalizeReview({ images }, "j1");
    assert.equal(r.images.previewUrl, null);
    assert.equal(r.images.rawPreviewUrl, null);
    assert.equal(r.images.previous?.previewUrl, null);
  }
});

test("listJobs leser thumb_url; null eller mangler gir thumbUrl null", async () => {
  const row = { service: "scene_transform", status: "succeeded", created_at: null, result_url: "https://x/a.png", variant_urls: ["https://x/a_v1.png"], error: null };
  mockFetch(200, [
    { ...row, job_id: "a", thumb_url: "https://x/a_thumb_abc.jpg" },
    { ...row, job_id: "b", thumb_url: null },
    { ...row, job_id: "c" },
  ]);
  const rows = await api.listJobs({ getToken });
  assert.deepEqual(rows.map((r) => r.thumbUrl), ["https://x/a_thumb_abc.jpg", null, null]);
});
