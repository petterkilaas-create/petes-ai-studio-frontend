import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  COPYWRITER_PATH,
  ENABLED,
  EXPRESS_V2_PATH,
  ORDERS_PATH,
  SERVICES_PATH,
  STAGING_PATH,
  VIDEO_PATH,
  expressCategories,
  isPageEnabled,
  isServiceEnabled,
  navLinks,
} from "./services.ts";
import { DICTIONARIES, type UiKey } from "./i18n/index.ts";

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
  // Vakt: finner den ingen filer (feil sti), skal testene feile, ikke gaa groent.
  if (dir === APP_DIR) assert.ok(out.length > 0, "fant ingen .ts/.tsx under app/");
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

test("Tjenester har ikke Klart vaer eller Magic Cleanup, men har Privacy Blur og skumring", () => {
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

test("menyen har Start, Tjenester og Historikk (TG-NEW-153)", () => {
  const hrefs = navLinks().map((l) => l.href);
  for (const h of [STAGING_PATH, EXPRESS_V2_PATH, VIDEO_PATH, COPYWRITER_PATH, ORDERS_PATH]) {
    assert.ok(!hrefs.includes(h), h);
  }
  assert.deepEqual(hrefs, ["/start", "/tjenester", "/history"]);
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
  assert.equal(isPageEnabled(SERVICES_PATH), true);
  assert.equal(isPageEnabled("/history"), true);

  for (const [rel, path] of [
    ["(app)/staging/page.tsx", "STAGING_PATH"],
    ["(app)/express-v2/page.tsx", "EXPRESS_V2_PATH"],
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
  assert.equal(existsSync(join(APP_DIR, "(app)", "scene-transform-debug")), false);
  const pattern = /["'`]\/scene-transform-debug/;
  for (const file of sourceFiles()) {
    assert.doesNotMatch(readFileSync(file, "utf8"), pattern, file);
  }
  assert.ok(!navLinks().some((l) => l.href.includes("scene-transform-debug")));
});

test("meldingen paa stengte sider: nb og en har noeklene", () => {
  for (const locale of ["nb", "en"] as const) {
    for (const key of ["unavailable.title", "unavailable.body", "unavailable.toServices"] as const) {
      assert.ok(DICTIONARIES[locale].ui[key].trim().length > 0, `${locale} ${key}`);
    }
  }
  assert.equal(DICTIONARIES.nb.ui["unavailable.body"], "Denne tjenesten er midlertidig ikke tilgjengelig.");
});

// ---------------------------------------------------------------------------
// Dag 33, L0b: Video, Copywriter og Orders er skjult, og forsiden lover bare
// det som leveres (skumring og Privacy Blur).
// ---------------------------------------------------------------------------

test("konstanten: video, copywriter og orders er av, Tjenester, Historikk og skumring er paa", () => {
  for (const id of ["video", "copywriter", "orders"]) {
    assert.equal(isServiceEnabled(id), false, id);
  }
  assert.equal(ENABLED.video, false);
  assert.equal(ENABLED.copywriter, false);
  assert.equal(ENABLED.orders, false);
  assert.equal(isServiceEnabled("skumring"), true);
  assert.equal(isPageEnabled(SERVICES_PATH), true);
  assert.equal(isPageEnabled("/history"), true);
  const hrefs = navLinks().map((l) => l.href);
  assert.ok(hrefs.includes(SERVICES_PATH));
  assert.ok(hrefs.includes("/history"));
});

test("ingen side har lenke til /video, /copywriter eller /orders skrevet rett inn", () => {
  const pattern = /["'`](\/video|\/copywriter|\/orders)["'`?#/]/;
  for (const file of sourceFiles().filter((f) => f.endsWith(".tsx"))) {
    assert.doesNotMatch(readFileSync(file, "utf8"), pattern, file);
  }
});

test("/video, /copywriter og /orders: stengt side gir «ikke tilgjengelig» og gjoer ingen kall", () => {
  for (const [rel, path, value] of [
    ["(app)/video/page.tsx", "VIDEO_PATH", VIDEO_PATH],
    ["(app)/copywriter/page.tsx", "COPYWRITER_PATH", COPYWRITER_PATH],
    ["(app)/orders/page.tsx", "ORDERS_PATH", ORDERS_PATH],
  ] as const) {
    assert.equal(isPageEnabled(value), false, rel);
    const src = read(rel);
    const start = src.indexOf("export default function");
    assert.ok(start >= 0, rel);
    const body = src.slice(start, src.indexOf("\n}\n", start));
    assert.match(body, new RegExp(`if \\(!isPageEnabled\\(${path}\\)\\) return <ServiceUnavailable />;`), rel);
    assert.doesNotMatch(body, /\buse[A-Z]\w*\(/, rel);
    assert.doesNotMatch(body, /fetch\(|supabase|API_BASE/, rel);
  }
});

const HOME_KEYS = [
  "home.title",
  "home.intro",
  "home.services.title",
  "home.services.desc",
  "home.services.cta",
  "express.subtitle",
] as const satisfies readonly UiKey[];

test("forsiden og Tjenester: teksten lover ikke video, Veo, HDR eller aarstider", () => {
  const forbidden = /video|veo|hdr|season|årstid|film|reel|klart vær|staging|copywrit/i;
  for (const locale of ["nb", "en"] as const) {
    for (const key of HOME_KEYS) {
      const text = DICTIONARIES[locale].ui[key];
      assert.ok(text.trim().length > 0, `${locale} ${key}`);
      assert.doesNotMatch(text, forbidden, `${locale} ${key}`);
    }
  }
  // Teksten staar i ordlista, ikke rett inn i sidene.
  assert.doesNotMatch(read("(app)/tjenester/page.tsx"), /seasonal/i);
  const home = read("(app)/start/page.tsx");
  for (const key of HOME_KEYS.filter((k) => k.startsWith("home."))) {
    // home.title faar navnet som variabel: t(locale, "home.title", { brand }).
    assert.ok(home.includes(`t(locale, "${key}"`), key);
  }
  assert.ok(read("(app)/tjenester/page.tsx").includes(`t(locale, "express.subtitle")`));
});

test("forsiden og Tjenester: nb og en har de samme noeklene", () => {
  const pick = (locale: "nb" | "en") =>
    Object.keys(DICTIONARIES[locale].ui)
      .filter((k) => k.startsWith("home.") || k.startsWith("express."))
      .sort();
  assert.deepEqual(pick("nb"), pick("en"));
  for (const key of HOME_KEYS) assert.ok(pick("nb").includes(key), key);
});

// ---------------------------------------------------------------------------
// TG-NEW-153 (dag 38): Express heter Tjenester (Petter 05.10). Adressen er
// /tjenester, og /express sendes dit med 307 fra next.config.ts.
// ---------------------------------------------------------------------------

test("TG-153: /express sendes til /tjenester med 307, og ingen regel treffer /express-v2", async () => {
  const { default: nextConfig } = await import("../../next.config.ts");
  assert.ok(nextConfig.redirects, "next.config.ts har redirects()");
  const rules = await nextConfig.redirects();
  assert.deepEqual(rules, [{ source: "/express", destination: SERVICES_PATH, permanent: false }]);
  assert.equal(SERVICES_PATH, "/tjenester");
  for (const rule of rules) {
    // Eksakt kilde uten parametre eller regex: treffer bare akkurat /express.
    assert.doesNotMatch(rule.source, /[:*()+?{}]/, rule.source);
    assert.notEqual(rule.source, EXPRESS_V2_PATH);
    assert.notEqual(rule.destination, rule.source);
  }
});

test("TG-153: siden ligger i (app)/tjenester, og (app)/express finnes ikke", () => {
  assert.ok(existsSync(join(APP_DIR, "(app)", "tjenester", "page.tsx")));
  assert.ok(existsSync(join(APP_DIR, "(app)", "tjenester", "layout.tsx")));
  assert.equal(existsSync(join(APP_DIR, "(app)", "express")), false);
  assert.ok(existsSync(join(APP_DIR, "(app)", "express-v2", "page.tsx")), "/express-v2 er urørt");
});

test("TG-153: ingen side har lenke til /express skrevet rett inn", () => {
  // /express-v2 er en annen side og har egen test over.
  const pattern = /["'`]\/express["'`?#/]/;
  for (const file of sourceFiles()) {
    assert.doesNotMatch(readFileSync(file, "utf8"), pattern, file);
  }
});

test("TG-153: ordlista sier Tjenester og Start, aldri Express, og de gamle noeklene er borte", () => {
  for (const locale of ["nb", "en"] as const) {
    const ui = DICTIONARIES[locale].ui as Record<string, string>;
    for (const [key, text] of Object.entries(ui)) {
      assert.doesNotMatch(text, /\bExpress\b/i, `${locale} ${key}`);
    }
    for (const old of ["nav.express", "nav.home", "history.toExpress", "unavailable.toExpress", "home.express.title"]) {
      assert.ok(!Object.hasOwn(ui, old), `${locale} ${old}`);
    }
  }
  const { nb, en } = DICTIONARIES;
  assert.equal(nb.ui["nav.start"], "Start");
  assert.equal(nb.ui["nav.services"], "Tjenester");
  assert.equal(nb.ui["express.title"], "Tjenester");
  assert.equal(nb.ui["history.toServices"], "Gå til Tjenester");
  assert.equal(nb.ui["unavailable.toServices"], "Gå til Tjenester");
  assert.equal(en.ui["nav.services"], "Services");
  assert.equal(en.ui["express.title"], "Services");
});

test("TG-153: lenkene til Tjenester bruker SERVICES_PATH", () => {
  for (const rel of ["(app)/start/page.tsx", "(app)/history/page.tsx", "components/ServiceUnavailable.tsx"]) {
    assert.match(read(rel), /href=\{SERVICES_PATH\}/, rel);
  }
});

test("TG-153: menyen viser bare ikonet under 640 px, og Start er ikke et hus", () => {
  const nav = read("components/AppNav.tsx");
  // Ordet for hver lenke er for skjermlesere under sm, og synlig fra sm.
  assert.match(nav, /<span className="sr-only sm:not-sr-only">\{t\(locale, `nav\.\$\{l\.id\}`\)\}<\/span>/);
  assert.match(nav, /<span className="sr-only sm:not-sr-only">\{t\(locale, "nav\.help"\)\}<\/span>/);
  // Lenkene er minst 44 x 44 px ogsaa uten ord.
  assert.equal((nav.match(/min-h-11 min-w-11/g) ?? []).length, 2);
  assert.match(nav, /start: LayoutDashboard,/);
  assert.match(nav, /services: LayoutGrid,/);
  assert.doesNotMatch(nav, /\b(House|Home)\b/);
});
