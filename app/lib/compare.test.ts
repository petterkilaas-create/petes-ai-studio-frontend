import { test } from "node:test";
import assert from "node:assert/strict";
import {
  compareVariants,
  defaultVariant,
  selectedVariant,
  variantLabel,
  type CompareImages,
} from "./compare.ts";
import type { ReviewRound, RoundChoices } from "./api";

/** Variantene fra images.rounds (D2a, KONTRAKT_RUNDER). */

const CHOICES: RoundChoices = {
  time: "early",
  sky: "light_clouds",
  skyApplied: true,
  fireplaceFire: null,
  lightsChanged: false,
};

function round(n: number, extra: Partial<ReviewRound> = {}): ReviewRound {
  return {
    round: n,
    current: false,
    previewUrl: `p${n}.jpg`,
    rawPreviewUrl: null,
    choices: CHOICES,
    ...extra,
  };
}

/** De gamle feltene har egne verdier, saa et tilbakefall til dem synes i testene. */
function images(rounds: ReviewRound[] | null, extra: Partial<CompareImages> = {}): CompareImages {
  return {
    previewUrl: "top-preview.jpg",
    rawPreviewUrl: "top-raw.jpg",
    previous: { previewUrl: "top-previous.jpg" },
    rounds,
    ...extra,
  };
}

const urls = (vs: ReturnType<typeof compareVariants>) =>
  vs.map((v) => (v.source.kind === "round" ? v.source.url : `legacy:${v.source.variant}`));

test("rundene kommer nyeste foerst, ogsaa naar backend sender eldste foerst og har hull", () => {
  const vs = compareVariants(images([round(0), round(3, { current: true }), round(1)]), { isAdmin: false });
  assert.deepEqual(vs.map((v) => v.id), ["r3", "r1", "r0"]);
  assert.deepEqual(urls(vs), ["p3.jpg", "p1.jpg", "p0.jpg"]);
});

test("et rundenummer som staar to ganger, tas med bare foerste gang", () => {
  const vs = compareVariants(images([round(0), round(0, { previewUrl: "dup.jpg" })]), { isAdmin: false });
  assert.deepEqual(urls(vs), ["p0.jpg"]);
});

test("«nå» staar bare paa gjeldende runde, og den vises foerst", () => {
  const vs = compareVariants(images([round(0), round(1, { current: true })]), { isAdmin: false });
  assert.deepEqual(vs.map((v) => v.current), [true, false]);
  assert.equal(defaultVariant(vs)?.id, "r1");
  assert.equal(variantLabel("nb", vs[0]), "Runde 2 · nå (tidlig, lette skyer)");
  assert.equal(variantLabel("nb", vs[1]), "Runde 1 (tidlig, lette skyer)");
});

test("uten gjeldende runde (running): ingen «nå», og den nyeste vises", () => {
  const vs = compareVariants(images([round(0), round(1)]), { isAdmin: false });
  assert.ok(vs.every((v) => !v.current));
  assert.equal(defaultVariant(vs)?.id, "r1");
  assert.ok(!variantLabel("nb", vs[0]).includes("nå"));
});

test("selectedVariant: ukjent id gir gjeldende runde", () => {
  const vs = compareVariants(images([round(0), round(1, { current: true })]), { isAdmin: false });
  assert.equal(selectedVariant(vs, "r0")?.id, "r0");
  assert.equal(selectedVariant(vs, "r7")?.id, "r1");
  assert.equal(selectedVariant(vs, null)?.id, "r1");
  assert.equal(selectedVariant([], null), null);
});

