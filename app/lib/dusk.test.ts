import { test } from "node:test";
import assert from "node:assert/strict";
import {
  changeSky,
  DEFAULT_DUSK,
  DUSK_CARDS,
  DUSK_STYLES,
  duskFacts,
  duskParams,
  isValidChoice,
  type DuskChoice,
  type ReviewDusk,
} from "./dusk.ts";
import { codeText, DICTIONARIES, t } from "./i18n/index.ts";

// Stilkortene (Dag 55) erstattet tidspunkt-knappene: tiden foelger kortet.
// Kontrakten per kort testes i stilkort.test.ts.

test("et ugyldig valg kan ikke velges eller bygges", () => {
  assert.equal(isValidChoice("late_evening_v1", "pink_clouds"), false);
  assert.equal(isValidChoice("nordic_blue_hour_v2", "dark"), false);
  assert.equal(isValidChoice("nordic_blue_hour_v2", "starry"), false);
  assert.equal(isValidChoice("nordic_blue_hour_v2", "aurora"), false);
  assert.equal(isValidChoice("__proto__", "clear"), false);
  const late: DuskChoice = { style: "late_evening_v1", sky: "dark" };
  assert.deepEqual(changeSky(late, "pink_clouds"), late);
  assert.throws(() => duskParams("scene_transform", "skumring", { style: "late_evening_v1", sky: "pink_clouds" } as DuskChoice));
  assert.throws(() => duskParams("scene_transform", "skumring", { style: "nordic_blue_hour_v2", sky: "dark" } as DuskChoice));
  assert.throws(() => duskParams("scene_transform", "skumring", { style: "nordic_blue_hour_v1", sky: "clear" } as unknown as DuskChoice));
});

// TG-NEW-189: dusk_style sendes alltid for skumring, ogsaa standardstilen.
test("params_json: skumring har alltid alle tre feltene", () => {
  for (const preset of ["skumring", "skumring_interior"]) {
    assert.deepEqual(duskParams("scene_transform", preset, DEFAULT_DUSK), {
      dusk_time: "early",
      dusk_sky: "light_clouds",
      dusk_style: "nordic_blue_hour_v2",
    });
  }
});

test("params_json: andre tjenester og presets faar ingen av feltene", () => {
  const late: DuskChoice = { style: "late_evening_v1", sky: "dark" };
  for (const [service, preset] of [
    ["scene_transform", "klart_vaer"],
    ["scene_transform", undefined],
    ["magic_cleanup", undefined],
    ["privacy_blur", "skumring"],
  ] as const) {
    const params = duskParams(service, preset, late);
    assert.deepEqual(params, {}, `${service}/${preset}`);
    assert.equal("dusk_time" in params || "dusk_sky" in params || "dusk_style" in params, false);
  }
});

test("faktaboksen: sky_applied true, null og false", () => {
  const dusk = (skyApplied: boolean | null): ReviewDusk => ({ time: "late", sky: "starry", skyApplied });
  assert.deepEqual(duskFacts(dusk(true)), { time: "late", sky: { kind: "code", code: "starry" } });
  assert.deepEqual(duskFacts(dusk(null)), { time: "late", sky: { kind: "code", code: "starry" } });
  assert.deepEqual(duskFacts(dusk(false)), { time: "late", sky: { kind: "not_applied" } });
  assert.equal(t("nb", "review.duskSkyNotApplied"), "ikke brukt (ingen himmel i bildet)");
});

test("faktaboksen: uten dusk vises ingenting, ukjent kode gir generisk tekst", () => {
  assert.equal(duskFacts(null), null);
  const odd = duskFacts({ time: null, sky: "aurora", skyApplied: true });
  assert.equal(codeText("nb", "duskTime", odd?.time), DICTIONARIES.nb.generic.duskTime);
  assert.equal(
    codeText("nb", "duskSky", odd?.sky.kind === "code" ? odd.sky.code : null),
    DICTIONARIES.nb.generic.duskSky
  );
});

test("alle tidspunkt og himmelvalg paa kortene har tekst paa nb og en", () => {
  for (const locale of ["nb", "en"] as const) {
    const { codes, generic } = DICTIONARIES[locale];
    for (const style of DUSK_STYLES) {
      const { time, skies } = DUSK_CARDS[style];
      assert.ok(Object.hasOwn(codes.duskTime, time), `${locale}/${time}`);
      assert.notEqual(codeText(locale, "duskTime", time), generic.duskTime);
      for (const sky of skies) {
        assert.ok(Object.hasOwn(codes.duskSky, sky), `${locale}/${sky}`);
      }
    }
  }
  assert.equal(codeText("nb", "duskTime", "late"), "Sen kveld");
  // Gamle jobber kan ha stjernehimmel.
  assert.equal(codeText("nb", "duskSky", "starry"), "Stjernehimmel");
  assert.equal(codeText("nb", "duskSky", "clear"), "Klar himmel");
  assert.equal(codeText("en", "duskSky", "clear"), "Clear sky");
  assert.equal(codeText("en", "duskSky", "pink_clouds"), "Pink clouds");
});
