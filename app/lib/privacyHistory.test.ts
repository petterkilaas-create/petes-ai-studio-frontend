import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// api.ts kaster ved import uten NEXT_PUBLIC_API_BASE; sett en dummy-verdi
// foer dynamisk import. fetch mockes; ingen nettverkskall.
process.env.NEXT_PUBLIC_API_BASE = "http://api.test";
const api = await import("./api.ts");
const { openLinkKey } = await import("./statusVariants.ts");

/**
 * Dag 51, personvern i Historikk (PR 2): «Last ned» paa personvern-kortet
 * henter fra /privacy-download, aldri fra /download med merking. Kortet er
 * det samme i Historikk og paa /start (valg F1).
 */

const realFetch = globalThis.fetch;
after(() => {
  globalThis.fetch = realFetch;
});

const APP_DIR = fileURLToPath(new URL("..", import.meta.url));
const read = (rel: string) => readFileSync(join(APP_DIR, rel), "utf8");

test("personvern-kortet: hentingen kaller privacy-download med token, aldri /download", async () => {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), {
      status: 200,
      headers: { "Content-Type": "image/png" },
    });
  }) as typeof fetch;
  const res = await api.fetchPrivacyDownload({ jobId: "j 1/x", getToken: async () => "tok" });
  assert.equal(res.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://api.test/v1/jobs/j%201%2Fx/privacy-download");
  assert.doesNotMatch(calls[0].url, /\/download$/);
  assert.equal(calls[0].init?.method, "GET");
  assert.equal(new Headers(calls[0].init?.headers).get("Authorization"), "Bearer tok");
});

test("personvern-kortet: knappen bruker fetchPrivacyDownload og downloadPrivacyImage, ikke den merkede", () => {
  const button = read("components/PrivacyDownloadButton.tsx");
  assert.match(button, /fetchFile: \(\) => fetchPrivacyDownload\(\{ jobId, getToken \}\)/);
  assert.match(button, /downloadPrivacyImage\(/);
  assert.match(button, /if \(inFlight\.current\) return;/);
  assert.match(button, /"express\.download"/);
  assert.doesNotMatch(button, /fetchJobDownload|downloadMarkedImage/);
});

test("personvern-kortet: JobCard viser knappen bare via canDownloadPrivacy(job)", () => {
  const card = read("components/JobCard.tsx");
  assert.match(card, /\{canDownloadPrivacy\(job\) && \(/);
  assert.match(card, /<PrivacyDownloadButton jobId=\{job\.jobId\} locale=\{locale\} \/>/);
  assert.equal((card.match(/<PrivacyDownloadButton\b/g) ?? []).length, 1);
});

test("personvern-kortet: «Åpne» er fortsatt borte for privacy_blur", () => {
  for (const isOwner of [true, false]) {
    assert.equal(openLinkKey({ status: "succeeded", service: "privacy_blur", isOwner }), null);
  }
  // Kveldsbildet er uendret.
  assert.equal(openLinkKey({ status: "succeeded", service: "scene_transform", isOwner: true }), "history.open");
});
