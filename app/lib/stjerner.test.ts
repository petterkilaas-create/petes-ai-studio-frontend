import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  changeSky,
  changeStyle,
  DUSK_CARDS,
  duskLine,
  duskParams,
  skyChoices,
  styleFellBack,
  type DuskChoice,
  type DuskStyle,
} from "./dusk.ts";
import { codeText, t } from "./i18n/index.ts";
import { withoutComments } from "./testing/jsxText.ts";

// Stjernehimmel som valg under Sen kveld (Dag 56, TG-NEW-265 punkt 2).
// Kontrakten er dusk_styles.STYLES i backend (dag56-stjerner): Sen kveld godtar
// dusk_sky dark (standard) og starry, de andre nye stilene svarer 400 paa starry.

const APP = join(dirname(fileURLToPath(import.meta.url)), "..");
const code = (rel: string) => withoutComments(readFileSync(join(APP, rel), "utf8"));

const BLUE: DuskStyle = "nordic_blue_hour_v2";
const WARM: DuskStyle = "warm_dusk_v3";
const LATE: DuskStyle = "late_evening_v1";
const SUMMER: DuskStyle = "summer_night_v1";
const V1 = "nordic_blue_hour_v1";

// --- Kortet ---------------------------------------------------------------------

test("Stjerner: Sen kveld har moerk himmel (standard) og stjernehimmel", () => {
  assert.deepEqual(DUSK_CARDS[LATE], { time: "late", skies: ["dark", "starry"] });
  assert.deepEqual(skyChoices(LATE), ["dark", "starry"]);
  for (const style of [BLUE, WARM, SUMMER]) assert.equal(skyChoices(style).includes("starry"), false, style);
});

test("Stjerner: kortet starter med moerk himmel, og et nytt kort nullstiller stjernene", () => {
  const late = changeStyle({ style: BLUE, sky: "pink_clouds" }, LATE);
  assert.deepEqual(late, { style: LATE, sky: "dark" });
  const stars = changeSky(late, "starry");
  assert.deepEqual(stars, { style: LATE, sky: "starry" });
  assert.deepEqual(changeStyle(stars, LATE), stars);
  assert.deepEqual(changeStyle(stars, BLUE), { style: BLUE, sky: "light_clouds" });
  assert.deepEqual(changeStyle(changeStyle(stars, BLUE), LATE), { style: LATE, sky: "dark" });
  // En himmel Sen kveld ikke har, ignoreres; stjerner under Blå time likeså.
  assert.deepEqual(changeSky(stars, "light_clouds"), stars);
  assert.deepEqual(changeSky({ style: BLUE, sky: "clear" }, "starry"), { style: BLUE, sky: "clear" });
});

test("Stjerner: velgerens himmelknapper har navnene fra ordlista", () => {
  assert.equal(codeText("nb", "duskSky", "dark"), "Mørk kveldshimmel");
  assert.equal(codeText("nb", "duskSky", "starry"), "Stjernehimmel");
  assert.equal(codeText("en", "duskSky", "dark"), "Dark evening sky");
  assert.equal(codeText("en", "duskSky", "starry"), "Starry sky");
  const picker = code("components/DuskChoicePicker.tsx");
  assert.match(picker, /codeText\(locale, "duskSky", sky\)/);
});

// --- Bestillingen (params_json) ------------------------------------------------

test("Stjerner: duskParams sender late/starry for Sen kveld, ute og inne", () => {
  const stars: DuskChoice = { style: LATE, sky: "starry" };
  for (const preset of ["skumring", "skumring_interior"]) {
    assert.deepEqual(duskParams("scene_transform", preset, stars), {
      dusk_time: "late",
      dusk_sky: "starry",
      dusk_style: LATE,
    }, preset);
  }
  assert.deepEqual(duskParams("scene_transform", "skumring", { style: LATE, sky: "dark" }), {
    dusk_time: "late",
    dusk_sky: "dark",
    dusk_style: LATE,
  });
  // Ikke skumring: ingen felter.
  assert.deepEqual(duskParams("scene_transform", "blue_sky", stars), {});
});

