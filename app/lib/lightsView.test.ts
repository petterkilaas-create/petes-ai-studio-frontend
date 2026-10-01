import { test } from "node:test";
import assert from "node:assert/strict";
import { flatLights, litLights } from "./lightsView.ts";
import { buildCorrection, initialToggles, isOn, setToggle, type Lights } from "./correction.ts";
import type { LightState, ReviewLight } from "./api.ts";

/** Lysene slik megleren ser dem (D2b, avvik 3 A). Body bygges uendret av buildCorrection. */

function light(key: string, id: string, run: number | null, state: LightState): ReviewLight {
  return { key, id, run, type: "spotlight", location: null, reasonCode: "not_confirmed", editable: true, state };
}

function lights(): Lights {
  return {
    approved: [light("L1", "L1", null, "approved"), light("L2", "L2", null, "disabled")],
    unstable: [light("r2:L3", "L3", 2, "candidate")],
    rejected: [light("r1:L4", "L4", 1, "promoted"), light("r1:L5", "L5", 1, "candidate")],
  };
}

test("flat liste: godkjente foerst, saa ustabile og avviste, i rekkefoelgen fra backend", () => {
  assert.deepEqual(
    flatLights(lights()).map((f) => f.light.key),
    ["L1", "L2", "r2:L3", "r1:L4", "r1:L5"]
  );
});

test("«Usikker» bare paa ustabile og avviste", () => {
  assert.deepEqual(
    flatLights(lights()).map((f) => f.uncertain),
    [false, false, true, true, true]
  );
});

test("usikre lys starter som av; et lys slaatt paa i forrige runde staar paa", () => {
  const l = lights();
  const t = initialToggles(l);
  assert.deepEqual(
    flatLights(l).map((f) => isOn(f.light, t)),
    [true, false, false, true, false]
  );
});

test("body fra den flate lista er den samme som fra de tre listene", () => {
  const l = lights();
  // Slik siden gjorde foer D2b: kandidat-flagget fra lista lyset sto i.
  let before = initialToggles(l);
  before = setToggle(before, l.unstable[0], true, true);
  before = setToggle(before, l.approved[0], false, false);
  // Slik CorrectionPanel gjoer naa: uncertain fra den flate lista.
  let after = initialToggles(l);
  for (const { light: x, uncertain } of flatLights(l)) {
    if (x.key === "r2:L3") after = setToggle(after, x, uncertain, true);
    if (x.key === "L1") after = setToggle(after, x, uncertain, false);
  }
  assert.deepEqual(after, before);
  const body = buildCorrection({ lights: l, version: 3 }, after, false, null);
  assert.deepEqual(body, {
    action: "correct",
    overrides: { promote: [{ run: 2, id: "L3" }, { run: 1, id: "L4" }], disable: ["L1", "L2"], add: [] },
    expected_version: 3,
  });
});

test("sidepanelet viser lysene som er tent i gjeldende bilde", () => {
  assert.deepEqual(
    litLights(lights()).map((x) => x.key),
    ["L1", "r1:L4"]
  );
  assert.deepEqual(litLights({ approved: [], unstable: [], rejected: [] }), []);
});
