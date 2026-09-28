import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildCorrection,
  buildOverrides,
  canSubmitCorrection,
  canToggle,
  correctionControls,
  correctionResult,
  initialToggles,
  needsConfirmation,
  setToggle,
  type Lights,
} from "./correction.ts";
import type { LightState, ReviewLight } from "./api.ts";

function light(
  key: string,
  id: string,
  run: number | null,
  state: LightState,
  editable = true
): ReviewLight {
  return { key, id, run, type: "spotlight", location: null, reasonCode: null, editable, state };
}

// B08-lignende: to godkjente, én ustabil og én avvist spot (id-ene er eksempler).
function lights(): Lights {
  return {
    approved: [light("L1", "L1", null, "approved"), light("L2", "L2", null, "approved")],
    unstable: [light("r2:L3", "L3", 2, "candidate")],
    rejected: [light("r1:L4", "L4", 1, "candidate")],
  };
}

test("startverdier fra state: paa for approved/promoted, av for disabled/candidate", () => {
  const l: Lights = {
    approved: [light("L1", "L1", null, "approved"), light("L2", "L2", null, "disabled")],
    unstable: [light("r2:L3", "L3", 2, "promoted")],
    rejected: [light("r1:L4", "L4", 1, "candidate")],
  };
  assert.deepEqual(initialToggles(l), { L1: true, L2: false, "r2:L3": true, "r1:L4": false });
});

test("body: ingen endring gir tomme lister (V-3, nytt forsoek)", () => {
  const l = lights();
  assert.deepEqual(buildCorrection(l, initialToggles(l), false, null), {
    action: "correct",
    overrides: { promote: [], disable: [], add: [] },
  });
});

test("body: to kandidater slaas paa (B08)", () => {
  const l = lights();
  let t = initialToggles(l);
  t = setToggle(t, l.unstable[0], true, true);
  t = setToggle(t, l.rejected[0], true, true);
  assert.deepEqual(buildCorrection(l, t, false, null), {
    action: "correct",
    overrides: { promote: [{ run: 2, id: "L3" }, { run: 1, id: "L4" }], disable: [], add: [] },
  });
});

test("body: en godkjent slaas av", () => {
  const l = lights();
  const t = setToggle(initialToggles(l), l.approved[1], false, false);
  assert.deepEqual(buildOverrides(l, t), { promote: [], disable: ["L2"], add: [] });
});

test("body: begge deler, og peissvar bare naar spoersmaalet vises", () => {
  const l = lights();
  let t = initialToggles(l);
  t = setToggle(t, l.approved[0], false, false);
  t = setToggle(t, l.rejected[0], true, true);
  const expected = { promote: [{ run: 1, id: "L4" }], disable: ["L1"], add: [] };
  assert.deepEqual(buildCorrection(l, t, true, "no"), {
    action: "correct", overrides: expected, fireplace_fire: "no",
  });
  assert.deepEqual(buildCorrection(l, t, false, "no"), { action: "correct", overrides: expected });
});

test("body: hele avviket fra analysen sendes, ogsaa fra forrige runde", () => {
  const l: Lights = {
    approved: [light("L1", "L1", null, "disabled")],
    unstable: [light("r2:L3", "L3", 2, "promoted")],
    rejected: [],
  };
  assert.deepEqual(buildOverrides(l, initialToggles(l)), {
    promote: [{ run: 2, id: "L3" }], disable: ["L1"], add: [],
  });
});

test("body bygges fra run og id, aldri fra key", () => {
  const l: Lights = { approved: [], unstable: [light("hva-som-helst", "L7", 1, "candidate")], rejected: [] };
  const t = setToggle(initialToggles(l), l.unstable[0], true, true);
  assert.deepEqual(buildOverrides(l, t).promote, [{ run: 1, id: "L7" }]);
});

test("editable: false kan ikke endres og kommer aldri i body", () => {
  const l: Lights = {
    approved: [light("L1", "L1", null, "approved", false)],
    unstable: [light("r2:L3", "L3", 2, "candidate", false)],
    rejected: [],
  };
  const t0 = initialToggles(l);
  assert.equal(canToggle(l.approved[0], false), false);
  assert.equal(setToggle(t0, l.approved[0], false, false), t0);
  assert.equal(setToggle(t0, l.unstable[0], true, true), t0);
  // Selv en endret tilstand i UI gir ingen overstyring.
  assert.deepEqual(buildOverrides(l, { L1: false, "r2:L3": true }), { promote: [], disable: [], add: [] });
});

