import { test } from "node:test";
import assert from "node:assert/strict";

// api.ts kaster ved import uten NEXT_PUBLIC_API_BASE; sett en dummy-verdi
// foer dynamisk import. Ingen nettverkskall.
process.env.NEXT_PUBLIC_API_BASE = "http://api.test";
const { normalizeReview } = await import("./api.ts");
const {
  blockedResult,
  brightnessResultUrl,
  brightnessView,
  isApproving,
  preloadUrls,
  selectedStep,
  stepName,
  visibleVariants,
} = await import("./brightness.ts");
const { compareVariants, selectedVariant } = await import("./compare.ts");
const { buildDecision } = await import("./review.ts");
const { runDecision } = await import("./decide.ts");
const { codeText, t } = await import("./i18n/index.ts");

import type { DecisionOutcome, DecisionRequest, JobReviewDetail } from "./api.ts";

/**
 * TG-NEW-147: lysstyrke med fem trinn (KONTRAKT_LYSSTYRKE). Testene gaar
 * gjennom de rene funksjonene siden bruker, fra review-svaret slik backend
 * sender det.
 */

const STEPS = [-2, -1, 0, 1, 2].map((step) => ({
  step,
  ev: 0.3 * step,
  preview_url: `https://img.test/lys${step}.jpg`,
}));

function rawReview(overrides: Record<string, unknown> = {}, brightness: unknown = undefined) {
  return {
    job_id: "j1",
    status: "awaiting_approval",
    version: 7,
    allowed_actions: ["approve", "reject", "correct"],
    images: {
      original_url: "https://img.test/orig.jpg",
      preview_url: "https://img.test/lys0.jpg",
      raw_preview_url: "https://img.test/raw.jpg",
      rounds: [
        { round: 0, current: false, preview_url: "https://img.test/r0.jpg", raw_preview_url: "https://img.test/r0raw.jpg" },
        { round: 1, current: true, preview_url: "https://img.test/lys0.jpg", raw_preview_url: "https://img.test/r1raw.jpg" },
      ],
    },
    brightness:
      brightness === undefined
        ? { available: true, method_version: "1", default_step: 0, approved_step: null, steps: STEPS }
        : brightness,
    ...overrides,
  };
}

const review = (overrides: Record<string, unknown> = {}, brightness?: unknown): JobReviewDetail =>
  normalizeReview(rawReview(overrides, brightness), "j1");

/** Det siden gjoer: variantene (admin), valgt variant og visningen. */
function pageView(r: JobReviewDetail, variantId: string | null = null, isAdmin = true) {
  const variants = visibleVariants(compareVariants(r.images, { isAdmin }), r.brightness);
  const shown = selectedVariant(variants, variantId);
  return { variants, shown, view: brightnessView(r, shown) };
}

// --- Parseren -----------------------------------------------------------------

test("TG147: review.brightness leses med trinn, default_step og lenker", () => {
  const b = review().brightness;
  assert.equal(b.available, true);
  assert.equal(b.defaultStep, 0);
  assert.equal(b.approvedStep, null);
  assert.deepEqual(
    b.steps.map((s) => [s.step, s.previewUrl]),
    STEPS.map((s) => [s.step, s.preview_url])
  );
});

test("TG147: manglende eller ugyldig brightness gir available false (siden som foer)", () => {
  for (const bad of [null, "ja", [], 42]) {
    assert.deepEqual(review({}, bad).brightness, { available: false, defaultStep: null, approvedStep: null, steps: [] });
  }
  const noField = normalizeReview({ ...rawReview(), brightness: undefined }, "j1");
  assert.equal(noField.brightness.available, false);
});

test("TG147: ugyldige trinn hoppes over, null-lenker beholdes, rekkefoelgen er -2 til 2", () => {
  const b = review({}, {
    available: true,
    default_step: 1,
    approved_step: 3,
    steps: [
      { step: 2, preview_url: "https://img.test/2.jpg" },
      { step: 0.3, preview_url: "https://img.test/x.jpg" },
      { step: "1", preview_url: "https://img.test/x.jpg" },
      { step: 3, preview_url: "https://img.test/x.jpg" },
      { step: -2, preview_url: null },
      { step: 2, preview_url: "https://img.test/dobbel.jpg" },
    ],
  }).brightness;
  assert.deepEqual(b.steps, [
    { step: -2, previewUrl: null },
    { step: 2, previewUrl: "https://img.test/2.jpg" },
  ]);
  assert.equal(b.defaultStep, 1);
  assert.equal(b.approvedStep, null, "3 er ikke et trinn");
});

// --- Navnene --------------------------------------------------------------------

