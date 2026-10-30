import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AdditionItem } from "./api.ts";
import { additionsSentences, additionTypeText } from "./additions.ts";
import { compareVariants, variantLabel, type CompareImages } from "./compare.ts";
import { disclosureText, type ReviewDisclosure } from "./disclosure.ts";
import {
  changeSky,
  changeStyle,
  DEFAULT_DUSK,
  DUSK_CARDS,
  DUSK_STYLES,
  displayStyle,
  duskLine,
  duskParams,
  skyChoices,
  styleFellBack,
  type DuskChoice,
  type DuskStyle,
} from "./dusk.ts";
import { codeText, DICTIONARIES, t } from "./i18n/index.ts";
import { withoutComments } from "./testing/jsxText.ts";

// Stilkortene for Kveldsbilde (Dag 55, TG-NEW-259): fire kort med eksempelbilde,
// fem stiler i godkjenningen (pluss de gamle kodene) og etikettene for kontroll v2.
// Kontrakten er dusk_styles.STYLES i backend (dag55-stilkort-be).

const APP = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");
const code = (rel: string) => withoutComments(read(rel));

const BLUE: DuskStyle = "nordic_blue_hour_v2";
const WARM: DuskStyle = "warm_dusk_v3";
const LATE: DuskStyle = "late_evening_v1";
const SUMMER: DuskStyle = "summer_night_v1";
const V1 = "nordic_blue_hour_v1";
const V2 = "warm_dusk_v2";

// --- Kontrakten ----------------------------------------------------------------

test("Stilkort: fire kort i rekkefoelge, og kontrakten per kort med standardhimmelen", () => {
  assert.deepEqual(DUSK_STYLES, [BLUE, WARM, LATE, SUMMER]);
  assert.deepEqual(Object.keys(DUSK_CARDS), [...DUSK_STYLES]);
  const expected: Record<DuskStyle, { dusk_time: string; dusk_sky: string; dusk_style: string }> = {
    nordic_blue_hour_v2: { dusk_time: "early", dusk_sky: "light_clouds", dusk_style: BLUE },
    warm_dusk_v3: { dusk_time: "early", dusk_sky: "light_clouds", dusk_style: WARM },
    late_evening_v1: { dusk_time: "late", dusk_sky: "dark", dusk_style: LATE },
    summer_night_v1: { dusk_time: "early", dusk_sky: "light_clouds", dusk_style: SUMMER },
  };
  for (const style of DUSK_STYLES) {
    const choice = changeStyle(style === BLUE ? { style: LATE, sky: "dark" } : DEFAULT_DUSK, style);
    for (const preset of ["skumring", "skumring_interior"]) {
      assert.deepEqual(duskParams("scene_transform", preset, choice), expected[style], `${style}/${preset}`);
    }
  }
});

test("Stilkort: standarden er Blå time med lette skyer", () => {
  assert.deepEqual(DEFAULT_DUSK, { style: BLUE, sky: "light_clouds" });
  const page = withoutComments(read("(app)/tjenester/page.tsx"));
  assert.match(page, /useState<DuskChoice>\(DEFAULT_DUSK\)/);
});

test("Stilkort: himmelvalg for Blå time (lette, klar, rosa) og Sen kveld (Dag 56)", () => {
  assert.deepEqual(skyChoices(BLUE), ["light_clouds", "clear", "pink_clouds"]);
  assert.deepEqual(skyChoices(LATE), ["dark", "starry"]);
  for (const style of [WARM, SUMMER]) assert.deepEqual(skyChoices(style), [], style);
  const blue: DuskChoice = { style: BLUE, sky: "light_clouds" };
  for (const sky of ["clear", "pink_clouds"] as const) {
    assert.deepEqual(duskParams("scene_transform", "skumring", changeSky(blue, sky)), {
      dusk_time: "early",
      dusk_sky: sky,
      dusk_style: BLUE,
    });
  }
  // De andre ignorerer et himmelvalg de ikke har.
  const warm: DuskChoice = { style: WARM, sky: "light_clouds" };
  assert.deepEqual(changeSky(warm, "pink_clouds"), warm);
  assert.deepEqual(changeSky({ style: LATE, sky: "dark" }, "light_clouds"), { style: LATE, sky: "dark" });
});

