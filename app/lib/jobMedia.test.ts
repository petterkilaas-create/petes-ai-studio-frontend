import { test, after } from "node:test";
import assert from "node:assert/strict";

// api.ts kaster ved import uten NEXT_PUBLIC_API_BASE; sett en dummy-verdi
// foer dynamisk import. fetch mockes; ingen nettverkskall.
process.env.NEXT_PUBLIC_API_BASE = "http://api.test";
const api = await import("./api.ts");
const { isWorking, mediaView, mergeRefresh, overlayFor, workingKey, workingView } = await import("./jobMedia.ts");
const { thumbSrc } = await import("../(app)/history/statusVariants.ts");
const { DICTIONARIES, t } = await import("./i18n/index.ts");

import type { JobSummary } from "./api.ts";

/**
 * Ventebildet (KONTRAKT_VENTEBILDE): rekkefoelgen resultat → dagsbilde →
 * plassholder, og at originalen aldri vises som resultat.
 */

const realFetch = globalThis.fetch;
after(() => {
  globalThis.fetch = realFetch;
});

const RESULT = "https://x/j_thumb_aaa.jpg";
const ORIGINAL = "https://x/j_original_thumb_bbb.jpg";

function job(overrides: Partial<JobSummary> = {}): JobSummary {
  return {
    jobId: "j",
    service: "scene_transform",
    status: "running",
    createdAt: "2026-10-02T10:00:00Z",
    thumbUrl: null,
    originalThumbUrl: ORIGINAL,
    error: null,
    code: null,
    reason: null,
    isOwner: true,
    ownerShort: null,
    ...overrides,
  };
}

/** Det kortet i Historikk gjoer. */
const cardView = (j: JobSummary) => mediaView(j, thumbSrc(j));
const nb = (key: Parameters<typeof t>[1]) => t("nb", key);

test("ventebilde: listJobs leser original_thumb_url; null, tom eller mangler gir null", async () => {
  const row = { service: "scene_transform", status: "running", created_at: null, error: null };
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify([
        { ...row, job_id: "a", thumb_url: null, original_thumb_url: ORIGINAL },
        { ...row, job_id: "b", original_thumb_url: null },
        { ...row, job_id: "c", original_thumb_url: "" },
        { ...row, job_id: "d" },
      ]),
      { status: 200, headers: { "Content-Type": "application/json" } }
    )) as typeof fetch;
  const rows = await api.listJobs({ getToken: async () => "tok" });
  assert.deepEqual(rows.map((r) => r.originalThumbUrl), [ORIGINAL, null, null, null]);
});

test("ventebilde: rekkefoelgen er thumb_url, saa original_thumb_url, saa plassholder", () => {
  assert.deepEqual(cardView(job({ status: "awaiting_approval", thumbUrl: RESULT, originalThumbUrl: null })), {
    kind: "result",
    url: RESULT,
  });
  assert.equal(cardView(job({ status: "running" })).kind, "original");
  assert.equal(cardView(job({ status: "running", originalThumbUrl: null })).kind, "placeholder");
  assert.equal(cardView(job({ status: "succeeded", thumbUrl: null, originalThumbUrl: null })).kind, "placeholder");
});

test("ventebilde: dagsbildet vises aldri naar resultatet finnes, og aldri for statuser med resultatbilde", () => {
  // Selv om backend skulle sende begge feltene: resultatet vinner.
  for (const status of ["succeeded", "awaiting_approval"] as const) {
    assert.deepEqual(cardView(job({ status, thumbUrl: RESULT })), { kind: "result", url: RESULT }, status);
    // Resultatet mangler: plassholder, aldri dagsbildet (ingen tilbakefall).
    const v = cardView(job({ status, thumbUrl: null, originalThumbUrl: ORIGINAL }));
    assert.equal(v.kind, "placeholder", status);
    assert.ok(!JSON.stringify(v).includes(ORIGINAL), status);
  }
  // Dagsbildet er aldri «result», uansett status.
  for (const status of ["queued", "running", "needs_review", "failed", "rejected", "unknown"] as const) {
    const v = cardView(job({ status, thumbUrl: RESULT }));
    assert.notEqual(v.kind === "result" ? v.url : null, ORIGINAL, status);
    if (v.kind === "result") assert.equal(v.url, RESULT);
  }
});