test("TG147: navnene kommer fra step og ordlista, nb og en", () => {
  const names = (locale: "nb" | "en") => ([-2, -1, 0, 1, 2] as const).map((s) => stepName(locale, s));
  assert.deepEqual(names("nb"), ["Mørkere", "Mørk", "Standard", "Lys", "Ekstra lys"]);
  assert.deepEqual(names("en"), ["Darker", "Dark", "Standard", "Light", "Extra light"]);
  assert.ok(!names("nb").includes("Original"), "midttrinnet heter ikke «Original»");
  assert.equal(t("nb", "brightness.title"), "Lysstyrke");
  assert.equal(t("en", "brightness.title"), "Brightness");
  assert.equal(t("nb", "brightness.approved", { step: stepName("nb", -1) }), "Lysstyrke: Mørk");
  assert.equal(t("en", "brightness.approved", { step: stepName("en", -1) }), "Brightness: Dark");
  assert.equal(t("nb", "action.approving"), "Godkjenner …");
  assert.equal(t("en", "action.approving"), "Approving …");
  assert.equal(t("nb", "action.working"), "Sender …");
});

// --- Slideren og bildet ---------------------------------------------------------

test("TG147: starttrinnet er default_step (0 for nye jobber, 1 for gamle)", () => {
  for (const def of [0, 1]) {
    const { view } = pageView(review({}, { available: true, default_step: def, approved_step: null, steps: STEPS }));
    assert.equal(view.kind, "control");
    if (view.kind !== "control") return;
    assert.equal(selectedStep(view, null), def);
    assert.equal(selectedStep(view, -2), -2, "brukerens valg gjelder");
  }
});

test("TG147: det valgte trinnets preview_url er resultatbildet; null gir plassholder uten tilbakefall", () => {
  const r = review({}, {
    available: true,
    default_step: 0,
    approved_step: null,
    steps: [...STEPS.slice(0, 4), { step: 2, preview_url: null }],
  });
  assert.equal(brightnessResultUrl(r.brightness, -1), "https://img.test/lys-1.jpg");
  assert.equal(brightnessResultUrl(r.brightness, 1), "https://img.test/lys1.jpg");
  assert.equal(brightnessResultUrl(r.brightness, 2), null);
  // Et trinn som mangler i lista gir ogsaa plassholder, ikke images.preview_url.
  assert.equal(brightnessResultUrl({ steps: [] }, 0), null);
});

test("TG147: de andre trinnene forhaandslastes, uten null og uten det viste", () => {
  const steps = review().brightness.steps.map((s) => (s.step === 2 ? { ...s, previewUrl: null } : s));
  assert.deepEqual(preloadUrls(steps, 0), [
    "https://img.test/lys-2.jpg",
    "https://img.test/lys-1.jpg",
    "https://img.test/lys1.jpg",
  ]);
});

test("TG147: kontrollen er laast naar en eldre runde er valgt", () => {
  const r = review();
  assert.deepEqual(
    [null, "r1", "r0"].map((id) => {
      const v = pageView(r, id).view;
      return v.kind === "control" ? v.locked : v.kind;
    }),
    [false, false, true]
  );
});

test("TG147: «Rått fra modellen» skjules for admin naar lysstyrke finnes, ogsaa eldre runder", () => {
  const { variants, view } = pageView(review());
  assert.deepEqual(variants.map((v) => v.id), ["r1", "r0"]);
  assert.ok(!variants.some((v) => v.raw));
  assert.equal(view.kind, "control");
  // Gamle jobber uten rounds: «Rått» skjules ogsaa.
  const legacy = review({ images: { preview_url: "https://img.test/p.jpg", raw_preview_url: "https://img.test/raw.jpg" } });
  assert.ok(!pageView(legacy).variants.some((v) => v.raw));
});

test("TG147: available false gir siden som i dag (rått for admin, ingen kontroll)", () => {
  const off = { available: false, default_step: null, approved_step: null, steps: [] };
  const r = review({}, off);
  const { variants, view } = pageView(r);
  assert.deepEqual(variants, compareVariants(r.images, { isAdmin: true }));
  assert.deepEqual(variants.map((v) => v.id), ["r1", "r0", "r1-raw", "r0-raw"]);
  assert.deepEqual(view, { kind: "none" });
  // Megler ser ikke rått, med eller uten lysstyrke.
  assert.ok(!pageView(r, null, false).variants.some((v) => v.raw));
  // Body som foer: ingen brightness_step.
  assert.deepEqual(buildDecision("approve", "", null, r, null), { action: "approve", expected_version: 7 });
});

test("TG147: ingen kontroll uten approve (bare lesing), for andre statuser, eller uten trinn", () => {
  assert.equal(pageView(review({ allowed_actions: [], is_owner: false })).view.kind, "none");
  for (const status of ["needs_review", "running", "failed", "rejected"]) {
    assert.equal(pageView(review({ status })).view.kind, "none", status);
  }
  assert.equal(
    pageView(review({}, { available: true, default_step: 0, approved_step: null, steps: [] })).view.kind,
    "none"
  );
  assert.equal(
    pageView(review({}, { available: true, default_step: null, approved_step: null, steps: STEPS })).view.kind,
    "none"
  );
});

