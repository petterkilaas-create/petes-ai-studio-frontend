import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  changeSky,
  changeStyle,
  changeTime,
  DEFAULT_DUSK,
  DUSK_STYLES,
  duskLine,
  duskParams,
  styleFacts,
  styleFellBack,
  type DuskChoice,
  type DuskStyle,
} from "./dusk.ts";
import { codeText, DICTIONARIES, t } from "./i18n/index.ts";

// Stil v2 i frontend (TG-NEW-189, Petter 11.10): valget «Varm skumring (test)»
// paa Tjenester, og stilen paa godkjenningssiden.

// api.ts kaster ved import uten NEXT_PUBLIC_API_BASE; sett en dummy-verdi
// foer dynamisk import. Ingen nettverkskall.
process.env.NEXT_PUBLIC_API_BASE = "http://api.test";
const { normalizeReview } = await import("./api.ts");

const APP = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");
/** Uten kommentarer, saa en kommentar ikke kan oppfylle eller bryte en sjekk. */
const code = (rel: string) => read(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** Kroppen til `const <name> = ...` fram til den lukkende `}` paa samme innrykk. */
function body(src: string, name: string): string {
  const start = src.indexOf(`  const ${name} = `);
  assert.notEqual(start, -1, `fant ikke ${name}`);
  const end = src.indexOf("\n  }", start);
  assert.notEqual(end, -1, `fant ikke slutten paa ${name}`);
  return src.slice(start, end);
}

const V1: DuskStyle = "nordic_blue_hour_v1";
const V2: DuskStyle = "warm_dusk_v2";

// --- Valget og params_json ----------------------------------------------------

test("TG189: stilene, i rekkefoelge, og standarden er dagens stil", () => {
  assert.deepEqual(DUSK_STYLES, [V1, V2]);
  assert.equal(DEFAULT_DUSK.style, V1);
});

test("TG189: varm skumring sender dusk_style sammen med tid og himmel", () => {
  const warm: DuskChoice = { time: "late", sky: "starry", style: V2 };
  for (const preset of ["skumring", "skumring_interior"]) {
    assert.deepEqual(duskParams("scene_transform", preset, warm), {
      dusk_time: "late",
      dusk_sky: "starry",
      dusk_style: "warm_dusk_v2",
    });
    assert.deepEqual(duskParams("scene_transform", preset, { ...warm, style: V1 }), {
      dusk_time: "late",
      dusk_sky: "starry",
      dusk_style: "nordic_blue_hour_v1",
    });
  }
});

test("TG189: andre kort sender ingen skumringsfelt, heller ikke med varm skumring valgt", () => {
  const warm: DuskChoice = { time: "early", sky: "clear", style: V2 };
  for (const [service, preset] of [
    ["scene_transform", "klart_vaer"],
    ["scene_transform", undefined],
    ["magic_cleanup", undefined],
    ["privacy_blur", "skumring"],
  ] as const) {
    assert.deepEqual(duskParams(service, preset, warm), {}, `${service}/${preset}`);
  }
});

test("TG189: en ukjent stil kan ikke bygges", () => {
  assert.throws(() =>
    duskParams("scene_transform", "skumring", { time: "early", sky: "clear", style: "aurora" as DuskStyle })
  );
  // changeStyle ignorerer en ukjent stil.
  assert.deepEqual(changeStyle(DEFAULT_DUSK, "aurora" as DuskStyle), DEFAULT_DUSK);
});

test("TG189: bytte av tid eller himmel beholder stilen, og bytte av stil beholder tid og himmel", () => {
  const warm: DuskChoice = { time: "early", sky: "pink_clouds", style: V2 };
  assert.deepEqual(changeTime(warm, "late"), { time: "late", sky: "dark", style: V2 });
  assert.deepEqual(changeSky(warm, "light_clouds"), { time: "early", sky: "light_clouds", style: V2 });
  assert.deepEqual(changeStyle(warm, V1), { time: "early", sky: "pink_clouds", style: V1 });
  assert.deepEqual(changeStyle({ ...warm, style: V1 }, V2), warm);
});

// --- Tjenester: nullstilling og viderefoering ---------------------------------

const page = code("(app)/tjenester/page.tsx");

test("TG189: stilen ligger i dusk, som nullstilles ved bytte av verktoey og ved «Nullstill», ikke ved nytt bilde", () => {
  assert.match(page, /useState<DuskChoice>\(DEFAULT_DUSK\)/);
  assert.match(body(page, "selectTool"), /setDusk\(DEFAULT_DUSK\);/);
  assert.match(body(page, "handleReset"), /setDusk\(DEFAULT_DUSK\);/);
  assert.doesNotMatch(body(page, "handleFileChange"), /setDusk/);
  assert.match(page, /\.\.\.duskParams\(selectedTool\.service, selectedTool\.presetId, dusk\)/);
});

test("TG189: «Fortsett som eksteriør» sender de forrige parametrene videre, med dusk_style", () => {
  const hook = code("hooks/useProcessJob.ts");
  const fn = hook.slice(hook.indexOf("const resubmitForced"), hook.indexOf("}, [run]);"));
  assert.match(fn, /\.\.\.last\.params,/);
});

// --- Valget paa Tjenester -----------------------------------------------------

const picker = code("components/DuskChoicePicker.tsx");

test("TG189: stilknappene har aria-pressed og knappetekst fra ordlista", () => {
  const group = picker.slice(picker.indexOf("DUSK_STYLES.map"), picker.indexOf("</button>", picker.indexOf("DUSK_STYLES.map")));
  assert.match(group, /aria-pressed=\{value\.style === style\}/);
  assert.match(group, /onChange\(changeStyle\(value, style\)\)/);
  assert.match(group, /disabled=\{disabled\}/);
  assert.match(picker, /role="group" aria-label=\{t\(locale, "dusk\.style"\)\}/);
  assert.match(picker, /nordic_blue_hour_v1: "dusk\.styleStandard"/);
  assert.match(picker, /warm_dusk_v2: "dusk\.styleWarm"/);
  // Hinten vises alltid.
  assert.match(picker, /<p className="[^"]*">\{t\(locale, "dusk\.styleHint"\)\}<\/p>/);
});

test("TG189: linja over tid og himmel ligger alltid i en aria-live-boks og har tekst bare ved varm skumring", () => {
  const live = picker.slice(picker.indexOf('aria-live="polite"'), picker.indexOf("</p>", picker.indexOf('aria-live="polite"')));
  assert.ok(live.length > 0, "fant ikke aria-live-boksen");
  assert.match(live, /\{warm \? t\(locale, "dusk\.styleFallbackNote"\) : ""\}/);
  assert.match(picker, /const warm = value\.style === STYLE_V2;/);
  // Boksen er ikke betinget montert og ikke skjult med display:none.
  assert.doesNotMatch(picker, /\{warm && <p aria-live/);
  assert.doesNotMatch(live, /hidden/);
  // Linja kommer foer tidspunktet.
  assert.ok(picker.indexOf('aria-live="polite"') < picker.indexOf('t(locale, "dusk.time")'));
});

test("TG189: tid og himmel er fortsatt valgbare med varm skumring (ikke skjult eller laast av stilen)", () => {
  const times = picker.slice(picker.indexOf("DUSK_TIMES.map"), picker.indexOf("</button>", picker.indexOf("DUSK_TIMES.map")));
  const skies = picker.slice(picker.indexOf("DUSK_SKY_BY_TIME[value.time].map"));
  for (const part of [times, skies]) {
    assert.match(part, /disabled=\{disabled\}/);
    assert.doesNotMatch(part, /warm|style/);
  }
  // Knappene for tid og himmel staar ikke inne i en betingelse paa stilen.
  assert.doesNotMatch(picker, /warm \? \(|warm && \(|style === STYLE_V2 && \(/);
});

// --- Ordlista ------------------------------------------------------------------

test("TG189: tekstene paa nb og en", () => {
  const expected = {
    nb: {
      "dusk.style": "Stil",
      "dusk.styleStandard": "Standard",
      "dusk.styleWarm": "Varm skumring (test)",
      "dusk.styleHint": "For utebilder med synlig himmel og minst én lampe",
      "dusk.styleFallbackNote": "Tidspunkt og himmel brukes hvis varm skumring ikke passer bildet",
      "review.style": "Stil",
      "review.styleFellBack": "Varm skumring passet ikke dette bildet, så standardstilen ble brukt.",
    },
    en: {
      "dusk.style": "Style",
      "dusk.styleStandard": "Standard",
      "dusk.styleWarm": "Warm dusk (test)",
      "dusk.styleHint": "For exterior photos with visible sky and at least one lamp",
      "dusk.styleFallbackNote": "Time and sky are used if warm dusk does not suit the image",
      "review.style": "Style",
      "review.styleFellBack": "Warm dusk did not suit this image, so the standard style was used.",
    },
  } as const;
  for (const locale of ["nb", "en"] as const) {
    for (const [key, text] of Object.entries(expected[locale])) {
      assert.equal(t(locale, key as keyof (typeof expected)["nb"]), text, `${locale} ${key}`);
    }
  }
  assert.equal(t("nb", "review.styleOrdered", { applied: "Standard", requested: "Varm skumring" }), "Standard (bestilt: Varm skumring)");
  assert.equal(t("en", "review.styleOrdered", { applied: "Standard", requested: "Warm dusk" }), "Standard (ordered: Warm dusk)");
});

test("TG189: warm_dusk finnes i duskSky og roundSky, og duskStyle har navnene uten «(test)»", () => {
  assert.equal(codeText("nb", "duskSky", "warm_dusk"), "Varm skumring");
  assert.equal(codeText("en", "duskSky", "warm_dusk"), "Warm dusk");
  assert.equal(codeText("nb", "roundSky", "warm_dusk"), "varm skumring");
  assert.equal(codeText("en", "roundSky", "warm_dusk"), "warm dusk");
  assert.equal(codeText("nb", "duskStyle", V1), "Standard");
  assert.equal(codeText("nb", "duskStyle", V2), "Varm skumring");
  assert.equal(codeText("en", "duskStyle", V1), "Standard");
  assert.equal(codeText("en", "duskStyle", V2), "Warm dusk");
  for (const locale of ["nb", "en"] as const) {
    for (const text of Object.values(DICTIONARIES[locale].codes.duskStyle)) {
      assert.doesNotMatch(text, /test/i);
    }
  }
});

test("TG189: en ukjent stil eller himmel faller tilbake til «Ukjent …» uten krasj", () => {
  assert.equal(codeText("nb", "duskStyle", "warm_dusk_v3"), "Ukjent stil");
  assert.equal(codeText("en", "duskStyle", null), "Unknown style");
  assert.equal(codeText("nb", "duskSky", "aurora"), "Ukjent himmel");
  assert.equal(codeText("nb", "roundSky", "aurora"), "ukjent himmel");
});

// --- Review --------------------------------------------------------------------

test("TG189: normalizeReview uten style gir standard bestilt og ingen brukt", () => {
  assert.deepEqual(normalizeReview({}, "j1").style, { requested: V1, applied: null });
  assert.deepEqual(normalizeReview({ style: null }, "j1").style, { requested: V1, applied: null });
  assert.deepEqual(normalizeReview({ style: { requested: 7, applied: [] } }, "j1").style, {
    requested: V1,
    applied: null,
  });
});

test("TG189: normalizeReview med style leser bestilt og brukt", () => {
  assert.deepEqual(normalizeReview({ style: { requested: V2, applied: V1 } }, "j1").style, {
    requested: V2,
    applied: V1,
  });
  assert.deepEqual(normalizeReview({ style: { requested: V2, applied: null } }, "j1").style, {
    requested: V2,
    applied: null,
  });
});

test("TG189: linja om at varm skumring ikke passet vises bare ved bestilt v2 og brukt v1", () => {
  assert.equal(styleFellBack({ requested: V2, applied: V1 }), true);
  assert.equal(styleFellBack({ requested: V2, applied: V2 }), false);
  assert.equal(styleFellBack({ requested: V2, applied: null }), false);
  assert.equal(styleFellBack({ requested: V1, applied: V1 }), false);
  assert.equal(styleFellBack({ requested: V1, applied: null }), false);
  assert.equal(styleFellBack({ requested: "warm_dusk_v3", applied: V1 }), false);
  assert.equal(styleFellBack({ requested: V2, applied: "warm_dusk_v3" }), false);
  assert.equal(styleFellBack(null), false);
});

test("TG189: stil-raden for admin: brukt, og bestilt bare naar den er en annen", () => {
  assert.deepEqual(styleFacts({ requested: V2, applied: V1 }), { applied: V1, requested: V2 });
  assert.deepEqual(styleFacts({ requested: V2, applied: V2 }), { applied: V2, requested: null });
  assert.deepEqual(styleFacts({ requested: V1, applied: V1 }), { applied: V1, requested: null });
  assert.equal(styleFacts({ requested: V2, applied: null }), null);
  assert.equal(styleFacts(null), null);
});

test("TG189: MoodPanel viser fallback-linja for begge roller og stil-raden bare for admin", () => {
  const mood = code("components/godkjenning/MoodPanel.tsx");
  assert.match(mood, /const fellBack = styleFellBack\(review\.style\);/);
  assert.match(mood, /\{fellBack && <p className="[^"]*">\{t\(locale, "review\.styleFellBack"\)\}<\/p>\}/);
  assert.match(mood, /const style = admin \? styleFacts\(review\.style\) : null;/);
  assert.match(mood, /t\(locale, "review\.styleOrdered", \{/);
  assert.match(mood, /"dusk" \| "style" \| "lights" \| "fireplace"/);
});

test("TG189: megleren ser bare «Varm skumring» for en v2-runde, andre runder som foer", () => {
  assert.deepEqual(duskLine({ time: "early", sky: "warm_dusk", skyApplied: true }), { time: null, sky: "warm_dusk" });
  assert.deepEqual(duskLine({ time: "early", sky: "warm_dusk", skyApplied: null }), { time: null, sky: "warm_dusk" });
  assert.deepEqual(duskLine({ time: "early", sky: "clear", skyApplied: true }), { time: "early", sky: "clear" });
  // Himmelen ikke brukt: tidspunktet som foer.
  assert.deepEqual(duskLine({ time: "early", sky: "warm_dusk", skyApplied: false }), { time: "early", sky: null });
});
