import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { adminView, showDetails } from "./roles.ts";
import { compareVariants, variantLabel, type CompareImages } from "./compare.ts";
import { canShowMarkers, lightMarkers, litLights } from "./lightsView.ts";
import { duskLine } from "./dusk.ts";
import type { Lights } from "./correction.ts";
import type { LightBox, LightState, ReviewLight, RoundChoices } from "./api.ts";

// TG-NEW-193 (Petter 10.10, «ja til alle»): megleren (uten view_all) ser bare
// det hen maa ta stilling til. Admin (view_all) ser alt som foer.
const APP = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");
/** Uten kommentarer, saa en kommentar ikke kan oppfylle eller bryte en sjekk. */
const code = (rel: string) => read(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const page = code("(app)/godkjenning/[jobId]/page.tsx");
const mood = code("components/godkjenning/MoodPanel.tsx");
const correction = code("components/godkjenning/CorrectionPanel.tsx");
const markers = code("components/godkjenning/LightMarkers.tsx");
const picker = code("components/godkjenning/VariantPicker.tsx");

// ---------------------------------------------------------------------------
// Rollen: samme view_all-sjekk som «Detaljer».
// ---------------------------------------------------------------------------

test("TG193: adminView er view_all, som showDetails; mangler svaret er det megler", () => {
  assert.equal(adminView({ viewAll: true }), true);
  assert.equal(adminView({ viewAll: false }), false);
  assert.equal(adminView(null), false);
  for (const caps of [{ viewAll: true }, { viewAll: false }, null]) {
    assert.equal(showDetails(caps), adminView(caps));
  }
});

test("TG193: siden regner admin fra caps med adminView, én gang", () => {
  assert.match(page, /const admin = adminView\(caps\);/);
  assert.equal(page.match(/adminView\(/g)?.length, 1);
});

// ---------------------------------------------------------------------------
// #3 Job-id: bare admin.
// ---------------------------------------------------------------------------

test("TG193 #3: job-id-en vises bare for admin", () => {
  assert.match(page, /\{admin && <p className="text-ink-2 text-xs font-mono break-all">\{jobId\}<\/p>\}/);
  // Ingen annen visning av jobId i siden (nedlastingen faar review.jobId som prop).
  assert.equal(page.match(/>\{jobId\}</g)?.length, 1);
});

// ---------------------------------------------------------------------------
// #7 Rundeetiketten: «Runde N · nå» for megler, valgene for admin.
// ---------------------------------------------------------------------------

const CHOICES: RoundChoices = {
  time: "early",
  sky: "light_clouds",
  skyApplied: false,
  fireplaceFire: "yes",
  lightsChanged: true,
};

function images(): CompareImages {
  return {
    previewUrl: null,
    rawPreviewUrl: null,
    previous: null,
    rounds: [
      { round: 0, current: false, previewUrl: "https://x/r0.jpg", rawPreviewUrl: null, choices: CHOICES },
      { round: 1, current: true, previewUrl: "https://x/r1.jpg", rawPreviewUrl: null, choices: { ...CHOICES, skyApplied: true } },
    ],
  };
}

test("TG193 #7: megleren ser «Runde N · nå» uten valgene i parentes", () => {
  const vs = compareVariants(images(), { isAdmin: false });
  assert.equal(variantLabel("nb", vs[0], { choices: false }), "Runde 2 · nå");
  assert.equal(variantLabel("nb", vs[1], { choices: false }), "Runde 1");
  assert.equal(variantLabel("en", vs[0], { choices: false }), "Round 2 · now");
});

test("TG193 #7: admin beholder dagens etikett med valgene", () => {
  const vs = compareVariants(images(), { isAdmin: true });
  assert.equal(variantLabel("nb", vs[0], { choices: true }), "Runde 2 · nå (tidlig, lette skyer, peis tent, lys justert)");
  assert.equal(variantLabel("nb", vs[1], { choices: true }), "Runde 1 (tidlig, uten himmel, peis tent, lys justert)");
});

test("TG193 #7: siden og variantvalget sender choices = admin", () => {
  assert.equal(page.match(/variantLabel\(locale, shown, \{ choices: admin \}\)/g)?.length, 2);
  assert.doesNotMatch(page, /variantLabel\(locale, shown\)/);
  assert.match(page, /<VariantPicker[\s\S]*?choices=\{admin\}[\s\S]*?\/>/);
  assert.match(picker, /\{variantLabel\(locale, v, \{ choices \}\)\}/);
});

// ---------------------------------------------------------------------------
// #9 «Vis lampene i bildet»: megleren ser bare lampene som tennes.
// ---------------------------------------------------------------------------

function lamp(key: string, type: string, box: LightBox | null, state: LightState): ReviewLight {
  return { key, id: key, run: null, type, location: null, box, reasonCode: null, editable: true, state };
}

function mixed(): Lights {
  return {
    approved: [
      lamp("L1", "pendant", [100, 700, 200, 800], "approved"),
      lamp("L2", "pendant", [100, 100, 200, 200], "disabled"),
      lamp("L6", "spotlight", null, "approved"),
    ],
    unstable: [lamp("r2:L3", "pendant", [100, 400, 200, 500], "candidate")],
    rejected: [lamp("r1:L4", "spotlight", [500, 500, 600, 600], "promoted"), lamp("r1:L5", "spotlight", [1, 1, 2, 2], "candidate")],
  };
}

test("TG193 #9: megleren faar bare lampene i «Lys som tennes», ingen usikre, og samme navn som admin", () => {
  const l = mixed();
  const lit = lightMarkers(l, { litOnly: true });
  assert.deepEqual(
    lit.markers.map((m) => [m.light.key, m.letter, m.uncertain]),
    [
      ["L1", "A", false],
      // Slaatt paa av megleren (promoted) blant de avviste: tennes, og er ikke «Usikker».
      ["r1:L4", "B", false],
    ]
  );
  // Samme lys som i «Lys som tennes» (de med boks).
  assert.deepEqual(
    lit.markers.map((m) => m.light.key),
    litLights(l).filter((x) => x.box !== null).map((x) => x.key)
  );
  // Nummeret telles over hele lista, som for admin: «Pendel 3» er den samme lampen.
  const all = lightMarkers(l, { litOnly: false });
  const nameAll = new Map(all.markers.map((m) => [m.light.key, m.name]));
  for (const m of lit.markers) assert.deepEqual(m.name, nameAll.get(m.light.key));
  assert.equal(lit.withoutBox, 1);
});

test("TG193 #9: admin ser alle lampene som foer, med usikre og lys uten boks", () => {
  const all = lightMarkers(mixed(), { litOnly: false });
  assert.deepEqual(
    all.markers.map((m) => [m.light.key, m.uncertain]),
    [
      ["L1", false],
      ["L2", false],
      ["r2:L3", true],
      ["r1:L4", true],
      ["r1:L5", true],
    ]
  );
  assert.equal(all.withoutBox, 1);
});

test("TG193 #9: knappen for megler krever at et lys som tennes har boks", () => {
  const onlyUnlitBoxed: Lights = {
    approved: [lamp("L1", "pendant", null, "approved")],
    unstable: [lamp("r2:L3", "pendant", [1, 2, 3, 4], "candidate")],
    rejected: [],
  };
  const review = (lights: Lights) =>
    ({ images: { originalUrl: "https://x/o.jpg" }, lights, mediaDeletedAt: null }) as Parameters<typeof canShowMarkers>[0];
  assert.equal(canShowMarkers(review(onlyUnlitBoxed), { litOnly: true }), false);
  assert.equal(canShowMarkers(review(onlyUnlitBoxed), { litOnly: false }), true);
  assert.equal(canShowMarkers(review(mixed()), { litOnly: true }), true);
});

test("TG193 #9: siden gir litOnly = !admin; forklaringen og «uten plassering» bare for admin", () => {
  assert.match(page, /canShowMarkers\(review, \{ litOnly: !admin \}\)/);
  assert.match(page, /<LightMarkers[\s\S]*?litOnly=\{!admin\}[\s\S]*?\/>/);
  assert.match(markers, /lightMarkers\(lights, \{ litOnly \}\)/);
  // Stilene (fylt/stiplet) og antallet uten plassering staar bak !litOnly.
  const legend = markers.indexOf('t(locale, "markers.styleUncertain")');
  const guard = markers.lastIndexOf("{!litOnly && (", legend);
  assert.ok(guard !== -1 && markers.indexOf('t(locale, "markers.styleSure")') > guard, "forklaringen bak !litOnly");
  assert.match(markers, /\{!litOnly && withoutBox > 0 && <p className="text-xs text-ink-2">\{t\(locale, "markers\.noBox"/);
});

// ---------------------------------------------------------------------------
// #13 Grunnen til at jobben venter: bare admin.
// ---------------------------------------------------------------------------

test("TG193 #13: grunnen (review.code) sendes bare til handlingskortet for admin", () => {
  assert.match(page, /reviewCode=\{admin \? review\.code : null\}/);
  assert.doesNotMatch(page, /reviewCode=\{review\.code\}/);
  // Kortet viser ingenting naar koden er null.
  const card = code("components/godkjenning/DecisionCard.tsx");
  assert.match(card, /\{reviewCode !== null && <p className="text-sm text-ink">\{codeText\(locale, "reviewCode", reviewCode\)\}<\/p>\}/);
});

// ---------------------------------------------------------------------------
// #21 «Usikker» i rettingen: bare admin. Bryterne staar.
// ---------------------------------------------------------------------------

test("TG193 #21: «Usikker» i rettingen bare for admin; bryterne og kandidat-flagget er uendret", () => {
  assert.match(correction, /uncertain=\{admin && uncertain\}/);
  assert.match(correction, /onToggle\(light, uncertain, e\.target\.checked\)/);
  assert.match(correction, /const editable = canToggle\(light, uncertain\);/);
  assert.match(page, /<CorrectionPanel[\s\S]*?admin=\{admin\}[\s\S]*?\/>/);
});

// ---------------------------------------------------------------------------
// #26-29 «Stemning og lys»: én kort linje for megler, uten «ikke brukt» og peis.
// ---------------------------------------------------------------------------

test("TG193 #26-28: megleren faar valgene som koder, uten himmel naar den ikke ble brukt", () => {
  assert.deepEqual(duskLine({ time: "early", sky: "clear", skyApplied: true }), { time: "early", sky: "clear" });
  assert.deepEqual(duskLine({ time: "early", sky: "clear", skyApplied: null }), { time: "early", sky: "clear" });
  assert.deepEqual(duskLine({ time: "late", sky: "starry", skyApplied: false }), { time: "late", sky: null });
  assert.deepEqual(duskLine({ time: null, sky: "dark", skyApplied: true }), { time: null, sky: "dark" });
  assert.equal(duskLine({ time: null, sky: "dark", skyApplied: false }), null);
  assert.equal(duskLine(null), null);
});

test("TG193 #26-29: MoodPanel viser linja for megler og dagens visning og peisen bare for admin", () => {
  assert.match(page, /<MoodPanel review=\{review\} admin=\{admin\} locale=\{locale\} \/>/);
  assert.match(mood, /const facts = admin \? duskFacts\(review\.dusk\) : null;/);
  assert.match(mood, /const line = admin \? null : duskLine\(review\.dusk\);/);
  assert.match(mood, /admin && \(review\.fireplace\.answer === "yes" \|\| review\.fireplace\.answer === "no"\)/);
  // «ikke brukt» og peisen leses bare i admin-grenene (facts og fire).
  const lineBlock = mood.slice(mood.indexOf("{line !== null && ("), mood.indexOf("{fire !== null && ("));
  assert.ok(lineBlock.length > 0);
  assert.match(lineBlock, /codeText\(locale, "duskTime", line\.time\)/);
  assert.match(lineBlock, /codeText\(locale, "duskSky", line\.sky\)/);
  assert.match(lineBlock, /\.join\(" · "\)/);
  assert.doesNotMatch(lineBlock, /duskSkyNotApplied|fireplace/);
  // «Lys som tennes» er uendret for alle.
  assert.match(mood, /t\(locale, "review\.lightsLit"\)/);
});
