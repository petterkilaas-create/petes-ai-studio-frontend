import { test } from "node:test";
import assert from "node:assert/strict";
import { stripLabel, variantLabel, type CompareVariant } from "./compare.ts";
import { givenByStyle } from "./dusk.ts";
import type { RoundChoices } from "./api";

// Stripa (Dag 58): etiketten viser stilen og det som skiller versjonene, uten
// gjentakelser. Tidspunkt og himmel staar bare naar stilen ikke gir dem.

const ADMIN = { choices: true, presetId: "skumring" };
const BROKER = { choices: false, presetId: "skumring" };

function variant(choices: Partial<RoundChoices>, current = true, round = 1): CompareVariant {
  return {
    id: `r${round}`,
    source: { kind: "round", url: `p${round}.jpg` },
    round,
    current,
    raw: false,
    choices: { time: "early", sky: "light_clouds", skyApplied: true, fireplaceFire: null, lightsChanged: false, ...choices },
  };
}

const entry = (v: CompareVariant) => ({ id: v.id, kind: "variant" as const, variant: v, url: null });

test("Dag 58: Varm skumring viser ikke tidlig og varm skumring igjen (eksempelet fra oppdraget)", () => {
  const v = variant({ style: "warm_dusk_v3", sky: "warm_dusk", lightsChanged: true });
  assert.equal(stripLabel("nb", entry(v), ADMIN), "Versjon 2 · nå (Varm skumring, lys justert)");
  assert.equal(stripLabel("en", entry(v), ADMIN), "Version 2 · now (Warm dusk, lights adjusted)");
  // Den eneste himmelen kortet har, er ogsaa gitt av stilen.
  assert.equal(stripLabel("nb", entry(variant({ style: "warm_dusk_v3" })), ADMIN), "Versjon 2 · nå (Varm skumring)");
});

test("Dag 58: Lys sommerkveld viser bare stilen", () => {
  for (const choices of [
    { style: "summer_night_v1", sky: "summer_night" },
    { style: "summer_night_v1", time: "summer_night", sky: "summer_night" },
    { style: "summer_night_v1" },
  ]) {
    assert.equal(stripLabel("nb", entry(variant(choices)), ADMIN), "Versjon 2 · nå (Lys sommerkveld)", JSON.stringify(choices));
  }
});

test("Dag 58: himmelvalget i Blå time og Sen kveld skiller versjonene og blir staaende", () => {
  assert.equal(stripLabel("nb", entry(variant({ style: "nordic_blue_hour_v2" })), ADMIN), "Versjon 2 · nå (Blå time, lette skyer)");
  assert.equal(
    stripLabel("nb", entry(variant({ style: "nordic_blue_hour_v2", sky: "pink_clouds" }, false, 0)), ADMIN),
    "Versjon 1 (Blå time, rosa skyer)"
  );
  assert.equal(stripLabel("nb", entry(variant({ style: "late_evening_v1", time: "late", sky: "dark" })), ADMIN), "Versjon 2 · nå (Sen kveld, mørk kveldshimmel)");
  assert.equal(stripLabel("nb", entry(variant({ style: "late_evening_v1", time: "late", sky: "starry" })), ADMIN), "Versjon 2 · nå (Sen kveld, stjernehimmel)");
});

test("Dag 58: tidspunkt som ikke passer stilen, og «uten himmel», staar fortsatt", () => {
  // Sen kveld med tidlig tid (skal ikke skje, men da vises det).
  assert.equal(stripLabel("nb", entry(variant({ style: "late_evening_v1", time: "early", sky: "dark" })), ADMIN), "Versjon 2 · nå (Sen kveld, tidlig, mørk kveldshimmel)");
  assert.equal(stripLabel("nb", entry(variant({ style: "warm_dusk_v3", skyApplied: false })), ADMIN), "Versjon 2 · nå (Varm skumring, uten himmel)");
  assert.equal(
    stripLabel("nb", entry(variant({ style: "warm_dusk_v3", sky: "warm_dusk", fireplaceFire: "yes" })), ADMIN),
    "Versjon 2 · nå (Varm skumring, peis tent)"
  );
});

test("Dag 58: de gamle stilene (v1, v2) gir tidspunktet; v1 + sen er Sen kveld", () => {
  assert.equal(stripLabel("nb", entry(variant({ style: "nordic_blue_hour_v1" })), ADMIN), "Versjon 2 · nå (Blå time, lette skyer)");
  assert.equal(stripLabel("nb", entry(variant({ style: "nordic_blue_hour_v1", time: "late", sky: "dark" })), ADMIN), "Versjon 2 · nå (Sen kveld, mørk kveldshimmel)");
  assert.equal(stripLabel("nb", entry(variant({ style: "warm_dusk_v2", sky: "warm_dusk" })), ADMIN), "Versjon 2 · nå (Varm skumring)");
});

test("Dag 58: uten stil i runden og for megleren er etiketten som foer", () => {
  assert.equal(stripLabel("nb", entry(variant({})), ADMIN), "Versjon 2 · nå (tidlig, lette skyer)");
  assert.equal(stripLabel("nb", entry(variant({ sky: "warm_dusk" })), ADMIN), "Versjon 2 · nå (tidlig, varm skumring)");
  assert.equal(stripLabel("nb", entry(variant({ style: "warm_dusk_v3", sky: "warm_dusk", lightsChanged: true })), BROKER), "Versjon 2 · nå (Varm skumring)");
  // Lysboksen og velgeren bruker samme etikett.
  const v = variant({ style: "warm_dusk_v3", sky: "warm_dusk" });
  assert.equal(variantLabel("nb", v, ADMIN), stripLabel("nb", entry(v), ADMIN));
});

test("Dag 58: givenByStyle", () => {
  assert.equal(givenByStyle("warm_dusk_v3", "early").time, true);
  assert.equal(givenByStyle("late_evening_v1", "early").time, false);
  assert.equal(givenByStyle("ukjent", "early").time, false);
  assert.equal(givenByStyle("warm_dusk_v3", null).time, false);
  assert.equal(givenByStyle("warm_dusk_v3", "early").sky("warm_dusk"), true);
  assert.equal(givenByStyle("warm_dusk_v3", "early").sky("light_clouds"), true);
  assert.equal(givenByStyle("warm_dusk_v3", "early").sky("clear"), false);
  assert.equal(givenByStyle("nordic_blue_hour_v2", "early").sky("light_clouds"), false);
  assert.equal(givenByStyle("late_evening_v1", "late").sky("dark"), false);
  assert.equal(givenByStyle("warm_dusk_v3", "early").sky(null), false);
});
