import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ENABLED,
  EXPRESS_V2_PATH,
  STAGING_PATH,
  expressCategories,
  isPageEnabled,
  isServiceEnabled,
  navLinks,
} from "./services.ts";
import { DICTIONARIES } from "./i18n/index.ts";

// TG-NEW-136 (L0): Klart vaer, Magic Cleanup og Virtual Staging er skjult til
// de er merket. Privacy Blur og skumring er som foer.

const APP_DIR = fileURLToPath(new URL("..", import.meta.url));

/** Alle .ts/.tsx under app/, uten testfilene. */
function sourceFiles(dir = APP_DIR): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(path));
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(path);
  }
  return out;
}

const read = (rel: string) => readFileSync(join(APP_DIR, rel), "utf8");

test("konstanten: de tre tjenestene er av, privacy_blur og skumring er paa", () => {
  for (const id of ["klart_vaer", "magic_cleanup", "virtual_stage", "express_v2"]) {
    assert.equal(isServiceEnabled(id), false, id);
  }
  assert.equal(isServiceEnabled("privacy_blur"), true);
  assert.equal(isServiceEnabled("skumring"), true);
  assert.equal(ENABLED.magic_cleanup, false);
});

test("ukjent tjeneste er av", () => {
  assert.equal(isServiceEnabled("lawn_green"), false);
  assert.equal(isServiceEnabled(""), false);
  assert.equal(isServiceEnabled("toString"), false);
});

test("Express har ikke Klart vaer eller Magic Cleanup, men har Privacy Blur og skumring", () => {
  const tools = expressCategories().flatMap((c) => c.items);
  const ids = tools.map((t) => t.id);
  assert.ok(!ids.includes("klart_vaer"));
  assert.ok(!ids.includes("magic_cleanup"));
  assert.ok(!ids.includes("virtual_stage"));
  assert.ok(ids.includes("privacy_blur"));
  assert.ok(ids.includes("skumring"));
  // Ingen scene_transform-kort med preset klart_vaer (nivaa 1) under et annet navn.
  assert.ok(!tools.some((t) => t.presetId === "klart_vaer"));
  // Skumring sendes som foer.
  const dusk = tools.find((t) => t.id === "skumring");
  assert.equal(dusk?.service, "scene_transform");
  assert.equal(dusk?.presetId, "skumring");
  // Ingen tom kategori.
  for (const c of expressCategories()) assert.ok(c.items.length > 0, c.id);
});

test("menyen har ingen lenke til /staging eller /express-v2, men lenkene som ikke er tjenester", () => {
  const hrefs = navLinks().map((l) => l.href);
  assert.ok(!hrefs.includes(STAGING_PATH));
  assert.ok(!hrefs.includes(EXPRESS_V2_PATH));
  for (const h of ["/express", "/video", "/copywriter", "/orders", "/history"]) {
    assert.ok(hrefs.includes(h), h);
  }
});

test("ingen side har lenke til /staging eller /express-v2 skrevet rett inn", () => {
  // Alle lenker til sidene skal gaa via STAGING_PATH/EXPRESS_V2_PATH og
  // isPageEnabled, ikke som en fast streng i en side eller komponent.
  const pattern = /["'`](\/staging|\/express-v2)["'`?#/]/;
  for (const file of sourceFiles().filter((f) => f.endsWith(".tsx"))) {
    assert.doesNotMatch(readFileSync(file, "utf8"), pattern, file);
  }
});

test("/staging og /express-v2: sidelogikken gir «ikke tilgjengelig» og starter ingen jobb", () => {
  assert.equal(isPageEnabled(STAGING_PATH), false);
  assert.equal(isPageEnabled(EXPRESS_V2_PATH), false);
  assert.equal(isPageEnabled("/express"), true);
  assert.equal(isPageEnabled("/history"), true);

  for (const [rel, path] of [
    ["staging/page.tsx", "STAGING_PATH"],
    ["express-v2/page.tsx", "EXPRESS_V2_PATH"],
  ] as const) {
    const src = read(rel);
    const start = src.indexOf("export default function");
    assert.ok(start >= 0, rel);
    const body = src.slice(start, src.indexOf("\n}\n", start));
    // Den tidlige returen staar foerst, og den eksporterte komponenten
    // kaller ingen hooks: hookene (og dermed jobbene) ligger i innholdet.
    assert.match(body, new RegExp(`if \\(!isPageEnabled\\(${path}\\)\\) return <ServiceUnavailable />;`), rel);
    assert.doesNotMatch(body, /\buse[A-Z]\w*\(/, rel);
    assert.doesNotMatch(body, /submitJob|\.run\(/, rel);
  }

  const unavailable = read("components/ServiceUnavailable.tsx");
  assert.doesNotMatch(unavailable, /lib\/api|submitJob|fetch\(/);
});

test("debug-siden er slettet, og ingen lenke peker dit", () => {
  assert.equal(existsSync(join(APP_DIR, "scene-transform-debug")), false);
  const pattern = /["'`]\/scene-transform-debug/;
  for (const file of sourceFiles()) {
    assert.doesNotMatch(readFileSync(file, "utf8"), pattern, file);
  }
  assert.ok(!navLinks().some((l) => l.href.includes("scene-transform-debug")));
});

test("meldingen paa stengte sider: nb og en har noeklene", () => {
  for (const locale of ["nb", "en"] as const) {
    for (const key of ["unavailable.title", "unavailable.body", "unavailable.toExpress"] as const) {
      assert.ok(DICTIONARIES[locale].ui[key].trim().length > 0, `${locale} ${key}`);
    }
  }
  assert.equal(DICTIONARIES.nb.ui["unavailable.body"], "Denne tjenesten er midlertidig ikke tilgjengelig.");
});