test("Stilkort: nytt kort setter standardhimmelen, samme kort beholder valget", () => {
  const pink: DuskChoice = { style: BLUE, sky: "pink_clouds" };
  assert.deepEqual(changeStyle(pink, BLUE), pink);
  assert.deepEqual(changeStyle(pink, LATE), { style: LATE, sky: "dark" });
  assert.deepEqual(changeStyle({ style: LATE, sky: "dark" }, BLUE), { style: BLUE, sky: "light_clouds" });
  assert.deepEqual(changeStyle(pink, "aurora" as DuskStyle), pink);
});

test("Stilkort: ukjent stil, gammel kode eller ulovlig himmel kaster i duskParams", () => {
  for (const choice of [
    { style: "aurora", sky: "clear" },
    { style: V1, sky: "clear" },
    { style: V2, sky: "clear" },
    { style: LATE, sky: "clear" },
    { style: WARM, sky: "starry" },
    { style: WARM, sky: "pink_clouds" },
    { style: SUMMER, sky: "clear" },
  ]) {
    assert.throws(() => duskParams("scene_transform", "skumring", choice as unknown as DuskChoice), choice.style);
  }
});

test("Stilkort: Vinterkveld finnes ikke (utelatt, ikke flagg)", () => {
  assert.equal(DUSK_STYLES.some((s) => /winter/.test(s)), false);
  for (const locale of ["nb", "en"] as const) {
    const { codes, ui } = DICTIONARIES[locale];
    assert.equal(Object.keys(codes.duskStyle).some((k) => /winter/.test(k)), false);
    assert.equal(Object.keys(ui).some((k) => /winter/.test(k)), false);
    assert.doesNotMatch(JSON.stringify(codes.duskStyle), /[Vv]interkveld|[Ww]inter/);
  }
  assert.doesNotMatch(read("(app)/tjenester/duskImages.ts"), /winter|vinter/i);
});

// --- Velgeren -------------------------------------------------------------------

const picker = code("components/DuskChoicePicker.tsx");

test("Stilkort: velgeren har fire kort i rutenett med bilde, aria-pressed og ett trykk", () => {
  // Dag 57 (TG-NEW-145): fire per rad fra md, unntatt kompakt i «Rett».
  // FE-3b: i vinduet paa bildebrettet saa mange som faar plass (auto-fill).
  assert.match(picker, /<ul className=\{inDialog \? DIALOG_GRID : `grid grid-cols-2 gap-2\$\{compact \? "" : " md:grid-cols-4"\}`\}/);
  assert.match(picker, /const DIALOG_GRID = "grid grid-cols-\[repeat\(auto-fill,minmax\(9\.5rem,1fr\)\)\] gap-2";/);
  const cards = picker.slice(picker.indexOf("DUSK_STYLES.map"), picker.indexOf("</ul>"));
  assert.match(cards, /onClick=\{\(\) => onChange\(changeStyle\(value, style\)\)\}/);
  assert.match(cards, /aria-pressed=\{on\}/);
  assert.match(cards, /disabled=\{disabled\}/);
  assert.match(cards, /src=\{images\[style\]\}/);
  assert.match(cards, /<span aria-hidden="true" className=\{TAG\}>\s*\{t\(locale, "compare\.ai"\)\}/);
  assert.match(cards, /codeText\(locale, "duskStyle", style\)/);
  assert.match(cards, /t\(locale, `dusk\.cardText\.\$\{style\}`\)/);
  // Samme valgt-ramme som stilkortene i Digital styling.
  assert.match(picker, /const CARD_ON = "border-ink ring-1 ring-ink";/);
  assert.match(picker, /images: Record<DuskStyle, StaticImageData>;/);
  // Tidsknappene er borte (stjernehimmelen er et himmelvalg, Dag 56).
  assert.doesNotMatch(picker, /DUSK_TIMES|changeTime|duskTime|STYLE_BUTTON/);
});