test("etikettene lages fra choices, paa nb og en", () => {
  const r = (choices: Partial<RoundChoices>) =>
    compareVariants(images([round(0, { current: true, choices: { ...CHOICES, ...choices } })]), {
      isAdmin: false,
    })[0];
  assert.equal(variantLabel("nb", r({ sky: "clear" })), "Runde 1 · nå (tidlig, klar blå time)");
  assert.equal(variantLabel("en", r({ sky: "clear" })), "Round 1 · now (early, clear blue hour)");
  assert.equal(variantLabel("nb", r({ time: "late", sky: "starry" })), "Runde 1 · nå (sen, stjernehimmel)");
  assert.equal(variantLabel("nb", r({ skyApplied: false })), "Runde 1 · nå (tidlig, uten himmel)");
  assert.equal(variantLabel("en", r({ skyApplied: false })), "Round 1 · now (early, no sky)");
  assert.equal(variantLabel("nb", r({ lightsChanged: true })), "Runde 1 · nå (tidlig, lette skyer, lys justert)");
  assert.equal(variantLabel("en", r({ lightsChanged: true })), "Round 1 · now (early, light clouds, lights adjusted)");
  assert.equal(variantLabel("nb", r({ fireplaceFire: "yes" })), "Runde 1 · nå (tidlig, lette skyer, peis tent)");
  assert.equal(variantLabel("nb", r({ fireplaceFire: "no" })), "Runde 1 · nå (tidlig, lette skyer, peis ikke tent)");
  // Ukjent kode gir generisk tekst, aldri koden selv.
  assert.equal(variantLabel("nb", r({ sky: "neon" })), "Runde 1 · nå (tidlig, ukjent himmel)");
  const none = compareVariants(images([round(0, { current: true, choices: null })]), { isAdmin: false })[0];
  assert.equal(variantLabel("nb", none), "Runde 1 · nå");
});

test("rått bare for admin, nyeste foerst etter de vanlige rundene", () => {
  const rounds = [
    round(0, { rawPreviewUrl: "raw0.jpg" }),
    round(1, { current: true, rawPreviewUrl: "raw1.jpg" }),
  ];
  const admin = compareVariants(images(rounds), { isAdmin: true });
  assert.deepEqual(admin.map((v) => v.id), ["r1", "r0", "r1-raw", "r0-raw"]);
  assert.deepEqual(urls(admin), ["p1.jpg", "p0.jpg", "raw1.jpg", "raw0.jpg"]);
  assert.equal(variantLabel("nb", admin[2]), "Runde 2 · rått fra modellen");
  assert.equal(variantLabel("en", admin[3]), "Round 1 · raw from the model");
  assert.equal(defaultVariant(admin)?.id, "r1", "rått er aldri standard");
  // Megler: ingen rå variant, ogsaa om backend skulle sende en lenke.
  const owner = compareVariants(images(rounds), { isAdmin: false });
  assert.ok(owner.every((v) => !v.raw));
  assert.ok(!urls(owner).some((u) => u?.includes("raw")));
});

test("null-lenke gir plassholder (null), aldri tilbakefall til andre felt", () => {
  const rounds = [round(0, { previewUrl: null }), round(1, { current: true, previewUrl: null })];
  const vs = compareVariants(images(rounds), { isAdmin: true });
  assert.deepEqual(urls(vs), [null, null, null, null]);
  for (const v of vs) {
    assert.equal(v.source.kind, "round");
  }
});

test("rounds er tom (needs_review): ingen varianter, bare originalen", () => {
  assert.deepEqual(compareVariants(images([]), { isAdmin: true }), []);
  assert.equal(defaultVariant([]), null);
});

test("gamle jobber uten rounds bruker de merkede feltene som foer", () => {
  const owner = compareVariants(images(null, { rawPreviewUrl: null }), { isAdmin: false });
  assert.deepEqual(owner.map((v) => v.id), ["legacy-lifted", "legacy-previous"]);
  assert.deepEqual(urls(owner), ["legacy:lifted", "legacy:previous"]);
  assert.equal(variantLabel("nb", owner[0]), "Løftet");
  assert.equal(variantLabel("nb", owner[1]), "Forrige runde");
  // Uten forrige runde: bare gjeldende bilde, og ingen velger.
  const first = compareVariants(images(null, { rawPreviewUrl: null, previous: null }), { isAdmin: false });
  assert.deepEqual(first.map((v) => v.id), ["legacy-lifted"]);
  // Rått krever admin ogsaa her.
  assert.ok(!compareVariants(images(null), { isAdmin: false }).some((v) => v.raw));
  const admin = compareVariants(images(null), { isAdmin: true });
  assert.deepEqual(admin.map((v) => v.id), ["legacy-lifted", "legacy-raw", "legacy-previous"]);
  assert.equal(variantLabel("en", admin[1]), "Raw");
});
