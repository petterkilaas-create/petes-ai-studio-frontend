import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ENABLED,
  EXPRESS_V2_PATH,
  SERVICES_PATH,
  STAGING_PATH,
  expressCategories,
  isPageEnabled,
  isServiceEnabled,
  navLinks,
  orderableTools,
  toolFromParam,
  visibleCategories,
} from "./services.ts";
import { DEFAULT_DUSK, duskParams, isDuskOrder } from "./dusk.ts";
import { DICTIONARIES, type UiKey } from "./i18n/index.ts";
import { withoutComments } from "./testing/jsxText.ts";

// TG-NEW-136 (L0): Magic Cleanup og Virtual Staging er skjult til de er
// merket. Privacy Blur og skumring er som foer. Klart vaer er aapnet i K3
// (Dag 47), merket i G2.

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

const ROOT_DIR = join(APP_DIR, "..");

/** Kode i hele repoet (.ts/.tsx/.js/.mjs/.cjs), uten node_modules, .next, .git og testfilene. */
function repoCodeFiles(dir = ROOT_DIR): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if ([".git", ".next", "node_modules"].includes(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...repoCodeFiles(path));
    else if (/\.(tsx?|[cm]?js)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(path);
  }
  if (dir === ROOT_DIR) {
    assert.ok(out.includes(join(ROOT_DIR, "proxy.ts")), "fant ikke proxy.ts paa rot");
    assert.ok(out.includes(join(APP_DIR, "lib", "services.ts")), "fant ikke app/lib/services.ts");
  }
  return out;
}

test("konstanten: de tre tjenestene er av, privacy_blur, skumring og klart_vaer er paa", () => {
  for (const id of ["magic_cleanup", "virtual_stage", "express_v2"]) {
    assert.equal(isServiceEnabled(id), false, id);
  }
  assert.equal(isServiceEnabled("privacy_blur"), true);
  assert.equal(isServiceEnabled("skumring"), true);
  assert.equal(isServiceEnabled("klart_vaer"), true);
  assert.equal(ENABLED.magic_cleanup, false);
});

test("ukjent tjeneste er av", () => {
  assert.equal(isServiceEnabled("lawn_green"), false);
  assert.equal(isServiceEnabled(""), false);
  assert.equal(isServiceEnabled("toString"), false);
});

test("Tjenester har ikke Magic Cleanup, men har Privacy Blur, skumring og Klart vaer", () => {
  const tools = expressCategories().flatMap((c) => c.items);
  const ids = tools.map((t) => t.id);
  assert.ok(!ids.includes("magic_cleanup"));
  assert.ok(!ids.includes("virtual_stage"));
  assert.ok(ids.includes("privacy_blur"));
  assert.ok(ids.includes("skumring"));
  assert.ok(ids.includes("klart_vaer"));
  // Bare ett kort med preset klart_vaer, og det er Blaa himmel-kortet.
  assert.deepEqual(tools.filter((t) => t.presetId === "klart_vaer").map((t) => t.id), ["klart_vaer"]);
  // Skumring sendes som foer.
  const dusk = tools.find((t) => t.id === "skumring");
  assert.equal(dusk?.service, "scene_transform");
  assert.equal(dusk?.presetId, "skumring");
  // Ingen tom kategori.
  for (const c of expressCategories()) assert.ok(c.items.length > 0, c.id);
});