test("Stilkort: himmelknappene bare for stiler med himmelvalg, og ingen tidsknapper", () => {
  assert.match(picker, /const skies = value === null \? \[\] : skyChoices\(value\.style\);/);
  assert.match(picker, /\{skies\.length > 0 && \(/);
  const skies = picker.slice(picker.indexOf("skies.map"));
  // Dag 57 (TG-NEW-145): value kan vaere null i «Rett» (gammel stil); da er skies tom.
  assert.match(skies, /onClick=\{\(\) => value !== null && onChange\(changeSky\(value, sky\)\)\}/);
  assert.match(skies, /aria-pressed=\{value\?\.sky === sky\}/);
});

test("Stilkort: notatet ved Lys sommerkveld ligger alltid i en aria-live-boks", () => {
  assert.match(picker, /const summer = value\?\.style === STYLE_SUMMER;/);
  assert.match(picker, /const note = summer \? t\(locale, "dusk\.summerNote"\) :/);
  assert.match(picker, /<p aria-live="polite"[^>]*>\s*\{note\}\s*<\/p>/);
  assert.doesNotMatch(picker, /\{(summer|note) && <p aria-live/);
  assert.equal(t("nb", "dusk.summerNote"), "Ikke for bilder med snø.");
  assert.equal(t("en", "dusk.summerNote"), "Not for photos with snow.");
});

test("Stilkort: siden sender eksempelbildene, ett per kort i bilder/kveld/", () => {
  const page = withoutComments(read("(app)/tjenester/page.tsx"));
  assert.match(page, /import \{ DUSK_IMAGES \} from "\.\/duskImages";/);
  assert.match(page, /<DuskChoicePicker[\s\S]*?images=\{DUSK_IMAGES\}[\s\S]*?\/>/);
  const images = read("(app)/tjenester/duskImages.ts");
  assert.match(images, /export const DUSK_IMAGES: Record<DuskStyle, StaticImageData> = \{/);
  for (const file of ["01_blaa_time", "02_varm_skumring", "03_sen_kveld", "04_lys_sommerkveld"]) {
    assert.match(images, new RegExp(`from "\\./bilder/kveld/${file}\\.jpg";`), file);
  }
  for (const style of DUSK_STYLES) assert.match(images, new RegExp(`\\n  ${style}: \\w+,`), style);
});

// --- Tekstene -------------------------------------------------------------------

test("Stilkort: tekstene paa kortene og under dem, nb og en", () => {
  const expected = {
    nb: {
      "dusk.cardText.nordic_blue_hour_v2": "Klassisk blå time med lette skyer og varmt lys i vinduene.",
      "dusk.cardText.warm_dusk_v3": "Rosa og lilla skyer høyt på himmelen.",
      "dusk.cardText.late_evening_v1": "Dyp blå himmel, litt senere på kvelden.",
      "dusk.cardText.summer_night_v1": "Lys nordisk sommernatt med myke farger.",
      "dusk.cardsHint":
        "For utebilder og rom der himmelen synes. Uten himmel blir Varm skumring og Lys sommerkveld til Blå time.",
    },
    en: {
      "dusk.cardText.nordic_blue_hour_v2": "Classic blue hour with light clouds and warm light in the windows.",
      "dusk.cardText.warm_dusk_v3": "Pink and lilac clouds high in the sky.",
      "dusk.cardText.late_evening_v1": "Deep blue sky, a little later in the evening.",
      "dusk.cardText.summer_night_v1": "Light Nordic summer night with soft colours.",
      "dusk.cardsHint":
        "For exterior photos and rooms where the sky is visible. Without sky, Warm dusk and Light summer night become Blue hour.",
    },
  } as const;
  for (const locale of ["nb", "en"] as const) {
    for (const [key, text] of Object.entries(expected[locale])) {
      assert.equal(t(locale, key as keyof (typeof expected)["nb"]), text, `${locale} ${key}`);
    }
  }
  assert.equal(t("nb", "dusk.exampleAlt", { style: "Blå time" }), "Eksempel på Blå time, laget med AI");
});

test("Stilkort: de gamle velgertekstene er fjernet", () => {
  for (const locale of ["nb", "en"] as const) {
    // dusk.starryNote kom tilbake med ny tekst (Dag 56, stjerner.test.ts).
    for (const key of ["dusk.styleStandard", "dusk.styleWarm", "dusk.styleHint", "dusk.styleFallbackNote"]) {
      assert.equal(Object.hasOwn(DICTIONARIES[locale].ui, key), false, `${locale} ${key}`);
    }
    for (const text of Object.values(DICTIONARIES[locale].ui)) assert.doesNotMatch(text, /\(test\)/);
  }
});

// --- Godkjenningen --------------------------------------------------------------

test("Stilkort: navnene for de seks kodene, nb og en", () => {
  const nb: Record<string, string> = {
    nordic_blue_hour_v1: "Blå time",
    nordic_blue_hour_v2: "Blå time",
    warm_dusk_v2: "Varm skumring",
    warm_dusk_v3: "Varm skumring",
    late_evening_v1: "Sen kveld",
    summer_night_v1: "Lys sommerkveld",
  };
  const en: Record<string, string> = {
    nordic_blue_hour_v1: "Blue hour",
    nordic_blue_hour_v2: "Blue hour",
    warm_dusk_v2: "Warm dusk",
    warm_dusk_v3: "Warm dusk",
    late_evening_v1: "Late evening",
    summer_night_v1: "Light summer night",
  };
  assert.deepEqual(DICTIONARIES.nb.codes.duskStyle, nb);
  assert.deepEqual(DICTIONARIES.en.codes.duskStyle, en);
  assert.equal(codeText("nb", "duskStyle", "aurora"), "Ukjent stil");
});

test("Stilkort: en gammel jobb med v1 og sen tid vises som Sen kveld", () => {
  assert.equal(displayStyle(V1, "late"), LATE);
  assert.equal(displayStyle(V1, "early"), V1);
  assert.equal(displayStyle(V1, null), V1);
  assert.equal(displayStyle(V2, "early"), V2);
  assert.equal(displayStyle(BLUE, "late"), BLUE);
  const old = { requested: V1, applied: V1 };
  assert.deepEqual(duskLine({ time: "late", sky: "dark", skyApplied: true }, old), { style: LATE, sky: null });
  // Stjerner er ikke standarden for Sen kveld, og vises (Dag 56).
  assert.deepEqual(duskLine({ time: "late", sky: "starry", skyApplied: true }, old), { style: LATE, sky: "starry" });
  assert.deepEqual(duskLine({ time: "early", sky: "clear", skyApplied: true }, old), { style: V1, sky: "clear" });
});

test("Stilkort: meglerlinja viser stilen, og himmelen bare for Blå time", () => {
  const same = (s: string) => ({ requested: s, applied: s });
  assert.deepEqual(duskLine({ time: "early", sky: "pink_clouds", skyApplied: true }, same(BLUE)), { style: BLUE, sky: "pink_clouds" });
  assert.deepEqual(duskLine({ time: "early", sky: "warm_dusk", skyApplied: true }, same(WARM)), { style: WARM, sky: null });
  assert.deepEqual(duskLine({ time: "early", sky: "warm_dusk", skyApplied: true }, same(V2)), { style: V2, sky: null });
  assert.deepEqual(duskLine({ time: "late", sky: "dark", skyApplied: true }, same(LATE)), { style: LATE, sky: null });
  assert.deepEqual(duskLine({ time: "summer_night", sky: "summer_night", skyApplied: true }, same(SUMMER)), { style: SUMMER, sky: null });
  // Foer runden har en prompt: den bestilte stilen.
  assert.deepEqual(duskLine({ time: "early", sky: "light_clouds", skyApplied: null }, { requested: SUMMER, applied: null }), {
    style: SUMMER,
    sky: null,
  });
  // Fallback til Blå time uten himmel: «Blå time», uten himmel.
  assert.deepEqual(duskLine({ time: "early", sky: "light_clouds", skyApplied: false }, { requested: WARM, applied: BLUE }), {
    style: BLUE,
    sky: null,
  });
});

test("Stilkort: fallback-linja naar navnene er ulike (Cowork 26.10, valg A)", () => {
  assert.deepEqual(styleFellBack({ requested: WARM, applied: BLUE }, "early"), { requested: WARM, applied: BLUE });
  assert.deepEqual(styleFellBack({ requested: SUMMER, applied: BLUE }, "early"), { requested: SUMMER, applied: BLUE });
  assert.deepEqual(styleFellBack({ requested: V2, applied: V1 }, "early"), { requested: V2, applied: V1 });
  // Sen kveld faller til v1 + late, som ogsaa er Sen kveld: ingen linje.
  assert.equal(styleFellBack({ requested: LATE, applied: V1 }, "late"), null);
  assert.equal(styleFellBack({ requested: BLUE, applied: BLUE }, "early"), null);
  assert.equal(styleFellBack({ requested: WARM, applied: null }, "early"), null);
  assert.equal(styleFellBack(null, "early"), null);
  const line = (locale: "nb" | "en", requested: string, applied: string) =>
    t(locale, "review.styleFellBack", {
      requested: codeText(locale, "duskStyle", requested),
      applied: codeText(locale, "duskStyle", applied),
    });
  assert.equal(line("nb", WARM, BLUE), "Varm skumring passet ikke dette bildet, så Blå time ble brukt.");
  assert.equal(line("en", SUMMER, BLUE), "Light summer night did not suit this image, so Blue hour was used.");
});

test("Stilkort: MoodPanel bruker fallback-linja med navnene og meglerlinja med stilen", () => {
  const mood = code("components/godkjenning/MoodPanel.tsx");
  assert.match(mood, /const fellBack = styleFellBack\(review\.style, review\.dusk\?\.time \?\? null\);/);
  assert.match(
    mood,
    /t\(locale, "review\.styleFellBack", \{\s*requested: codeText\(locale, "duskStyle", fellBack\.requested\),\s*applied: codeText\(locale, "duskStyle", fellBack\.applied\),\s*\}\)/
  );
  assert.match(mood, /const line = admin \? null : duskLine\(review\.dusk, review\.style\);/);
  assert.match(mood, /codeText\(locale, "duskStyle", line\.style\)/);
  // Admin-raden bruker kodene uten omregning.
  assert.match(mood, /const style = admin \? styleFacts\(review\.style\) : null;/);
});

// --- summer_night ---------------------------------------------------------------

test("Stilkort: summer_night i tid, himmel, runde-etiketten og merketeksten", () => {
  assert.equal(codeText("nb", "duskTime", "summer_night"), "Lys sommerkveld");
  assert.equal(codeText("en", "duskTime", "summer_night"), "Light summer night");
  assert.equal(codeText("nb", "duskSky", "summer_night"), "Lys sommerhimmel");
  assert.equal(codeText("en", "duskSky", "summer_night"), "Light summer sky");
  assert.equal(codeText("nb", "roundTime", "summer_night"), "sommerkveld");
  assert.equal(codeText("nb", "roundSky", "summer_night"), "lys sommerhimmel");
  assert.equal(codeText("en", "roundTime", "summer_night"), "summer night");
  assert.equal(codeText("en", "roundSky", "summer_night"), "light summer sky");

  const images: CompareImages = {
    previewUrl: "p0.jpg",
    rawPreviewUrl: null,
    previous: null,
    rounds: [
      {
        round: 0,
        current: true,
        previewUrl: "p0.jpg",
        rawPreviewUrl: null,
        choices: { time: "summer_night", sky: "summer_night", skyApplied: true, fireplaceFire: null, lightsChanged: false },
      },
    ],
  };
  const variant = compareVariants(images, { isAdmin: false })[0];
  assert.equal(variantLabel("nb", variant, { choices: true }), "Versjon 1 · nå (sommerkveld, lys sommerhimmel)");

  const disclosure: ReviewDisclosure = {
    version: "8",
    base: "evening_from_day",
    time: "summer_night",
    scope: "exterior",
    edited: [],
    source: "recorded",
    status: "ok",
  };
  const full = (locale: "nb" | "en") => {
    const r = disclosureText(locale, disclosure, "full");
    return r?.kind === "text" ? r.text : null;
  };
  assert.equal(full("nb"), "Kveldsbilde laget med AI fra dagsbilde. Tidspunkt: lys sommerkveld.");
  assert.equal(full("en"), "Evening image created with AI from a daytime photo. Time of day: light summer night.");
});

test("Stilkort: «Klar himmel» i stedet for «Klar blå time»", () => {
  assert.equal(codeText("nb", "duskSky", "clear"), "Klar himmel");
  assert.equal(codeText("en", "duskSky", "clear"), "Clear sky");
  assert.equal(codeText("nb", "roundSky", "clear"), "klar himmel");
  assert.equal(codeText("en", "roundSky", "clear"), "clear sky");
});

// --- Kontroll v2 ----------------------------------------------------------------

const KONTROLL2: [string, string, string, string, string][] = [
  ["window_removed", "vindu fjernet", "3 vinduer fjernet", "window removed", "3 windows removed"],
  ["door_removed", "dør fjernet", "3 dører fjernet", "door removed", "3 doors removed"],
  ["opening_removed", "åpning fjernet", "3 åpninger fjernet", "opening removed", "3 openings removed"],
  ["text_removed", "tekst eller nummer fjernet", "3 tekster eller numre fjernet", "text or number removed", "3 texts or numbers removed"],
  ["window_changed", "vindu endret", "3 vinduer endret", "window changed", "3 windows changed"],
  ["door_changed", "dør endret", "3 dører endret", "door changed", "3 doors changed"],
  ["opening_changed", "åpning endret", "3 åpninger endret", "opening changed", "3 openings changed"],
  ["text_changed", "tekst eller nummer endret", "3 tekster eller numre endret", "text or number changed", "3 texts or numbers changed"],
  [
    "element_unclear",
    "uklart om noe er endret",
    "3 steder der det er uklart om noe er endret",
    "unclear whether something changed",
    "3 places where it is unclear whether something changed",
  ],
  ["glass_removed", "glass fjernet", "glass fjernet på 3 steder", "glass removed", "glass removed in 3 places"],
  [
    "roof_or_wall_element_removed",
    "noe fjernet fra tak eller vegg",
    "3 ting fjernet fra tak eller vegg",
    "something removed from roof or wall",
    "3 things removed from roof or wall",
  ],
];

test("Kontroll v2: etikettene for de 11 kodene, entall og flertall, nb og en", () => {
  assert.equal(KONTROLL2.length, 11);
  for (const [type, nb1, nbN, en1, enN] of KONTROLL2) {
    assert.equal(additionTypeText("nb", type, 1), nb1, type);
    assert.equal(additionTypeText("nb", type, 3), nbN, type);
    assert.equal(additionTypeText("en", type, 1), en1, type);
    assert.equal(additionTypeText("en", type, 3), enN, type);
  }
  // De gamle kodene staar for eldre jobber.
  assert.equal(additionTypeText("nb", "new_window", 1), "nytt vindu");
  assert.equal(additionTypeText("nb", "glass_in_door", 2), "glass i 2 dører");
});

test("Kontroll v2: overskriften og knappen sier «endringer»", () => {
  const item = (type: string): AdditionItem => ({ kind: "warning", type, box: null, confidence: null, location: null });
  assert.equal(
    additionsSentences("nb", { level: "warning", items: [item("window_removed"), item("glass_removed"), item("glass_removed")] }).warning,
    "Kontrollen fant mulige endringer: vindu fjernet og glass fjernet på 2 steder. Se markeringene i bildet."
  );
  assert.equal(
    additionsSentences("en", { level: "warning", items: [item("door_changed")] }).warning,
    "The check found possible changes: door changed. See the markings in the image."
  );
  assert.equal(t("nb", "additions.show"), "Vis mulige endringer");
  assert.equal(t("nb", "additions.listLabel"), "Mulige endringer i bildet");
  assert.equal(t("en", "additions.show"), "Show possible changes");
  assert.equal(t("en", "additions.listLabel"), "Possible changes in the image");
});
