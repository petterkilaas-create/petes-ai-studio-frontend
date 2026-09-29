import { test } from "node:test";
import assert from "node:assert/strict";
import {
  changeSky,
  changeTime,
  DEFAULT_DUSK,
  DUSK_SKY_BY_TIME,
  DUSK_TIMES,
  duskFacts,
  duskParams,
  isValidPair,
  type DuskChoice,
  type ReviewDusk,
} from "./dusk.ts";
import { codeText, DICTIONARIES, t } from "./i18n/index.ts";

test("lovlige himmelvalg per tidspunkt, i riktig rekkefoelge", () => {
  assert.deepEqual(DUSK_SKY_BY_TIME.early, ["clear", "light_clouds", "pink_clouds"]);
  assert.deepEqual(DUSK_SKY_BY_TIME.late, ["dark", "starry"]);
  assert.deepEqual(DUSK_TIMES, ["early", "late"]);
  assert.deepEqual(DEFAULT_DUSK, { time: "early", sky: "clear" });
});

test("bytte av tidspunkt nullstiller himmelen til standarden", () => {
  const pink: DuskChoice = { time: "early", sky: "pink_clouds" };
  assert.deepEqual(changeTime(pink, "late"), { time: "late", sky: "dark" });
  const starry: DuskChoice = { time: "late", sky: "starry" };
  assert.deepEqual(changeTime(starry, "early"), { time: "early", sky: "clear" });
  // Samme tidspunkt beholder himmelen.
  assert.deepEqual(changeTime(pink, "early"), pink);
});

test("et ugyldig par kan ikke velges eller bygges", () => {
  assert.equal(isValidPair("late", "pink_clouds"), false);
  assert.equal(isValidPair("early", "starry"), false);
  assert.equal(isValidPair("early", "aurora"), false);
  assert.equal(isValidPair("__proto__", "clear"), false);
  const late: DuskChoice = { time: "late", sky: "dark" };
  assert.deepEqual(changeSky(late, "pink_clouds"), late);
  assert.deepEqual(changeSky(late, "starry"), { time: "late", sky: "starry" });
  assert.throws(() =>
    duskParams("scene_transform", "skumring", { time: "late", sky: "pink_clouds" } as DuskChoice)
  );
  assert.throws(() =>
    duskParams("scene_transform", "skumring", { time: "early", sky: "dark" } as DuskChoice)
  );
});

test("params_json: skumring har alltid begge feltene", () => {
  for (const preset of ["skumring", "skumring_interior"]) {
    assert.deepEqual(duskParams("scene_transform", preset, DEFAULT_DUSK), {
      dusk_time: "early",
      dusk_sky: "clear",
    });
    assert.deepEqual(duskParams("scene_transform", preset, { time: "late", sky: "starry" }), {
      dusk_time: "late",
      dusk_sky: "starry",
    });
  }
});

test("params_json: andre tjenester og presets faar ingen av feltene", () => {
  const late: DuskChoice = { time: "late", sky: "starry" };
  for (const [service, preset] of [
    ["scene_transform", "klart_vaer"],
    ["scene_transform", undefined],
    ["magic_cleanup", undefined],
    ["privacy_blur", "skumring"],
  ] as const) {
    const params = duskParams(service, preset, late);
    assert.deepEqual(params, {}, `${service}/${preset}`);
    assert.equal("dusk_time" in params || "dusk_sky" in params, false);
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

test("alle tidspunkt og himmelvalg har tekst paa nb og en", () => {
  for (const locale of ["nb", "en"] as const) {
    const { codes, generic } = DICTIONARIES[locale];
    for (const time of DUSK_TIMES) {
      assert.ok(Object.hasOwn(codes.duskTime, time), `${locale}/${time}`);
      assert.notEqual(codeText(locale, "duskTime", time), generic.duskTime);
      for (const sky of DUSK_SKY_BY_TIME[time]) {
        assert.ok(Object.hasOwn(codes.duskSky, sky), `${locale}/${sky}`);
      }
    }
  }
  assert.equal(codeText("nb", "duskTime", "late"), "Sen kveld");
  assert.equal(codeText("nb", "duskSky", "starry"), "Stjernehimmel");
  assert.equal(codeText("en", "duskSky", "pink_clouds"), "Pink clouds");
});