test("Stjerner: stjerner paa de andre stilene kaster (backend svarer 400)", () => {
  for (const style of [BLUE, WARM, SUMMER]) {
    assert.throws(() => duskParams("scene_transform", "skumring", { style, sky: "starry" }), style);
  }
});

// --- Merknaden ------------------------------------------------------------------

test("Stjerner: merknaden «Ikke for bilder fra mai–juli.», nb og en", () => {
  assert.equal(t("nb", "dusk.starryNote"), "Ikke for bilder fra mai–juli.");
  assert.equal(t("en", "dusk.starryNote"), "Not for photos taken in May–July.");
});

test("Stjerner: merknaden staar i samme aria-live-boks som sommernotatet, bare ved Sen kveld med stjerner", () => {
  const picker = code("components/DuskChoicePicker.tsx");
  assert.match(picker, /const stars = value\.style === STYLE_LATE && value\.sky === "starry";/);
  assert.match(
    picker,
    /const note = summer \? t\(locale, "dusk\.summerNote"\) : stars \? t\(locale, "dusk\.starryNote"\) : "";/
  );
  // Én boks, alltid i treet, med begge merknadene.
  assert.equal(picker.match(/aria-live=/g)?.length, 1);
  assert.match(picker, /<p aria-live="polite"[^>]*>\s*\{note\}\s*<\/p>/);
});

// --- Godkjenningen --------------------------------------------------------------

const line = (locale: "nb" | "en", l: { style: string; sky: string | null } | null) =>
  l === null
    ? null
    : [codeText(locale, "duskStyle", l.style), l.sky === null ? null : codeText(locale, "duskSky", l.sky)]
        .filter((s): s is string => s !== null)
        .join(" · ");

test("Stjerner: meglerlinja viser «Sen kveld · Stjernehimmel», men «Sen kveld» med moerk himmel", () => {
  const late = { requested: LATE, applied: LATE };
  const stars = duskLine({ time: "late", sky: "starry", skyApplied: true }, late);
  assert.deepEqual(stars, { style: LATE, sky: "starry" });
  assert.equal(line("nb", stars), "Sen kveld · Stjernehimmel");
  assert.equal(line("en", stars), "Late evening · Starry sky");
  const dark = duskLine({ time: "late", sky: "dark", skyApplied: true }, late);
  assert.deepEqual(dark, { style: LATE, sky: null });
  assert.equal(line("nb", dark), "Sen kveld");
  // Foer runden har en prompt: valget vises.
  assert.deepEqual(duskLine({ time: "late", sky: "starry", skyApplied: null }, { requested: LATE, applied: null }), {
    style: LATE,
    sky: "starry",
  });
  // Ingen himmel i bildet: ingen himmel i linja.
  assert.deepEqual(duskLine({ time: "late", sky: "starry", skyApplied: false }, late), { style: LATE, sky: null });
});

test("Stjerner: Blå time viser himmelen ogsaa naar den er standarden (uendret)", () => {
  const blue = { requested: BLUE, applied: BLUE };
  assert.equal(line("nb", duskLine({ time: "early", sky: "light_clouds", skyApplied: true }, blue)), "Blå time · Lette skyer");
});

test("Stjerner: Sen kveld som faller tilbake til v1 + late, er «Sen kveld · Stjernehimmel» uten fallback-linje", () => {
  const fell = { requested: LATE, applied: V1 };
  assert.equal(line("nb", duskLine({ time: "late", sky: "starry", skyApplied: true }, fell)), "Sen kveld · Stjernehimmel");
  assert.equal(styleFellBack(fell, "late"), null);
});

test("Stjerner: MoodPanel bruker duskLine og navnet paa himmelen", () => {
  const panel = code("components/godkjenning/MoodPanel.tsx");
  assert.match(panel, /const line = admin \? null : duskLine\(review\.dusk, review\.style\);/);
  assert.match(panel, /line\.sky === null \? null : codeText\(locale, "duskSky", line\.sky\)/);
});
