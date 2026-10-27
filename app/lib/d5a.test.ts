import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { DICTIONARIES } from "./i18n/index.ts";
import { withoutComments } from "./testing/jsxText.ts";

// D-5a (Petter 25.10): bredere visning, «Hold for original», ett kryss og
// lysboksen paa PC og mobil. node --test kan ikke laste .tsx, saa kildene
// sjekkes som tekst (som i design.test.ts). Reglene selv er testet i
// checklist.test.ts, zoom.test.ts og tg199pr4.test.ts.

const APP_DIR = fileURLToPath(new URL("..", import.meta.url));
const REPO_DIR = fileURLToPath(new URL("../..", import.meta.url));
const code = (rel: string) => withoutComments(readFileSync(join(APP_DIR, rel), "utf8"));

const page = code("(app)/godkjenning/[jobId]/page.tsx");
const layout = code("(app)/layout.tsx");
const viewer = code("components/godkjenning/CompareViewer.tsx");
const lightbox = code("components/godkjenning/Lightbox.tsx");

// Petter 25.10 (AVVIK 2 b): bare godkjenningssiden er bredere; menyen er felles og staar paa 1152 px som de andre sidene.
test("D-5a1: siden er ca. 1360 px, menyen er uendret, og bildet har resten ved siden av en kolonne på 22rem", () => {
  assert.match(page, /<main className="max-w-\[1360px\] mx-auto w-full p-4 sm:p-8 /);
  assert.match(layout, /<div className="mx-auto flex h-16 max-w-6xl items-center /);
  assert.match(page, /<div className="grid grid-cols-1 lg:grid-cols-\[minmax\(0,1fr\)_22rem\] gap-6 items-start">/);
  assert.doesNotMatch(page, /lg:col-span-2|lg:grid-cols-3|max-w-6xl/);
});

test("D-5a1: «Hold for original» med trykk og hold og med mellomrom, bare med begge bildene", () => {
  const hold = viewer.slice(viewer.indexOf("function HoldButton"), viewer.indexOf("export function CompareViewer"));
  assert.match(hold, /aria-pressed=\{holding\}/);
  assert.match(hold, /onPointerDown=\{\(e\) => \{[\s\S]*?setPointerCapture\(e\.pointerId\);\s*onHold\(true\);/);
  for (const end of ["onPointerUp", "onPointerCancel", "onLostPointerCapture", "onBlur"]) {
    assert.match(hold, new RegExp(`${end}=\\{\\(\\) => onHold\\(false\\)\\}`), end);
  }
  assert.match(hold, /onKeyDown=\{\(e\) => \{\s*if \(e\.key !== " "\) return;\s*e\.preventDefault\(\);\s*if \(!e\.repeat\) onHold\(true\);/);
  assert.match(hold, /onKeyUp=\{\(e\) => \{\s*if \(e\.key !== " "\) return;\s*e\.preventDefault\(\);\s*onHold\(false\);/);
  assert.match(hold, /t\(locale, "compare\.hold"\)/);
  // Vises i slideren og «Kun resultat» med begge bildene, ikke side ved side eller med markoerene.
  assert.match(viewer, /const holdShown = canSlide && plain && shown !== "side";/);
  assert.match(viewer, /const held = holding && holdShown;/);
  // Slideren beholder verdien og viser hele originalen.
  assert.match(viewer, /clipPath: `inset\(0 \$\{full \? 0 : 100 - value\}% 0 0\)`/);
  assert.match(viewer, /full=\{held\}/);
});

test("D-5a2: krysset nullstilles ved ny henting, og siden velger lista ut fra oppskriften", () => {
  const fetch = page.slice(page.indexOf("const fetchReview"), page.indexOf("useEffect("));
  assert.match(fetch, /setCompared\(false\);/);
  assert.match(fetch, /setAcknowledged\(false\);/);
  assert.match(fetch, /setLightbox\(false\);/);
  assert.match(page, /checklist=\{checklistFor\(review\.presetId\)\}\s+compared=\{compared\}\s+onCompared=\{setCompared\}\s+acknowledged=\{acknowledged\}/);
  // Ingenting nytt sendes: buildDecision faar acknowledged som foer, ikke compared.
  assert.match(page, /buildDecision\(action, reasonText, answer, review, brightnessStep, acknowledged\)/);
  assert.doesNotMatch(page, /buildDecision\([^)]*compared/);
});

test("D-5b1: lysboksen er en <dialog> med showModal(), og siden gir den samme bilde, trinn og runder", () => {
  assert.match(lightbox, /<dialog\s+ref=\{dialogRef\}\s+aria-label=\{t\(locale, "lightbox\.title"\)\}\s+onKeyDown=\{onKeyDown\}/);
  assert.match(lightbox, /dialog\.showModal\(\);/);
  assert.match(lightbox, /dialog\.addEventListener\("close", close\);/);
  assert.doesNotMatch(lightbox, /requestFullscreen|window\.addEventListener/);
  assert.match(lightbox, /bg-darkroom/);
  assert.match(lightbox, /onClick=\{\(\) => setMode\(m\)\}/);
  // Siden: samme lenke som visningen (trinnet med), og rundene som en egen velger.
  assert.match(page, /onExpand=\{\(\) => setLightbox\(true\)\}/);
  assert.match(page, /<Lightbox\s+originalUrl=\{review\.images\.originalUrl\}\s+aiUrl=\{shownUrl\}/);
  assert.match(page, /rounds=\{\s*stripShown\(strip\) \? \(\s*<VersionStrip/);
  assert.match(viewer, /\{canSlide && onExpand !== undefined && \(/);
});

test("D-5b1: zoom med knapper og taster, tak på 200 %, og kartet", () => {
  for (const key of ["lightbox.zoomIn", "lightbox.zoomOut", "lightbox.zoomReset", "lightbox.close", "lightbox.map"]) {
    assert.match(lightbox, new RegExp(`aria-label=\\{t\\(locale, "${key.replace(".", "\\.")}"\\)\\}`), key);
  }
  assert.match(lightbox, /disabled=\{!ready \|\| scale >= ZOOM_MAX\}/);
  // Runde uten merket forhaandsvisning: plassholderen, aldri et umerket bilde (L2).
  assert.match(lightbox, /\{!ready && <div className="w-full max-w-xl">\{placeholder\}<\/div>\}/);
  assert.match(page, /placeholder=\{<PreviewPlaceholder \/>\}\s+rounds=/);
  // Tastene paa dialogen: zoomKey (+, −, 0), sliderKey for skillet, panKey uten skillet. Esc er dialogens egen.
  const keys = lightbox.slice(lightbox.indexOf("const onKeyDown"), lightbox.indexOf("const pinchNow"));
  assert.match(keys, /const zoomed = zoomKey\(view\.current, e\.key\);/);
  assert.match(keys, /const next = sliderKey\(split\.current, e\.key, e\.shiftKey\);/);
  assert.match(keys, /const panned = panKey\(view\.current, e\.key\);/);
  // Kartet kan brukes med tastaturet.
  assert.match(lightbox, /tabIndex=\{0\}\s+role="group"\s+aria-label=\{t\(locale, "lightbox\.map"\)\}\s+onKeyDown=\{onMapKeyDown\}/);
  // Skillet har rolle og verdier som paa siden (WCAG 2.5.7).
  for (const attr of ['role="slider"', "aria-valuemin={0}", "aria-valuemax={100}", "aria-valuenow={splitValue}", "aria-valuetext="]) {
    assert.ok(lightbox.includes(attr), attr);
  }
});

test("D-5b2: Pointer Events og touch-action: none, og bevegelsen via ref i requestAnimationFrame", () => {
  assert.match(lightbox, /touch-none/);
  assert.match(lightbox, /onPointerDown=\{onPointerDown\}\s+onPointerMove=\{onPointerMove\}\s+onPointerUp=\{onPointerEnd\}\s+onPointerCancel=\{onPointerEnd\}/);
  assert.match(lightbox, /frame\.current = requestAnimationFrame\(paint\)/);
  assert.match(lightbox, /el\.style\.transform = transform;/);
  // Ingen transform eller klipp fra React-state i JSX.
  assert.doesNotMatch(lightbox, /style=\{\{[^}]*(transform|clipPath)/);
  // To fingre og dobbelttrykk.
  assert.match(lightbox, /pinchView\(g\.start, g\.from, pinchNow\(g\.rect\)\)/);
  assert.match(lightbox, /isDoubleTap\(lastTap\.current, tap\)/);
});

test("D-5a: ingen nye avhengigheter", () => {
  const pkg = JSON.parse(readFileSync(join(REPO_DIR, "package.json"), "utf8")) as { dependencies: Record<string, string> };
  assert.deepEqual(Object.keys(pkg.dependencies).sort(), [
    "@clerk/localizations",
    "@clerk/nextjs",
    "lucide-react",
    "next",
    "react",
    "react-dom",
  ]);
});

test("D-5a: de nye ordene finnes på nb og en", () => {
  for (const key of [
    "compare.hold",
    "compare.expand",
    "lightbox.title",
    "lightbox.close",
    "lightbox.zoomIn",
    "lightbox.zoomOut",
    "lightbox.zoomReset",
    "lightbox.zoomValue",
    "lightbox.map",
    "lightbox.keys",
    "lightbox.touch",
  ] as const) {
    assert.ok(DICTIONARIES.nb.ui[key].length > 0, key);
    assert.ok(DICTIONARIES.en.ui[key].length > 0, key);
  }
  assert.equal(DICTIONARIES.nb.ui["compare.hold"], "Hold for original");
  assert.match(DICTIONARIES.nb.ui["lightbox.keys"], /Piltaster flytter skillet · \+ og − zoomer · 0 tilbakestiller · Esc lukker/);
});

// D-3 (live-sjekken av D-5a, Petter 25.10, valg L1): hintet kan ikke markeres ved
// dobbeltklikk eller dobbelttrykk. Paa berøringsskjerm (pointer: coarse) staar
// fingerhintet, ellers tastaturhintet; teksten er som foer.
test("D-3: lysboks-hintet har select-none, og berøringsskjerm får fingerhintet i stedet for tastaturhintet", () => {
  const keys = lightbox.match(/<p className="([^"]*)">\{t\(locale, "lightbox\.keys"\)\}<\/p>/);
  const touch = lightbox.match(/<p className="([^"]*)">\{t\(locale, "lightbox\.touch"\)\}<\/p>/);
  assert.ok(keys && touch);
  for (const cls of [keys[1], touch[1]]) {
    assert.match(cls, /\bselect-none\b/);
    assert.match(cls, /^hidden /);
  }
  assert.match(keys[1], /\bpointer-fine:block\b/);
  assert.doesNotMatch(keys[1], /pointer-coarse/);
  assert.match(touch[1], /\bpointer-coarse:block\b/);
  assert.doesNotMatch(touch[1], /pointer-fine/);
  assert.equal(
    DICTIONARIES.nb.ui["lightbox.touch"],
    "Dra i skillet · to fingre zoomer og flytter · dobbelttrykk tilbakestiller"
  );
});
