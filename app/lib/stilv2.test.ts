import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { styleFacts } from "./dusk.ts";
import { codeText, t } from "./i18n/index.ts";

// Stil v2 i frontend (TG-NEW-189, Petter 11.10): valget «Varm skumring (test)»
// paa Tjenester, og stilen paa godkjenningssiden. Valget, fallback-linja og
// meglerlinja ble erstattet av stilkortene (Dag 55, stilkort.test.ts); her
// staar det som fortsatt gjelder.

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

const V1 = "nordic_blue_hour_v1";
const V2 = "warm_dusk_v2";

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

// --- Ordlista ------------------------------------------------------------------

test("TG189: Stil-raden for admin paa nb og en", () => {
  assert.equal(t("nb", "review.style"), "Stil");
  assert.equal(t("en", "review.style"), "Style");
  assert.equal(t("nb", "review.styleOrdered", { applied: "Standard", requested: "Varm skumring" }), "Standard (bestilt: Varm skumring)");
  assert.equal(t("en", "review.styleOrdered", { applied: "Standard", requested: "Warm dusk" }), "Standard (ordered: Warm dusk)");
});

test("TG189: warm_dusk finnes i duskSky og roundSky", () => {
  assert.equal(codeText("nb", "duskSky", "warm_dusk"), "Varm skumring");
  assert.equal(codeText("en", "duskSky", "warm_dusk"), "Warm dusk");
  assert.equal(codeText("nb", "roundSky", "warm_dusk"), "varm skumring");
  assert.equal(codeText("en", "roundSky", "warm_dusk"), "warm dusk");
});

test("TG189: en ukjent stil eller himmel faller tilbake til «Ukjent …» uten krasj", () => {
  assert.equal(codeText("nb", "duskStyle", "winter_evening_v1"), "Ukjent stil");
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

test("TG189: stil-raden for admin: brukt, og bestilt bare naar den er en annen", () => {
  assert.deepEqual(styleFacts({ requested: V2, applied: V1 }), { applied: V1, requested: V2 });
  assert.deepEqual(styleFacts({ requested: V2, applied: V2 }), { applied: V2, requested: null });
  assert.deepEqual(styleFacts({ requested: V1, applied: V1 }), { applied: V1, requested: null });
  assert.equal(styleFacts({ requested: V2, applied: null }), null);
  assert.equal(styleFacts(null), null);
});

test("TG189: MoodPanel viser stil-raden bare for admin", () => {
  const mood = code("components/godkjenning/MoodPanel.tsx");
  assert.match(mood, /const style = admin \? styleFacts\(review\.style\) : null;/);
  assert.match(mood, /t\(locale, "review\.styleOrdered", \{/);
  assert.match(mood, /"dusk" \| "style" \| "lights" \| "fireplace"/);
});