test("menyen har Start, Tjenester og Historikk (TG-NEW-153)", () => {
  const hrefs = navLinks().map((l) => l.href);
  for (const h of [STAGING_PATH, EXPRESS_V2_PATH, "/video", "/copywriter", "/orders"]) {
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
// Dag 33, L0b: Video, Copywriter og Orders ble skjult. TG-NEW-142 (dag 39):
// sidene, supabaseClient.ts og pakkene er slettet (TG-NEW-72), og forsiden
// lover bare det som leveres (skumring og Privacy Blur).
// ---------------------------------------------------------------------------

test("TG-142: video, copywriter og orders er borte fra ENABLED og menyen", () => {
  for (const id of ["video", "copywriter", "orders"]) {
    assert.ok(!Object.keys(ENABLED).includes(id), id);
    assert.equal(isServiceEnabled(id), false, id);
  }
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

test("TG-142: sidene /video, /copywriter og /orders og supabaseClient.ts er slettet", () => {
  for (const d of ["video", "copywriter", "orders"]) {
    assert.equal(existsSync(join(APP_DIR, "(app)", d)), false, d);
    assert.equal(existsSync(join(APP_DIR, d)), false, d);
  }
  assert.equal(existsSync(join(ROOT_DIR, "supabaseClient.ts")), false);
});

test("TG-142: ingen kode importerer Supabase eller react-google-autocomplete, og pakkene er fjernet", () => {
  const pattern = /["'](@supabase\/supabase-js|@\/supabaseClient|react-google-autocomplete)["']|supabaseClient/;
  for (const file of repoCodeFiles()) {
    assert.doesNotMatch(readFileSync(file, "utf8"), pattern, file);
  }
  const pkg = JSON.parse(readFileSync(join(ROOT_DIR, "package.json"), "utf8"));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  for (const name of ["@supabase/supabase-js", "react-google-autocomplete"]) {
    assert.ok(!(name in deps), name);
  }
});

test("TG-142: ingen kode leser Supabase- eller Google Maps-noeklene", () => {
  const pattern = /NEXT_PUBLIC_SUPABASE_URL|NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY|NEXT_PUBLIC_GOOGLE_MAPS_API_KEY/;
  for (const file of repoCodeFiles()) {
    assert.doesNotMatch(readFileSync(file, "utf8"), pattern, file);
  }
});

test("TG-142: ingen kode har den gamle jobbadressen", () => {
  // Satt sammen her, saa testen ikke inneholder adressen selv.
  const needle = ["@diakrit", "com"].join(".");
  for (const file of repoCodeFiles()) {
    assert.ok(!readFileSync(file, "utf8").toLowerCase().includes(needle), file);
  }
});

const HOME_KEYS = [
  "home.title",
  "home.intro",
  "start.newOrder",
  "start.waiting.title",
  "start.waiting.empty",
  "start.waiting.more",
  "start.recent.title",
  "start.recent.all",
  "start.services.title",
  "start.services.lead",
  "start.services.open",
  "start.loading",
  "start.loadErrorTitle",
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
  // start.loading velges med net.waking: t(locale, waking ? "net.waking" : "start.loading").
  for (const key of HOME_KEYS.filter((k) => k.startsWith("start."))) {
    assert.ok(home.includes(`"${key}"`), key);
  }
  assert.ok(read("(app)/tjenester/page.tsx").includes(`t(locale, "express.subtitle")`));
});

test("forsiden og Tjenester: nb og en har de samme noeklene", () => {
  const pick = (locale: "nb" | "en") =>
    Object.keys(DICTIONARIES[locale].ui)
      .filter((k) => k.startsWith("home.") || k.startsWith("start.") || k.startsWith("express."))
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

// ---------------------------------------------------------------------------
// Dag 45, demo-porten: Tjenester viser alle tjenestene. De som ikke er slaatt
// paa, vises som «Kommer» og kan ikke bestilles. ENABLED er uendret.
// ---------------------------------------------------------------------------

test("dag 45: visibleCategories gir alle kortene i rekkefoelge, fire «Kommer» og tre bestillbare", () => {
  const cats = visibleCategories();
  assert.deepEqual(
    cats.map((c) => [c.id, c.items.map((t) => t.id)]),
    [
      ["timetraveler", ["skumring", "klart_vaer"]],
      ["fixit", ["magic_cleanup", "privacy_blur"]],
      ["furnishing", ["digital_styling"]],
      ["more", ["video", "copywriter"]],
    ]
  );
  const tools = cats.flatMap((c) => c.items);
  assert.deepEqual(tools.filter((t) => t.orderable).map((t) => t.id), ["skumring", "klart_vaer", "privacy_blur"]);
  assert.deepEqual(
    tools.filter((t) => !t.orderable).map((t) => t.id),
    ["magic_cleanup", "digital_styling", "video", "copywriter"]
  );
  // Ingen tom kategori, og orderable er det samme som ENABLED.
  for (const c of cats) assert.ok(c.items.length > 0, c.id);
  for (const t of tools) assert.equal(t.orderable, isServiceEnabled(t.id), t.id);
});

test("dag 45: det som kan bestilles og ?tjeneste= (Klart vaer aapnet i K3)", () => {
  assert.deepEqual(orderableTools().map((t) => t.id), ["skumring", "klart_vaer", "privacy_blur"]);
  assert.deepEqual(expressCategories().map((c) => c.id), ["timetraveler", "fixit"]);
  assert.deepEqual(toolFromParam("klart_vaer"), { categoryId: "timetraveler", toolId: "klart_vaer" });
  for (const id of ["magic_cleanup", "digital_styling", "virtual_stage", "video", "copywriter"]) {
    assert.equal(toolFromParam(id), null, id);
  }
  // De nye id-ene er ikke lagt inn i ENABLED, heller ikke som false.
  for (const id of ["digital_styling", "video", "copywriter"]) {
    assert.ok(!Object.keys(ENABLED).includes(id), id);
  }
});

test("dag 45: digital styling-kortet er uavhengig av ENABLED.virtual_stage og /staging", () => {
  const card = visibleCategories().flatMap((c) => c.items).find((t) => t.service === "virtual_stage");
  assert.ok(card);
  assert.equal(card.id, "digital_styling");
  assert.equal(card.kind, "simple");
  assert.equal(card.titleKey, "service.virtual_stage");
  assert.equal(card.orderable, false);
});

test("dag 45: hvert kort og hver kategori har tekst paa nb og en, og et ikon", () => {
  const icons = withoutComments(read("components/toolIcons.ts"));
  for (const c of visibleCategories()) {
    assert.match(icons, new RegExp(`^\\s*${c.id}: [A-Z]\\w+,$`, "m"), c.id);
    for (const t of c.items) {
      assert.match(icons, new RegExp(`^\\s*${t.id}: [A-Z]\\w+,$`, "m"), t.id);
      for (const locale of ["nb", "en"] as const) {
        const ui = DICTIONARIES[locale].ui;
        assert.ok(ui[t.titleKey].trim().length > 0, `${locale} ${t.titleKey}`);
        assert.ok(ui[t.descKey].trim().length > 0, `${locale} ${t.descKey}`);
      }
    }
    for (const locale of ["nb", "en"] as const) {
      assert.ok(DICTIONARIES[locale].ui[c.titleKey].trim().length > 0, `${locale} ${c.titleKey}`);
    }
  }
  assert.equal(DICTIONARIES.nb.ui["express.coming"], "Kommer");
  assert.equal(DICTIONARIES.en.ui["express.coming"], "Coming");
});

test("dag 45: «Kommer»-kortet er ikke en knapp, og bare bestillbare kort kan velges", () => {
  const page = withoutComments(read("(app)/tjenester/page.tsx"));
  assert.match(page, /const CATEGORIES = visibleCategories\(\);/);
  assert.doesNotMatch(page, /expressCategories/);
  // Valget slaas bare opp blant kortene som kan bestilles.
  assert.match(page, /\.find\(\(t\) => t\.orderable && t\.id === selectedToolId\)/);
  // Grenen for «Kommer» kommer foer knappen og har ingen onClick eller knapp.
  const start = page.indexOf("if (!tool.orderable) {");
  assert.ok(start > 0);
  const branch = page.slice(start, page.indexOf("return (", page.indexOf("</div>\n              );", start)));
  assert.match(branch, /role="group"/);
  assert.match(branch, /aria-disabled="true"/);
  assert.match(branch, /t\(locale, "express\.coming"\)/);
  assert.doesNotMatch(branch, /onClick|<button|href=|tabIndex|opacity-/);
});

// ---------------------------------------------------------------------------
// K3 (Dag 47): Klart vaer («Blaa himmel») er aapnet og gaar nivaa 2-veien.
// Port 1 og gate_kv i backend avgjoer bildetypen: ingen bildetypevelger og
// ingen skumringsvalg, og bestillingen sender bare preset_id.
// ---------------------------------------------------------------------------

test("K3: Klart vaer-kortet er bestillbart, uten bildetypevelger", () => {
  const tool = orderableTools().find((t) => t.id === "klart_vaer");
  assert.ok(tool);
  assert.equal(tool.service, "scene_transform");
  assert.equal(tool.presetId, "klart_vaer");
  assert.equal(tool.kind, "scene");
  assert.equal(tool.sceneGate, false);
  assert.equal(tool.titleKey, "express.tool.klart_vaer.title");
  assert.equal(DICTIONARIES.nb.ui[tool.titleKey], "Blå himmel");
  // Ingen skumringsvalg: ingen dusk_* i params_json.
  assert.equal(isDuskOrder(tool.service, tool.presetId), false);
  assert.deepEqual(duskParams(tool.service, tool.presetId, DEFAULT_DUSK), {});
});

test("K3: magic_cleanup, virtual_stage og express_v2 er fortsatt av", () => {
  assert.equal(ENABLED.magic_cleanup, false);
  assert.equal(ENABLED.virtual_stage, false);
  assert.equal(ENABLED.express_v2, false);
  const ids = orderableTools().map((t) => t.id);
  for (const id of ["magic_cleanup", "virtual_stage", "digital_styling"]) assert.ok(!ids.includes(id), id);
});

test("K3: bestillingen paa Tjenester sender bare preset_id for et kort uten bildetypevelger", () => {
  const page = withoutComments(read("(app)/tjenester/page.tsx"));
  // Bildetypevelgeren (og scene-feltene) bare naar sceneGate ikke er false.
  assert.match(
    page,
    /const showSceneControls =\s*selectedTool\?\.kind === "scene" && selectedTool\.sceneGate !== false;/
  );
  // Skumringsvalgene bare for skumringspresetene (isDuskOrder).
  assert.match(
    page,
    /const showDuskControls =\s*selectedTool !== null && isDuskOrder\(selectedTool\.service, selectedTool\.presetId\);/
  );
  // Det handleRun sender for scene-kort: preset_id, scene-feltene bak
  // showSceneControls og duskParams. Ingen andre felt (model, dusk_* direkte).
  const start = page.indexOf("job.run(preview.file, selectedTool.service, {");
  assert.ok(start > 0);
  const body = page.slice(start, page.indexOf("});", start));
  const fields = body.replace(/\s+/g, " ");
  assert.match(fields, /\.\.\.\(selectedTool\.presetId \? \{ preset_id: selectedTool\.presetId \} : \{\}\),/);
  assert.match(
    fields,
    /\.\.\.\(showSceneControls \? \{ scene_type: sceneType, force_scene_type: forceSceneType \} : \{\}\),/
  );
  assert.match(fields, /\.\.\.duskParams\(selectedTool\.service, selectedTool\.presetId, dusk\),/);
  assert.deepEqual(
    [...body.matchAll(/\b([a-z_]+):/g)].map((m) => m[1]),
    ["preset_id", "scene_type", "force_scene_type"]
  );
  // Med Klart vaer-kortet blir det { preset_id: "klart_vaer" } og ingenting annet.
  const tool = orderableTools().find((t) => t.id === "klart_vaer");
  assert.ok(tool);
  const showScene = tool.kind === "scene" && tool.sceneGate !== false;
  const params = {
    ...(tool.presetId ? { preset_id: tool.presetId } : {}),
    ...(showScene ? { scene_type: "auto", force_scene_type: false } : {}),
    ...duskParams(tool.service, tool.presetId, DEFAULT_DUSK),
  };
  assert.deepEqual(params, { preset_id: "klart_vaer" });
});