test("TG147: etter godkjenning vises det godkjente trinnet som tekst, ikke som slider", () => {
  const done = review(
    { status: "succeeded", allowed_actions: [] },
    { available: true, default_step: 0, approved_step: -1, steps: [{ step: -1, preview_url: "https://img.test/g.jpg" }] }
  );
  assert.deepEqual(pageView(done).view, { kind: "approved", step: -1 });
  // Godkjent foer denne PR-en: ingen tekst.
  const old = review({ status: "succeeded", allowed_actions: [] }, { available: false, steps: [] });
  assert.deepEqual(pageView(old).view, { kind: "none" });
});

// --- Godkjenningen ----------------------------------------------------------------

test("TG147: godkjenningen sender brightness_step og expected_version; andre handlinger ikke trinnet", () => {
  const r = review();
  assert.deepEqual(buildDecision("approve", "", null, r, -1), {
    action: "approve",
    expected_version: 7,
    brightness_step: -1,
  });
  assert.deepEqual(buildDecision("approve", "", null, r, 0), {
    action: "approve",
    expected_version: 7,
    brightness_step: 0,
  });
  assert.deepEqual(buildDecision("reject", "", null, r, -1), { action: "reject", expected_version: 7 });
  assert.deepEqual(buildDecision("continue", "", "yes", r, 2), {
    action: "continue",
    fireplace_fire: "yes",
    expected_version: 7,
  });
});

test("TG147: dobbeltklikk paa Godkjenn gir ett kall, og knappen viser «Godkjenner …» mens det pågår", async () => {
  const inFlight = { current: false };
  const sent: DecisionRequest[] = [];
  let pending: "approve" | null = null;
  // Alle kall som er sendt, slik at testen feiler (ikke henger) om vernet brytes.
  const releases: ((out: DecisionOutcome) => void)[] = [];
  const r = review();
  const click = () =>
    runDecision({
      inFlight,
      send: () => {
        sent.push(buildDecision("approve", "", null, r, -1));
        return new Promise<DecisionOutcome>((resolve) => releases.push(resolve));
      },
      refetch: async () => {},
      handle: () => {},
      onStart: () => (pending = "approve"),
      onError: () => {},
      onSettled: () => (pending = null),
    });
  const first = click();
  const second = click();
  assert.equal(isApproving(pending), true);
  const sentWhileBusy = sent.length;
  for (const release of releases) release({ kind: "updated", status: "succeeded" });
  assert.equal(sentWhileBusy, 1, "det andre klikket sender ingenting");
  assert.deepEqual([await first, await second], [true, false]);
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0], { action: "approve", expected_version: 7, brightness_step: -1 });
  assert.equal(isApproving(pending), false);
  assert.equal(isApproving("reject"), false);
});

test("TG147: feilkodene fra kontrakten §3 gir riktige meldinger og riktig laas", () => {
  const blocked = (code: string | null, fields: string[] = []) =>
    blockedResult({ kind: "blocked", code, fields, overrideCode: null });
  const text = (res: ReturnType<typeof blocked>) =>
    "key" in res.message ? t("nb", res.message.key) : codeText("nb", res.message.group, res.message.code);

  const invalid = blocked("invalid_decision", ["brightness_step"]);
  assert.deepEqual(invalid, { message: { key: "brightness.invalid" }, block: false, refetch: false });
  assert.equal(text(invalid), "Lysstyrken var ugyldig. Velg et trinn og prøv igjen.");

  for (const code of ["raw_missing", "raw_mismatch"]) {
    const res = blocked(code);
    assert.equal(res.block, false, code);
    assert.equal(res.refetch, false, code);
    assert.match(text(res), /Dette trinnet kan ikke lages nå/, code);
  }
  const unavailable = blocked("brightness_unavailable");
  assert.deepEqual([unavailable.block, unavailable.refetch], [false, true]);
  assert.match(text(unavailable), /Lysstyrken kan ikke velges/);

  // 503 brightness_failed gaar via «unavailable» i siden: melding, ingen laas.
  assert.match(codeText("nb", "decisionError", "brightness_failed"), /Ingenting er endret/);
  assert.match(codeText("en", "decisionError", "brightness_failed"), /Nothing was changed/);

  // Som foer: annen 422 laaser ikke, andre 409 laaser.
  assert.equal(blocked("invalid_decision", ["reason"]).block, false);
  assert.deepEqual(blocked("action_not_allowed"), {
    message: { group: "decisionError", code: "action_not_allowed" },
    block: true,
    refetch: false,
  });
  for (const code of ["brightness_unavailable", "raw_missing", "raw_mismatch", "brightness_failed"]) {
    assert.notEqual(codeText("en", "decisionError", code), codeText("en", "decisionError", "ukjent"), code);
  }
});
