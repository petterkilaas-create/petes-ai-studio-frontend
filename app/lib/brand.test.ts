import { test } from "node:test";
import assert from "node:assert/strict";
import { brandCssVars, contrastRatio, DEFAULT_BRAND, MIN_CONTRAST, PAPER, resolveBrand } from "./brand.ts";

// Redesign D0 (brief v4 §13, §3 punkt 8): merket fra ett sted, med
// kontrastsjekk paa fargene et foretak kan overstyre.

const near = (actual: number, expected: number, label: string) =>
  assert.ok(Math.abs(actual - expected) < 0.05, `${label}: ${actual.toFixed(2)} != ${expected}`);

test("contrastRatio: kjente par (WCAG 2.x)", () => {
  near(contrastRatio("#000000", "#FFFFFF"), 21, "svart/hvit");
  near(contrastRatio("#FFFFFF", "#000000"), 21, "rekkefoelgen spiller ingen rolle");
  near(contrastRatio("#777777", "#777777"), 1, "lik farge");
  near(contrastRatio("#000", "#fff"), 21, "kort hex");
  // Fra §8: primary med hvit tekst ca. 16:1 (17,0), ink-2 paa paper ca. 6:1.
  near(contrastRatio("#1D1C1A", "#FFFFFF"), 17.03, "primary/hvit");
  near(contrastRatio("#5F5A52", PAPER), 6.11, "ink-2/paper");
  near(contrastRatio("#6E4508", "#F6E8CF"), 6.9, "amber");
});

test("contrastRatio kaster ved ugyldig farge", () => {
  assert.throws(() => contrastRatio("red", "#FFFFFF"));
  assert.throws(() => contrastRatio("#12345", "#FFFFFF"));
});

test("DEFAULT_BRAND bestaar selv valideringen", () => {
  const c = DEFAULT_BRAND.colors;
  assert.ok(contrastRatio(c.primary, c.onPrimary) >= MIN_CONTRAST, "onPrimary paa primary");
  assert.ok(contrastRatio(c.primary, PAPER) >= MIN_CONTRAST, "primary mot paper");
  assert.ok(contrastRatio(c.accent, PAPER) >= MIN_CONTRAST, "accent mot paper");
  assert.deepEqual(resolveBrand({ colors: c }), DEFAULT_BRAND);
  assert.deepEqual(resolveBrand(null), DEFAULT_BRAND);
});

test("resolveBrand godtar et merke med god kontrast", () => {
  const b = resolveBrand({
    displayName: "Kjeden Studio",
    logoUrl: "https://example.com/logo.svg",
    colors: { primary: "#0b3d91", onPrimary: "#fff", accent: "#7A1F5C" },
  });
  assert.equal(b.displayName, "Kjeden Studio");
  assert.equal(b.logo.url, "https://example.com/logo.svg");
  assert.deepEqual(b.colors, { primary: "#0B3D91", onPrimary: "#FFFFFF", accent: "#7A1F5C" });
});

test("resolveBrand avviser primary under 4,5:1 og faller tilbake til standardparet", () => {
  // Dagens teal: 3,5:1 mot paper og 3,9:1 med hvit tekst.
  const b = resolveBrand({ colors: { primary: "#009183", onPrimary: "#FFFFFF" } });
  assert.equal(b.colors.primary, DEFAULT_BRAND.colors.primary);
  assert.equal(b.colors.onPrimary, DEFAULT_BRAND.colors.onPrimary);
});

test("resolveBrand avviser svak tekst paa primary som et par", () => {
  const b = resolveBrand({ colors: { primary: "#0B3D91", onPrimary: "#3A5FA0" } });
  assert.equal(b.colors.primary, DEFAULT_BRAND.colors.primary);
  assert.equal(b.colors.onPrimary, DEFAULT_BRAND.colors.onPrimary);
});

test("resolveBrand: svak accent eller ugyldig hex gir standard, aldri feil", () => {
  assert.equal(resolveBrand({ colors: { accent: "#CFC8BB" } }).colors.accent, DEFAULT_BRAND.colors.accent);
  assert.equal(resolveBrand({ colors: { accent: "teal" } }).colors.accent, DEFAULT_BRAND.colors.accent);
  assert.deepEqual(resolveBrand({ colors: { primary: 42, onPrimary: null } }).colors, DEFAULT_BRAND.colors);
  assert.equal(resolveBrand({ displayName: "   " }).displayName, DEFAULT_BRAND.displayName);
});

test("brandCssVars gir de tre overstyrbare variablene", () => {
  assert.deepEqual(brandCssVars(DEFAULT_BRAND), {
    "--brand-primary": "#1D1C1A",
    "--brand-on-primary": "#FFFFFF",
    "--brand-accent": "#1D1C1A",
  });
});