test("kandidat uten gyldig run eller uten key/id er laast", () => {
  assert.equal(canToggle(light("r3:L1", "L1", 3, "candidate"), true), false);
  assert.equal(canToggle(light("rx:L1", "L1", null, "candidate"), true), false);
  assert.equal(canToggle({ ...light("L1", "L1", null, "approved"), key: null }, false), false);
  assert.equal(canToggle({ ...light("L1", "L1", null, "approved"), id: null }, false), false);
  assert.equal(canToggle(light("L1", "L1", null, "approved"), false), true);
});

test("bekreftelse kreves bare naar en kandidat er slaatt paa", () => {
  const l = lights();
  const t0 = initialToggles(l);
  assert.equal(needsConfirmation(buildOverrides(l, t0)), false);
  const off = setToggle(t0, l.approved[0], false, false);
  assert.equal(needsConfirmation(buildOverrides(l, off)), false);
  const on = setToggle(t0, l.unstable[0], true, true);
  assert.equal(needsConfirmation(buildOverrides(l, on)), true);

  const overrides = buildOverrides(l, on);
  const base = { overrides, fireplaceShown: false, answer: null };
  assert.equal(canSubmitCorrection({ ...base, confirmed: false }), false);
  assert.equal(canSubmitCorrection({ ...base, confirmed: true }), true);
  assert.equal(
    canSubmitCorrection({ overrides: buildOverrides(l, off), confirmed: false, fireplaceShown: false, answer: null }),
    true
  );
});

test("peis vist uten svar hindrer innsending", () => {
  const overrides = { promote: [], disable: [], add: [] };
  assert.equal(canSubmitCorrection({ overrides, confirmed: false, fireplaceShown: true, answer: null }), false);
  assert.equal(canSubmitCorrection({ overrides, confirmed: false, fireplaceShown: true, answer: "yes" }), true);
});

test("Rett vises bare med correct og runder igjen fra backend", () => {
  const correction = { roundsLeft: 1, lastRoundFailed: false };
  assert.deepEqual(correctionControls({ allowedActions: ["approve", "reject", "correct"], correction }), {
    show: true, roundsLeft: 1, roundFailed: false,
  });
  assert.equal(correctionControls({ allowedActions: ["approve", "reject"], correction }).show, false);
  assert.equal(
    correctionControls({ allowedActions: ["correct"], correction: { roundsLeft: 0, lastRoundFailed: false } }).show,
    false
  );
  assert.equal(
    correctionControls({ allowedActions: ["correct"], correction: { roundsLeft: 1, lastRoundFailed: true } })
      .roundFailed,
    true
  );
});

test("tolkning av svarene paa «Lag nytt bilde»", () => {
  const blocked = (code: string | null, overrideCode: string | null = null) =>
    correctionResult({ kind: "blocked", code, fields: [], overrideCode });

  assert.deepEqual(correctionResult({ kind: "poll", status: "running" }), { kind: "poll" });
  assert.deepEqual(correctionResult({ kind: "status_changed", status: "succeeded" }), {
    kind: "reload", message: { group: "decisionError", code: "status_changed" },
  });
  assert.deepEqual(blocked("correction_limit"), {
    kind: "limit", message: { group: "decisionError", code: "correction_limit" },
  });
  // Petter 28.09: original_missing laaser knappene, et nytt forsoek hjelper ikke.
  assert.deepEqual(blocked("original_missing"), {
    kind: "blocked", message: { group: "decisionError", code: "original_missing" },
  });
  assert.deepEqual(blocked("action_not_allowed"), {
    kind: "blocked", message: { group: "decisionError", code: "action_not_allowed" },
  });
  // 422 og 503 lar valgene staa.
  assert.deepEqual(blocked("invalid_decision"), {
    kind: "retry", message: { group: "decisionError", code: "invalid_decision" },
  });
  assert.deepEqual(blocked("invalid_decision", "too_many_lights"), {
    kind: "retry", message: { group: "overrideCode", code: "too_many_lights" },
  });
  assert.deepEqual(correctionResult({ kind: "unavailable", code: "archive_failed" }), {
    kind: "retry", message: { group: "decisionError", code: "archive_failed" },
  });
  assert.deepEqual(correctionResult({ kind: "unavailable", code: null }), {
    kind: "retry", message: { group: "decisionError", code: null },
  });
  assert.deepEqual(correctionResult({ kind: "error", httpStatus: 500 }), {
    kind: "retry", message: { group: "decisionError", code: null },
  });
  assert.deepEqual(correctionResult({ kind: "not_found" }), { kind: "not_found" });
});
