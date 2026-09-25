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
