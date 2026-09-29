import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canDownload,
  downloadErrorKey,
  downloadFileName,
  downloadMarkedImage,
} from "./download.ts";

const JOB = "250dccaf-1234-4abc-9def-000000000000";

function jpeg(): Response {
  return new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), {
    status: 200,
    headers: { "Content-Type": "image/jpeg" },
  });
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("filnavnet: de 8 foerste tegnene i jobId og .jpg", () => {
  assert.equal(downloadFileName(JOB), "kveldsbilde-ai_250dccaf.jpg");
  assert.equal(downloadFileName("ABC/../def-12345"), "kveldsbilde-ai_abcdef12.jpg");
  assert.equal(downloadFileName(""), "kveldsbilde-ai.jpg");
});

test("knappen vises bare for succeeded og is_owner true", () => {
  assert.equal(canDownload({ status: "succeeded", isOwner: true }), true);
  assert.equal(canDownload({ status: "succeeded", isOwner: false }), false);
  for (const status of ["awaiting_approval", "needs_review", "failed", "running", "unknown"]) {
    assert.equal(canDownload({ status, isOwner: true }), false, status);
  }
});

test("200 gir fila med riktig filnavn", async () => {
  const saved: { size: number; type: string; name: string }[] = [];
  const result = await downloadMarkedImage({
    jobId: JOB,
    fetchFile: async () => jpeg(),
    save: (blob, name) => saved.push({ size: blob.size, type: blob.type, name }),
  });
  assert.deepEqual(result, { kind: "ok", fileName: "kveldsbilde-ai_250dccaf.jpg" });
  assert.deepEqual(saved, [{ size: 4, type: "image/jpeg", name: "kveldsbilde-ai_250dccaf.jpg" }]);
});

test("feilkodene gir riktig melding, aldri raa tekst, og ingen fil", async () => {
  const cases: [number, unknown, string][] = [
    [409, { detail: { code: "action_not_allowed", status: "succeeded" } }, "review.downloadNotAllowed"],
    [409, { detail: { code: "not_approved", status: "awaiting_approval" } }, "review.downloadFailed"],
    [409, { detail: { code: "result_missing" } }, "review.downloadBroken"],
    [409, { detail: { code: "result_mismatch" } }, "review.downloadBroken"],
    [500, { detail: { code: "render_failed" } }, "review.downloadBroken"],
    [404, { detail: "job not found" }, "review.downloadFailed"],
    [401, { detail: "Missing bearer token" }, "review.downloadFailed"],
    [503, { detail: "decisions not available" }, "review.downloadFailed"],
    [502, "<html>Bad gateway</html>", "review.downloadFailed"],
  ];
  for (const [status, body, key] of cases) {
    let saved = false;
    const result = await downloadMarkedImage({
      jobId: JOB,
      fetchFile: async () => json(status, body),
      save: () => {
        saved = true;
      },
    });
    assert.deepEqual(result, { kind: "error", key }, `${status} ${JSON.stringify(body)}`);
    assert.equal(saved, false);
  }
  // Svar som ikke er JSON.
  assert.equal(downloadErrorKey(500, null), "review.downloadFailed");
});

test("nettverksfeil og manglende token gir downloadFailed", async () => {
  for (const err of [new TypeError("Failed to fetch"), new Error("Not authenticated: Clerk token unavailable")]) {
    const result = await downloadMarkedImage({
      jobId: JOB,
      fetchFile: async () => {
        throw err;
      },
      save: () => assert.fail("skal ikke lagre"),
    });
    assert.deepEqual(result, { kind: "error", key: "review.downloadFailed" });
  }
});