test("ventebilde: riktig tekst og symbol for hver status og kode", () => {
  const text = (j: JobSummary) => {
    const v = cardView(j);
    return v.kind === "result" ? null : [nb(v.overlay.key), v.overlay.working];
  };
  assert.deepEqual(text(job({ status: "queued", originalThumbUrl: null })), ["Lager kveldsbilde …", true]);
  assert.deepEqual(text(job({ status: "running" })), ["Lager kveldsbilde …", true]);
  assert.deepEqual(text(job({ status: "running", service: "privacy_blur" })), ["Skjuler ansikter og skilt …", true]);
  assert.deepEqual(text(job({ status: "running", service: "noe_nytt" })), ["Lager bildet …", true]);
  for (const code of ["fireplace_present", "fireplace_disagreement", "fireplace_answer_missing"]) {
    assert.deepEqual(text(job({ status: "needs_review", code })), ["Svar på spørsmålet om peisen", false], code);
  }
  assert.deepEqual(text(job({ status: "needs_review", code: "gate_review" })), ["Til godkjenning", false]);
  assert.deepEqual(text(job({ status: "failed", code: "rejected_by_reviewer", reason: "For mørkt" })), [
    "Avvist av deg",
    false,
  ]);
  assert.deepEqual(text(job({ status: "failed", code: "rejected_by_reviewer", isOwner: false })), [
    "Avvist av eieren",
    false,
  ]);
  assert.deepEqual(text(job({ status: "failed" })), ["Feilet", false]);
  assert.deepEqual(text(job({ status: "rejected" })), ["Avvist", false]);
  assert.deepEqual(text(job({ status: "succeeded", originalThumbUrl: null })), ["Godkjent", false]);
  assert.deepEqual(text(job({ status: "awaiting_approval", originalThumbUrl: null })), ["Til godkjenning", false]);
  // Peis-teksten bare for needs_review.
  assert.equal(overlayFor(job({ status: "failed", code: "fireplace_present" })).key, "status.failed");
});

test("ventebilde: tekstene finnes paa nb og en, og «Ingen forhåndsvisning» er borte", () => {
  for (const key of [
    "media.working.scene_transform",
    "media.working.privacy_blur",
    "media.working.generic",
    "media.fireplaceQuestion",
    "media.originalAlt",
  ] as const) {
    assert.ok(t("nb", key).length > 0 && t("en", key).length > 0, key);
  }
  assert.equal(t("nb", "media.originalAlt"), "Dagsbildet som ble lastet opp");
  assert.equal(t("en", "media.working.scene_transform"), "Creating dusk image …");
  assert.equal(t("en", "media.fireplaceQuestion"), "Answer the question about the fireplace");
  for (const locale of ["nb", "en"] as const) {
    const ui = DICTIONARIES[locale].ui;
    const values: string[] = Object.values(ui);
    assert.ok(!values.includes("Ingen forhåndsvisning") && !values.includes("No preview"), locale);
    assert.ok(!Object.hasOwn(ui, "history.noPreview"), locale);
  }
});

test("ventebilde: Express bruker plassholderen med symbolet mens jobben lages", () => {
  assert.deepEqual(workingView("scene_transform"), {
    kind: "placeholder",
    overlay: { key: "media.working.scene_transform", working: true },
  });
  assert.equal(workingKey(undefined), "media.working.generic");
  assert.equal(workingKey("toString"), "media.working.generic");
});

test("ventebilde: bare queued og running er i arbeid", () => {
  assert.deepEqual(
    ["queued", "running", "needs_review", "awaiting_approval", "succeeded", "failed", "rejected", "unknown"].map(isWorking),
    [true, true, false, false, false, false, false, false]
  );
});

test("ventebilde: automatisk henting bytter bare kort som er endret, og beholder «Last inn flere»", () => {
  const a = job({ jobId: "a", status: "running", originalThumbUrl: null });
  const b = job({ jobId: "b", status: "succeeded", thumbUrl: "https://x/b?token=1", originalThumbUrl: null });
  const c = job({ jobId: "c", status: "failed" });
  const older = job({ jobId: "z", status: "succeeded", thumbUrl: "https://x/z?token=1", originalThumbUrl: null });
  const prev = [a, b, c, older];
  // Ny foerste side (pageSize 3): a har faatt dagsbildet, b har ny signert lenke, c er borte fra filteret.
  const a2 = { ...a, originalThumbUrl: ORIGINAL };
  const b2 = { ...b, thumbUrl: "https://x/b?token=2" };
  const n = job({ jobId: "n", status: "queued", originalThumbUrl: null });
  const merged = mergeRefresh(prev, [n, a2, b2], 3);
  assert.deepEqual(merged.map((j) => j.jobId), ["n", "a", "b", "z"]);
  assert.equal(merged[1], a2, "endret kort byttes");
  assert.equal(merged[2], b, "uendret kort beholder lenken (bildet lastes ikke paa nytt)");
  assert.equal(merged[3], older, "sider fra «Last inn flere» beholdes");
  // Ingen dobbel rad naar en eldre jobb flytter inn paa foerste side.
  assert.deepEqual(mergeRefresh(prev, [older, a], 3).map((j) => j.jobId), ["z", "a"]);
});
