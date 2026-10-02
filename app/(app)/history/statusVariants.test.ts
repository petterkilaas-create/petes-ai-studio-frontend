import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canOpenReview,
  openLinkKey,
  hasResultImage,
  isRejectedByReviewer,
  serviceLabelKey,
  statusVariant,
  thumbSrc,
} from "./statusVariants.ts";
import { DICTIONARIES } from "../../lib/i18n/index.ts";

test("statusordene fra ordlista (brief §7, D1): Til godkjenning for begge ventestatusene", () => {
  for (const status of ["awaiting_approval", "needs_review"]) {
    const v = statusVariant(status);
    assert.equal(v.labelKey, "status.awaitingApproval", status);
    assert.equal(v.tone, "amber", status);
    assert.equal(DICTIONARIES.nb.ui[v.labelKey], "Til godkjenning");
  }
  assert.equal(DICTIONARIES.nb.ui[statusVariant("running").labelKey], "Lages");
  assert.equal(DICTIONARIES.nb.ui[statusVariant("queued").labelKey], "I kø");
  assert.equal(statusVariant("failed").tone, "red");
});

test("succeeded: «Godkjent» for kveldsbildet, «Ferdig» for andre tjenester (Petter 01.10)", () => {
  const nb = (status: string, service?: string) => DICTIONARIES.nb.ui[statusVariant(status, service).labelKey];
  assert.equal(nb("succeeded", "scene_transform"), "Godkjent");
  assert.equal(nb("succeeded", "privacy_blur"), "Ferdig");
  assert.equal(nb("succeeded"), "Ferdig");
  // Tjenesten endrer bare ordet for succeeded.
  assert.equal(nb("failed", "scene_transform"), "Feilet");
  assert.equal(statusVariant("succeeded", "scene_transform").tone, "green");
});

test("tjenestenavnene kommer fra ordlista (brief §7)", () => {
  assert.equal(DICTIONARIES.nb.ui[serviceLabelKey("scene_transform")!], "Kveldsbilde");
  assert.equal(DICTIONARIES.nb.ui[serviceLabelKey("privacy_blur")!], "Skjul ansikter og skilt");
  assert.equal(DICTIONARIES.nb.ui[serviceLabelKey("virtual_stage")!], "Digital styling");
  assert.equal(DICTIONARIES.en.ui[serviceLabelKey("scene_transform")!], "Dusk image");
  assert.equal(serviceLabelKey("lawn_green"), null);
  assert.equal(serviceLabelKey("toString"), null);
});

test("ukjente verdier gir standardvarianten, ingen krasj", () => {
  for (const raw of ["cancelled", "teleported", "", "__proto__", "toString"]) {
    const v = statusVariant(raw);
    assert.equal(v.labelKey, "status.unknown", raw);
    assert.equal(v.tone, "neutral", raw);
  }
});

test("thumbnail for succeeded og awaiting_approval", () => {
  assert.equal(hasResultImage("succeeded"), true);
  assert.equal(hasResultImage("awaiting_approval"), true);
  assert.equal(hasResultImage("needs_review"), false);
  assert.equal(hasResultImage("unknown"), false);
});

test("avvist av megleren kjennes paa code, ikke paa error-teksten", () => {
  assert.equal(isRejectedByReviewer({ status: "failed", code: "rejected_by_reviewer" }), true);
  assert.equal(isRejectedByReviewer({ status: "failed", code: null }), false);
  assert.equal(isRejectedByReviewer({ status: "failed", code: "needs_review" }), false);
  assert.equal(isRejectedByReviewer({ status: "succeeded", code: "rejected_by_reviewer" }), false);
});

test("Åpne godkjenning bare for awaiting_approval og needs_review", () => {
  assert.equal(canOpenReview("awaiting_approval"), true);
  assert.equal(canOpenReview("needs_review"), true);
  for (const s of ["succeeded", "failed", "running", "unknown", "rejected"]) {
    assert.equal(canOpenReview(s), false, s);
  }
});

test("openLinkKey: Åpne bare paa egne godkjente skumringsjobber, ellers som foer (merking PR 4)", () => {
  const job = (status: string, service = "scene_transform", isOwner = true) =>
    ({ status, service, isOwner }) as Parameters<typeof openLinkKey>[0];
  assert.equal(openLinkKey(job("succeeded")), "history.open");
  // Andres jobb (admin, scope=all): ingen nedlasting, derfor ingen lenke.
  assert.equal(openLinkKey(job("succeeded", "scene_transform", false)), null);
  // Andre tjenester har ingen godkjenningsside.
  assert.equal(openLinkKey(job("succeeded", "magic_cleanup")), null);
  // Som foer: Åpne godkjenning ogsaa paa andres jobber (bare lesing).
  assert.equal(openLinkKey(job("awaiting_approval")), "history.openReview");
  assert.equal(openLinkKey(job("needs_review", "scene_transform", false)), "history.openReview");
  for (const s of ["failed", "running", "queued", "rejected", "unknown"]) {
    assert.equal(openLinkKey(job(s)), null, s);
  }
});

test("/history: miniatyren kommer bare fra thumbUrl (Lekkasjen L2)", () => {
  const old = { resultUrl: "https://x/a.png", variantUrls: ["https://x/a_v1.png"] };
  assert.equal(thumbSrc({ ...old, status: "succeeded", thumbUrl: "https://x/a_thumb.jpg" }), "https://x/a_thumb.jpg");
  assert.equal(thumbSrc({ ...old, status: "awaiting_approval", thumbUrl: "https://x/a_thumb.jpg" }), "https://x/a_thumb.jpg");
  // null gir kortet uten bilde, aldri resultUrl.
  assert.equal(thumbSrc({ ...old, status: "succeeded", thumbUrl: null }), null);
  assert.equal(thumbSrc({ ...old, status: "failed", thumbUrl: "https://x/a_thumb.jpg" }), null);
});
