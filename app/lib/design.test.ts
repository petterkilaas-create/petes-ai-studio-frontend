import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { brandCssVars, DEFAULT_BRAND, HOUSE_ICON, resolveBrand } from "./brand.ts";
import { DICTIONARIES, t } from "./i18n/index.ts";
import { ENABLED, expressCategories, type NavId } from "./services.ts";
import { jsxBlocks, literalTexts, literalTextsInFile, withoutComments } from "./testing/jsxText.ts";

// Redesign D0 (brief v4 §8, §13). node --test kan ikke laste .tsx, saa
// globals.css og layout.tsx sjekkes som tekst (som i L0).

const APP_DIR = fileURLToPath(new URL("..", import.meta.url));
const REPO_DIR = fileURLToPath(new URL("../..", import.meta.url));
const read = (rel: string) => readFileSync(join(APP_DIR, rel), "utf8");
const css = read("globals.css");
const layout = read("(app)/layout.tsx");

/** Innholdet i blokken som starter med `head {`, uten nestede blokker. */
function block(source: string, head: string): string {
  const start = source.indexOf(`${head} {`);
  assert.ok(start >= 0, `fant ikke ${head} i globals.css`);
  return source.slice(start, source.indexOf("}", start));
}

const TOKENS_8: Record<string, string> = {
  paper: "#F4F2ED",
  surface: "#FFFFFF",
  "surface-2": "#ECE8E0",
  ink: "#1D1C1A",
  "ink-2": "#5F5A52",
  line: "#DDD7CC",
  "line-strong": "#CFC8BB",
  "amber-bg": "#F6E8CF",
  "amber-fg": "#6E4508",
  "green-bg": "#E1EDE4",
  "green-fg": "#22503A",
  "neutral-bg": "#ECE8E0",
  "neutral-fg": "#4F4A43",
  "red-bg": "#F6DEDB",
  "red-fg": "#8A1F17",
  // MS3b (Petter 02.10): kveldsblaatt fra utkastet, fast og ikke en merkefarge.
  night: "#101A2C",
};

test("globals.css: alle tokenene i §8 finnes i @theme med riktig verdi", () => {
  const theme = block(css, "@theme");
  for (const [name, value] of Object.entries(TOKENS_8)) {
    assert.match(theme, new RegExp(`--color-${name}:\\s*${value};`, "i"), name);
  }
  assert.match(theme, /--radius-card:\s*14px;/);
  assert.match(theme, /--radius-button:\s*10px;/);
  assert.match(theme, /--radius-pill:\s*9999px;/);
});

test("globals.css: primary, on-primary og accent peker paa merkevariablene (@theme inline)", () => {
  const inline = block(css, "@theme inline");
  assert.match(inline, /--color-primary:\s*var\(--brand-primary\);/);
  assert.match(inline, /--color-on-primary:\s*var\(--brand-on-primary\);/);
  assert.match(inline, /--color-accent:\s*var\(--brand-accent\);/);
  assert.match(inline, /--font-display:\s*var\(--font-instrument-serif\)/);
  assert.match(inline, /--font-ui:\s*var\(--font-geist\)/);
  // --font-sans styrer standardfonten; D0 skal ikke endre noe synlig.
  assert.doesNotMatch(css, /^\s*--font-sans\s*:/m);
});

test("globals.css: standardverdiene paa :root er de samme som DEFAULT_BRAND", () => {
  const root = block(css, ":root");
  for (const [name, value] of Object.entries(brandCssVars(DEFAULT_BRAND))) {
    assert.match(root, new RegExp(`${name}:\\s*${value};`, "i"), name);
  }
});

test("fontene lastes med next/font i lib/fonts.ts, bare som variabler, og alle rot-layoutene bruker dem", () => {
  // MS2: én definisjon (font.md «Using a font definitions file»), delt av
  // appen, markedssiden og 404-siden.
  const fonts = read("lib/fonts.ts");
  assert.match(fonts, /import\s*\{[^}]*\bGeist\b[^}]*\}\s*from\s*"next\/font\/google"/);
  assert.match(fonts, /import\s*\{[^}]*\bInstrument_Serif\b[^}]*\}\s*from\s*"next\/font\/google"/);
  assert.match(fonts, /variable:\s*"--font-instrument-serif"/);
  assert.match(fonts, /variable:\s*"--font-geist"/);
  assert.match(fonts, /export const fontVariables = `\$\{instrumentSerif\.variable\} \$\{geist\.variable\}`;/);
  assert.doesNotMatch(fonts, /(instrumentSerif|geist)\.className/, ".className bytter font (synlig)");
  for (const rel of ["(app)/layout.tsx", "(marketing)/layout.tsx", "global-not-found.tsx"]) {
    const src = read(rel);
    // Appen: spraaket fra layouten (TG-NEW-129). Markedssiden og 404: norsk.
    assert.match(src, /<html lang=(?:"nb"|\{locale\}) className=\{fontVariables\}/, rel);
    assert.match(src, /brandCssVars\(/, rel);
    assert.match(src, /import "(@\/app\/|\.\/)globals\.css";/, rel);
    assert.doesNotMatch(src, /next\/font/, `${rel}: fontene lastes bare i lib/fonts.ts`);
  }
  assert.match(layout, /import \{ fontVariables \} from "@\/app\/lib\/fonts";/);
});

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

// Dagens og tidligere merkenavn. Ingen av dem staar i koden eller ordlista,
// bare i brand.ts, saa et foretak kan bytte navnet uten kodeendring.
const BRAND_NAMES = [...new Set([DEFAULT_BRAND.displayName, "Husvy", "The Studio"])];

test("merkenavnet staar bare i brand.ts, ikke i .ts eller .tsx under app/ eller content/", () => {
  // Hele fila, ogsaa kommentarer. Testfilene er unntatt. content/ (MS2):
  // innholdet paa markedssiden bruker {brand}. MS4: domenet er ikke
  // visningsnavnet og staar i SITE_URL (marketingAccess.ts); bare den linja
  // er unntatt (seo.test.ts sjekker at adressen staar der og bare der).
  const brandFile = join(APP_DIR, "lib", "brand.ts");
  const contentDir = join(REPO_DIR, "content");
  const withoutSiteUrl = (src: string) => src.replace(/^export const SITE_URL = "https:\/\/[^"]+";$/m, "");
  for (const name of BRAND_NAMES) {
    const hits = [...sourceFiles(), ...sourceFiles(contentDir)]
      .filter((f) => f !== brandFile)
      .filter((f) => withoutSiteUrl(readFileSync(f, "utf8")).toLowerCase().includes(name.toLowerCase()))
      .map((f) => relative(REPO_DIR, f));
    assert.deepEqual(hits, [], name);
  }
});

test("«Gavl» finnes ingen steder i repoet", () => {
  // git grep -i fra repo-roten, ogsaa filer som ikke er committet ennaa
  // (--untracked, .gitignore gjelder). Exit 1 betyr ingen treff. Denne fila
  // unntas (den maa nevne ordet).
  let out = "";
  try {
    out = execFileSync("git", ["grep", "--untracked", "-il", "gavl", "--", ".", ":!app/lib/design.test.ts"], {
      cwd: REPO_DIR,
      encoding: "utf8",
    });
  } catch (e) {
    if ((e as { status?: number }).status !== 1) throw e;
  }
  assert.equal(out.trim(), "");
});

// ---------------------------------------------------------------------------
// D1 (D1a og D1b): skallet og de aktive sidene i retning A. Tekstsjekker, som over.
// ---------------------------------------------------------------------------

/** Skjulte sider: viser bare ServiceUnavailable og ryddes i D5. Sidene ligger i route group (app) (MS1). */
const HIDDEN_DIRS = ["staging", "express-v2", "video", "copywriter", "orders"].map((d) => `(app)/${d}`);

/** Aktive filer (.ts/.tsx/.css under app/, uten tester), relativt til app/. Nye filer kommer med av seg selv. */
function activeFiles(dir = APP_DIR): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    const rel = relative(APP_DIR, path);
    if (entry.isDirectory()) {
      if (!HIDDEN_DIRS.includes(rel)) out.push(...activeFiles(path));
    } else if (/\.(tsx?|css)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push(rel);
    }
  }
  if (dir === APP_DIR) assert.ok(out.length > 0, "fant ingen aktive filer under app/");
  return out;
}

test("D1: hver mappe i HIDDEN_DIRS finnes, saa lista ikke unntar noe som er flyttet", () => {
  for (const d of HIDDEN_DIRS) assert.ok(existsSync(join(APP_DIR, d)), d);
});

test("D1: listen over aktive filer har skallet, sidene og komponentene", () => {
  const files = activeFiles();
  for (const f of [
    "(app)/layout.tsx",
    "(app)/page.tsx",
    "(app)/start/page.tsx",
    "(app)/start/layout.tsx",
    "globals.css",
    "(app)/tjenester/page.tsx",
    "(app)/history/page.tsx",
    "lib/statusVariants.ts",
    "lib/services.ts",
    "components/AppNav.tsx",
    "components/ServiceUnavailable.tsx",
    "components/ui/Button.tsx",
    "(app)/godkjenning/[jobId]/page.tsx",
    "components/PreviewPlaceholder.tsx",
  ]) {
    assert.ok(files.includes(f), f);
  }
  assert.ok(!files.some((f) => f.startsWith("(app)/video/") || f.startsWith("(app)/orders/")));
});

test("D1: ingen #009183 (turkis, under WCAG AA) og ingen #0B1120 i de aktive filene", () => {
  const hits = activeFiles().filter((f) => /#009183|#0B1120/i.test(read(f)));
  assert.deepEqual(hits, []);
});

test("D1: de aktive sidene har ingen 9-11 px tekst, font-black, font-sans eller Montserrat (brief §3 punkt 8)", () => {
  // Bare .tsx (klassene); globals.css nevner --font-sans i en kommentar.
  for (const f of activeFiles().filter((f) => f.endsWith(".tsx"))) {
    const src = read(f);
    assert.doesNotMatch(src, /text-\[(9|10|11)px\]/, f);
    assert.doesNotMatch(src, /font-black|\bfont-sans\b|montserrat/i, f);
  }
});

test("D1: komponentene bruker tokenene, ikke hex eller vilkaarlige farger", () => {
  const files = activeFiles().filter((f) => f.startsWith("components/ui/") || f === "components/AppNav.tsx");
  assert.ok(files.length >= 5, "Button, Card, Pill, PageHeader og AppNav");
  for (const f of files) {
    const src = read(f);
    assert.doesNotMatch(src, /#[0-9a-f]{3,8}\b/i, f);
    assert.doesNotMatch(src, /-\[(#|rgb)/, f);
    assert.doesNotMatch(src, /\b(slate|gray|zinc|sky|indigo|purple|emerald)-\d/, f);
  }
  const button = read("components/ui/Button.tsx");
  for (const cls of ["bg-primary", "text-on-primary", "min-h-11", "rounded-button", "focus-visible:ring-2"]) {
    assert.ok(button.includes(cls), cls);
  }
  assert.ok(read("components/ui/Card.tsx").includes("rounded-card"));
  const pill = read("components/ui/Pill.tsx");
  for (const tone of ["amber", "green", "neutral", "red"]) {
    assert.ok(pill.includes(`bg-${tone}-bg text-${tone}-fg`), tone);
  }
  assert.ok(read("components/ui/PageHeader.tsx").includes("font-display"));
});

test("D1: skallet bruker merket fra brand.ts, og metadata har fanetittelen", () => {
  assert.match(layout, /const brand = DEFAULT_BRAND;/);
  assert.match(layout, /<BrandMark brand=\{brand\} \/>/);
  assert.match(layout, /export const metadata: Metadata = \{/);
  assert.match(layout, /title: \{ default: brand\.displayName, template: `%s · \$\{brand\.displayName\}` \}/);
  assert.match(layout, /<AppNav \/>/);
  // Bakgrunn og tekst settes bare i globals.css (AUDIT_DESIGN: to steder).
  assert.doesNotMatch(layout, /\bbg-\[|text-white/);
  // Fontene er i bruk: ingen preload: false lenger.
  assert.doesNotMatch(layout, /preload:\s*false/);
  const body = block(css, "body");
  assert.match(body, /background-color:\s*var\(--color-paper\);/);
  assert.match(body, /color:\s*var\(--color-ink\);/);
  assert.match(body, /font-family:\s*var\(--font-ui\);/);
  for (const [dir, title] of [
    ["start", "Start"],
    ["tjenester", "Tjenester"],
    ["history", "Historikk"],
    ["godkjenning", "Godkjenning"],
  ]) {
    assert.match(read(`(app)/${dir}/layout.tsx`), new RegExp(`title: "${title}"`), dir);
  }
});

/** D2a: komponentene til godkjenningssiden. Nye filer i mappa kommer med av seg selv. */
const GODKJENNING_COMPONENTS = activeFiles().filter((f) => f.startsWith("components/godkjenning/"));

test("D1b: godkjenningssiden og PreviewPlaceholder bruker bare tokenene", () => {
  for (const f of ["(app)/godkjenning/[jobId]/page.tsx", "components/PreviewPlaceholder.tsx", ...GODKJENNING_COMPONENTS]) {
    const src = read(f);
    assert.doesNotMatch(src, /#[0-9a-f]{3,8}\b/i, f);
    assert.doesNotMatch(src, /-\[(#|rgb)/, f);
    assert.doesNotMatch(src, /\b(slate|gray|zinc|sky|indigo|purple|emerald|teal)-\d/, f);
    assert.doesNotMatch(src, /\b(text|bg|border)-(white|black)\b/, f);
    assert.doesNotMatch(src, /\b(red|amber)-\d/, f);
  }
  const page = read("(app)/godkjenning/[jobId]/page.tsx");
  // Knappene og kortene er de felles komponentene (primary, ikke turkis).
  // D2b: handlingsknappene ligger i handlingskortet.
  assert.match(page, /const BTN_PRIMARY = buttonClass\("primary"\);/);
  assert.match(page, /const CARD = cardClass\(/);
  assert.match(page, /<h1 className="font-display /);
  const card = read("components/godkjenning/DecisionCard.tsx");
  assert.match(card, /const BTN_PRIMARY = buttonClass\("primary"\);/);
  assert.match(card, /const BTN_SECONDARY = buttonClass\("secondary"\);/);
  assert.match(card, /const BTN_DANGER = buttonClass\("danger"\);/);
  assert.match(card, /const CARD = cardClass\(/);
});

const EMOJI = /\p{Extended_Pictographic}/u;

test("D1: ingen emoji i menyen (Lucide-ikoner)", () => {
  const services = read("lib/services.ts");
  const nav = services.slice(services.indexOf("const ALL_NAV_LINKS"), services.indexOf("export function navLinks"));
  assert.ok(nav.length > 0);
  assert.doesNotMatch(nav, EMOJI);
  assert.doesNotMatch(nav, /label:|className:/, "tekst og farger ligger i AppNav og ordlista");
  const appNav = read("components/AppNav.tsx");
  assert.doesNotMatch(appNav, EMOJI);
  assert.match(appNav, /from "lucide-react"/);
  assert.doesNotMatch(layout, EMOJI);
});

const NAV_IDS: NavId[] = ["start", "services", "staging", "video", "copywriter", "orders", "history"];

test("D1: ordlista har de nye ordene paa nb og en", () => {
  const keys = [
    ...NAV_IDS.map((id) => `nav.${id}`),
    "nav.label",
    "home.title",
    "status.label",
    "status.idle",
    "status.uploading",
    "status.queued",
    "status.running",
    "status.awaitingApproval",
    "status.approved",
    "status.done",
    "status.failed",
    "status.rejected",
    "status.unknown",
    "service.scene_transform",
    "service.privacy_blur",
    "service.magic_cleanup",
    "service.virtual_stage",
    "history.title",
    "action.refresh",
  ];
  for (const locale of ["nb", "en"] as const) {
    const ui = DICTIONARIES[locale].ui as Record<string, string>;
    for (const key of keys) {
      assert.ok(typeof ui[key] === "string" && ui[key].trim().length > 0, `${locale} ${key}`);
      assert.doesNotMatch(ui[key], EMOJI, `${locale} ${key}`);
    }
    assert.match(ui["home.title"], /\{brand\}/, locale);
  }
  const nb = DICTIONARIES.nb.ui;
  assert.equal(nb["service.scene_transform"], "Kveldsbilde");
  assert.equal(nb["status.awaitingApproval"], "Til godkjenning");
  assert.equal(nb["history.openReview"], "Åpne godkjenning");
  // Ordene som forsvinner (brief §7), og ingen gamle nøkler for tittelen.
  const allNb = Object.values(nb).join("\n");
  assert.doesNotMatch(allNb, /Scene-transformasjon|Til kontroll|Til gjennomgang/);
  assert.ok(!Object.hasOwn(nb, "home.titlePrefix") && !Object.hasOwn(nb, "home.titleHighlight"));
});

test("D1: produktnavnet staar ikke i ordlista (kommer fra brand.ts)", () => {
  for (const locale of ["nb", "en"] as const) {
    for (const [key, text] of Object.entries(DICTIONARIES[locale].ui)) {
      for (const name of BRAND_NAMES) {
        assert.ok(!text.toLowerCase().includes(name.toLowerCase()), `${locale} ${key}: ${name}`);
      }
    }
  }
  assert.match(read("(app)/start/page.tsx"), /t\(locale, "home\.title", \{ brand: brand\.displayName \}\)/);
});

test("D1: testene for annonseteksten og lekkasjevernet er uendret", () => {
  // sha256 fra main foer D1 (249cee3). Endres de, maa det vaere et eget valg.
  // MS1 (dag 35): previews.test.ts fikk nye stier til sidene i (app)/, ellers uendret.
  // TG-NEW-153 (dag 38): to stier fra (app)/express til (app)/tjenester, ellers uendret (Petter 05.10).
  const expected: Record<string, string> = {
    "lib/disclosure.test.ts": "8acedaed814203b88c6395209b43ffe7798734b58d888b63985f9126937769ce",
    "lib/previews.test.ts": "e78901bf96250efc8fca3f5eea49d985abc6bf7213870dac66c528182a65b4d4",
    "lib/jobState.test.ts": "cac4d79a9ed60e6307f4cdd0118fcba43c22b8aa8ba7a783ba4c0e1522a818c5",
  };
  for (const [rel, hash] of Object.entries(expected)) {
    assert.equal(createHash("sha256").update(readFileSync(join(APP_DIR, rel))).digest("hex"), hash, rel);
  }
});

// ---------------------------------------------------------------------------
// D1c: tekstene paa Tjenester (tidligere Express) via ordlista (brief §7), uten
// metaforer og steg-nummer.
// ---------------------------------------------------------------------------

/** JSX-delen av komponenten: fra `return (` i default-eksporten/komponenten. */
function jsxOf(rel: string, fn: string): string {
  const src = withoutComments(read(rel));
  const start = src.indexOf("return (", src.indexOf(fn));
  assert.ok(start >= 0, rel);
  return src.slice(start);
}

const EXPRESS_JSX: [string, string][] = [
  ["(app)/tjenester/page.tsx", "function ExpressContent"],
  ["components/DuskChoicePicker.tsx", "export function DuskChoicePicker"],
];

test("D1c: Tjenester og DuskChoicePicker har ingen synlig tekst skrevet rett inn", () => {
  for (const [rel, fn] of EXPRESS_JSX) {
    assert.deepEqual(literalTexts(jsxOf(rel, fn)), [], rel);
  }
});

// Store og smaa bokstaver teller: id-en og parameteren «skumring» (TG-138) er ikke synlig tekst.
const OLD_EXPRESS_WORDS = /Time Traveler|Fix-It|Step \d|Studio|Magic Cleanup|Privacy Blur|Skumring|Klart vær|[Cc]lassifier/;

test("D1c: de gamle ordene fra Express finnes ikke i synlig tekst", () => {
  for (const locale of ["nb", "en"] as const) {
    for (const [key, text] of Object.entries(DICTIONARIES[locale].ui)) {
      assert.doesNotMatch(text, OLD_EXPRESS_WORDS, `${locale} ${key}`);
    }
  }
  for (const [rel] of EXPRESS_JSX) {
    // Hele koden uten kommentarer: ogsaa strenger i uttrykk (f.eks. title={...}).
    assert.doesNotMatch(withoutComments(read(rel)), OLD_EXPRESS_WORDS, rel);
  }
});

test("D1c: services.ts har bare noekler til ordlista, ingen tekst eller emoji", () => {
  const code = withoutComments(read("lib/services.ts"));
  assert.doesNotMatch(code, /^\s*(title|desc|icon):/m);
  assert.doesNotMatch(code, EMOJI);
  const count = (re: RegExp) => code.match(re)?.length ?? 0;
  const tools = count(/^\s*kind: "(simple|scene)",/gm);
  assert.ok(tools >= 4);
  assert.equal(count(/^\s*titleKey: "/gm), tools + 2, "hvert verktoey og begge kategoriene");
  assert.equal(count(/^\s*descKey: "/gm), tools);
});

test("D1c: ordlista har ordene til Tjenester paa nb og en", () => {
  const keys = [
    "express.title",
    "express.chooseService",
    "express.category.fixit",
    "express.category.timetraveler",
    "express.tool.klart_vaer.title",
    "express.tool.klart_vaer.desc",
    "express.tool.skumring.desc",
    "express.tool.privacy_blur.desc",
    "express.tool.magic_cleanup.desc",
    "express.selected",
    "express.selectedService",
    "express.chooseImage",
    "express.run",
    "express.running",
    "express.reset",
    "express.noImage",
    "express.noResult",
    "express.imageType",
    "express.imageTypeAuto",
    "express.imageTypeExterior",
    "express.imageTypeInterior",
    "express.forceExterior",
    "express.forceExteriorHint",
    "express.forceExteriorTitle",
    "express.forceExteriorLocked",
  ];
  for (const locale of ["nb", "en"] as const) {
    const ui = DICTIONARIES[locale].ui as Record<string, string>;
    for (const key of keys) {
      assert.ok(typeof ui[key] === "string" && ui[key].trim().length > 0, `${locale} ${key}`);
    }
  }
  const nb = DICTIONARIES.nb.ui;
  assert.equal(nb["express.category.fixit"], "Rydd og skjul");
  assert.equal(nb["express.category.timetraveler"], "Lys og himmel");
  assert.equal(nb["express.noImage"], "Ikke noe bilde valgt");
});

test("D1c: Kveldsbilde sender det samme som foer (id, service, preset, ingen bildetype-valg)", () => {
  const tool = expressCategories().flatMap((c) => c.items).find((t) => t.id === "skumring");
  assert.ok(tool);
  assert.equal(tool.service, "scene_transform");
  assert.equal(tool.presetId, "skumring");
  assert.equal(tool.kind, "scene");
  assert.equal(tool.sceneGate, false);
  assert.equal(tool.titleKey, "service.scene_transform");
  assert.equal(DICTIONARIES.nb.ui[tool.titleKey], "Kveldsbilde");
});

// ---------------------------------------------------------------------------
// D2a: slideren og variantene paa godkjenningssiden (brief §4, KONTRAKT_RUNDER).
// ---------------------------------------------------------------------------

test("D2a: komponentene finnes og er med i D1-sjekkene over", () => {
  for (const f of [
    "components/godkjenning/CompareViewer.tsx",
    "components/godkjenning/VariantPicker.tsx",
    "components/godkjenning/DisclosureBlock.tsx",
    "components/godkjenning/DownloadButton.tsx",
    "components/godkjenning/classes.ts",
  ]) {
    assert.ok(GODKJENNING_COMPONENTS.includes(f), f);
  }
});

test("D2a: slideren kan styres uten aa dra (WCAG 2.5.7) og har rolle og verdier", () => {
  const src = withoutComments(read("components/godkjenning/CompareViewer.tsx"));
  // Rolle og verdier for skjermlesere.
  for (const attr of ['role="slider"', "tabIndex={0}", "aria-valuemin={0}", "aria-valuemax={100}", "aria-valuenow={value}", "aria-valuetext=", "aria-label="]) {
    assert.ok(src.includes(attr), attr);
  }
  // Tastaturet: paa haandtaket, via sliderKey.
  assert.match(src, /onKeyDown=\{onKeyDown\}/);
  assert.match(src, /const next = sliderKey\(value, e\.key, e\.shiftKey\);/);
  // Klikk eller trykk paa sporet: pointerdown paa sporet flytter skillet dit.
  assert.match(src, /ref=\{trackRef\}[\s\S]*?onPointerDown=\{onPointerDown\}/);
  const down = src.slice(src.indexOf("const onPointerDown"), src.indexOf("const onPointerMove"));
  assert.match(down, /moveTo\(e\.clientX\)/);
  assert.match(src, /setValue\(valueFromPointer\(/);
  // Mobil: siden ruller fortsatt loddrett.
  assert.ok(src.includes("touch-pan-y"));
  // Begge bildene har alt-tekst, og resultatsiden har «AI»-merkelappen.
  assert.match(src, /alt=\{t\(locale, "compare\.altOriginal"\)\}/);
  assert.match(src, /alt=\{aiAlt\}|alt=\{resultAlt\}/);
  assert.match(src, /t\(locale, "compare\.ai"\)/);
});

test("D2a: komponentene har ingen synlig tekst skrevet rett inn", () => {
  const files = GODKJENNING_COMPONENTS.filter((f) => f.endsWith(".tsx"));
  assert.ok(files.length >= 4);
  for (const f of files) {
    const blocks = jsxBlocks(withoutComments(read(f)));
    assert.ok(blocks.length > 0, f);
    assert.deepEqual(blocks.flatMap((b) => literalTexts(`${b}<`)), [], f);
  }
});

test("D2a: siden bygger variantene fra rundene, med admin fra /me", () => {
  const page = read("(app)/godkjenning/[jobId]/page.tsx");
  assert.match(page, /compareVariants\(review\.images, \{ isAdmin: caps\.viewAll \}\)/);
  assert.match(page, /getCapabilities\(\{ getToken \}\)/);
  assert.match(page, /useState<Capabilities>\(NO_CAPABILITIES\)/);
  // Rundene: lenken som den er. De gamle feltene bare for jobber uten rounds.
  assert.match(page, /shown\.source\.kind === "legacy"\s*\? resultImageUrl\(review\.images, shown\.source\.variant\)\s*: shown\.source\.url;/);
  assert.doesNotMatch(page, /variantOptions\(/);
  assert.match(page, /<CompareViewer[\s\S]*?placeholder=\{<PreviewPlaceholder \/>\}/);
});

test("D2a: ordlista har ordene til slideren og variantene paa nb og en", () => {
  const nb = DICTIONARIES.nb.ui;
  const en = DICTIONARIES.en.ui;
  assert.equal(nb["compare.with"], "Sammenlign originalen med");
  assert.equal(nb["compare.mode.slider"], "Slider");
  assert.equal(nb["compare.mode.side"], "Side ved side");
  assert.equal(nb["compare.mode.result"], "Kun resultat");
  assert.equal(nb["compare.ai"], "AI");
  assert.equal(en["compare.with"], "Compare the original with");
  assert.equal(en["compare.mode.side"], "Side by side");
  assert.equal(en["compare.mode.result"], "Result only");
});

// ---------------------------------------------------------------------------
// D2b: handlingskortet, rettingen, stemning og lys, og «Detaljer» (brief §3 punkt 5 og 6).
// ---------------------------------------------------------------------------

test("D2b: komponentene finnes og er med i D1-sjekkene", () => {
  for (const f of [
    "components/godkjenning/DecisionCard.tsx",
    "components/godkjenning/CorrectionPanel.tsx",
    "components/godkjenning/MoodPanel.tsx",
    "components/godkjenning/DetailsPanel.tsx",
    "components/godkjenning/FireplaceChoice.tsx",
    "components/godkjenning/LightLabel.tsx",
  ]) {
    assert.ok(GODKJENNING_COMPONENTS.includes(f), f);
  }
});

test("D2b: «Detaljer» vises bare naar showDetails(caps) er sann", () => {
  const page = read("(app)/godkjenning/[jobId]/page.tsx");
  assert.match(page, /\{showDetails\(caps\) && <DetailsPanel /);
  assert.equal(page.match(/<DetailsPanel /g)?.length, 1);
});

/** Ord og koder fra analysen som bare hoerer hjemme i «Detaljer». */
const ANALYSIS = /review\.lightsUnstable|review\.lightsRejected|review\.lightsApproved|"lightReason"|"reasonCode"|"flagCode"|review\.runValues|review\.analysisTitle|review\.analysisLocation|review\.noValidRuns|(?<![.\w])reason(?=[\s/>])/;

test("D2b: analysen staar bare i DetailsPanel (megleren ser den ikke)", () => {
  const files = ["(app)/godkjenning/[jobId]/page.tsx", ...GODKJENNING_COMPONENTS.filter((f) => !f.endsWith("DetailsPanel.tsx") && !f.endsWith("LightLabel.tsx"))];
  for (const f of files) {
    assert.doesNotMatch(withoutComments(read(f)), ANALYSIS, f);
  }
  const details = read("components/godkjenning/DetailsPanel.tsx");
  for (const key of ["review.lightsUnstable", "review.lightsRejected", '"reasonCode"', '"flagCode"']) {
    assert.ok(details.includes(key), key);
  }
});

test("D2b: rettingen er én flat liste med «Usikker», uten grunner, tidspunkt eller himmel", () => {
  const panel = withoutComments(read("components/godkjenning/CorrectionPanel.tsx"));
  assert.match(panel, /const rows = flatLights\(lights\);/);
  assert.match(panel, /<LightLabel light=\{light\} name=\{nameOf\(light\)\} locale=\{locale\} uncertain=\{uncertain\} state \/>/);
  assert.match(panel, /onToggle\(light, uncertain, e\.target\.checked\)/);
  // Ingen grunn fra analysen, og ingen valg av tidspunkt eller himmel (TG-NEW-145).
  assert.doesNotMatch(panel, /\breason\b|lightReason/);
  assert.doesNotMatch(panel, /dusk|DuskChoice|roundTime|roundSky|"time"|"sky"/i);
  // Siden sender kandidat-flagget videre til setToggle, og body bygges som foer.
  const page = read("(app)/godkjenning/[jobId]/page.tsx");
  assert.match(page, /setToggles\(\(prev\) => setToggle\(prev, light, uncertain, on\)\)/);
  assert.match(page, /buildCorrection\(\s*review,\s*toggles,\s*correctionFireplaceShown\(review\.fireplace\),\s*correctAnswer\s*\)/);
  // LightLabel viser grunnen bare naar `reason` er satt, og «Usikker» bare med `uncertain`.
  const label = withoutComments(read("components/godkjenning/LightLabel.tsx"));
  assert.match(label, /\{reason && light\.reasonCode !== null && \(/);
  assert.match(label, /\{uncertain && <span className=\{BADGE\}>\{t\(locale, "correct\.uncertain"\)\}<\/span>\}/);
});

test("D2b: handlingene i ett kort, i rekkefoelgen Godkjenn · Korriger bildet · Avvis", () => {
  const card = withoutComments(read("components/godkjenning/DecisionCard.tsx"));
  const approve = card.indexOf('t(locale, "action.approve")');
  const correct = card.indexOf('t(locale, "action.correct")');
  const reject = card.indexOf('t(locale, "action.reject")');
  assert.ok(approve > 0 && approve < correct && correct < reject, "rekkefoelgen");
  assert.match(card, /onClick=\{onStartCorrection\} disabled=\{locked\} className=\{BTN_SECONDARY\}/);
  assert.match(card, /onClick=\{\(\) => onRejectOpen\(true\)\} disabled=\{locked\} className=\{BTN_DANGER\}/);
  // Knappene styres bare av allowed_actions (decisionControls), ikke av status.
  assert.doesNotMatch(card, /status ===|awaiting_approval|needs_review/);
  // Rettingen aapnes i samme kort.
  assert.match(card, /\{correction !== null \? \(\s*correction\s*\) :/);
});

test("D2b: ordlista har de nye ordene paa nb og en", () => {
  const nb = DICTIONARIES.nb.ui;
  const en = DICTIONARIES.en.ui;
  assert.equal(nb["correct.uncertain"], "Usikker");
  assert.equal(en["correct.uncertain"], "Uncertain");
  assert.equal(nb["review.details"], "Detaljer");
  assert.equal(en["review.details"], "Details");
  assert.equal(nb["review.moodTitle"], "Stemning og lys");
  assert.equal(nb["correct.lightsTitle"], "Lys i bildet");
});

// ---------------------------------------------------------------------------
// D2c: plasseringen av lysene og overskriften i «Stemning og lys» (Petter 01.10, valg B).
// ---------------------------------------------------------------------------

test("D2c/TG-NEW-148: plasseringen fra analysen vises bare med location, merket som analysens tekst", () => {
  const label = withoutComments(read("components/godkjenning/LightLabel.tsx"));
  assert.match(label, /location = false,/);
  // Plasseringen leses bare i den ene linja som krever `location`, og staar i review.analysisLocation.
  const lines = label.split("\n").filter((l) => l.includes("light.location"));
  assert.equal(lines.length, 2, "betingelsen og teksten");
  assert.match(lines[0], /^\s*\{location && light\.location && \($/);
  assert.match(lines[1], /t\(locale, "review\.analysisLocation", \{ text: light\.location \}\)/);
  assert.equal(DICTIONARIES.nb.ui["review.analysisLocation"], "Analysens tekst: {text}");
  assert.equal(DICTIONARIES.en.ui["review.analysisLocation"], "Analysis text: {text}");
});

test("TG-NEW-148: bare «Detaljer» (admin) viser analysens plassering; alle visninger viser nummer og sone", () => {
  const usesOf = (f: string) =>
    [...withoutComments(read(f)).matchAll(/<LightLabel\b[^>]*\/>/g)].map((m) => m[0]);
  const details = usesOf("components/godkjenning/DetailsPanel.tsx");
  assert.ok(details.length > 0 && details.every((u) => /\blocation\b/.test(u)), "Detaljer");
  for (const f of ["components/godkjenning/MoodPanel.tsx", "components/godkjenning/CorrectionPanel.tsx"]) {
    const uses = usesOf(f);
    assert.equal(uses.length, 1, f);
    // Ikke-admin ser aldri den engelske plasseringen: rettingen og «Stemning og lys».
    for (const use of uses) assert.doesNotMatch(use, /\blocation\b/, use);
  }
  // Nummer og sone fra samme lightNames over hele lista i alle tre visninger.
  for (const f of [
    "components/godkjenning/MoodPanel.tsx",
    "components/godkjenning/CorrectionPanel.tsx",
    "components/godkjenning/DetailsPanel.tsx",
  ]) {
    const src = withoutComments(read(f));
    for (const use of usesOf(f)) assert.match(use, /name=\{nameOf\(light\)\}/, f);
    assert.match(src, /const nameOf = lightNames\((review\.)?lights\);/, f);
  }
  // Ingen andre steder leser plasseringen direkte.
  for (const f of ["(app)/godkjenning/[jobId]/page.tsx", ...GODKJENNING_COMPONENTS.filter((f) => !f.endsWith("LightLabel.tsx"))]) {
    assert.doesNotMatch(withoutComments(read(f)), /\.location\b/, f);
  }
  // Typenavnet kommer bare via lightText (nummeret), ikke direkte fra ordlista.
  const label = withoutComments(read("components/godkjenning/LightLabel.tsx"));
  assert.doesNotMatch(label, /"lightType"/);
  assert.match(label, /const text = lightText\(locale, light, name\);/);
});

test("D2c: overskriften heter «Lys som tennes» i alle tilstander", () => {
  assert.equal(DICTIONARIES.nb.ui["review.lightsLit"], "Lys som tennes");
  assert.equal(DICTIONARIES.en.ui["review.lightsLit"], "Lights turned on");
  // Samme overskrift uansett status: MoodPanel tar ikke status inn.
  const mood = withoutComments(read("components/godkjenning/MoodPanel.tsx"));
  assert.match(mood, /t\(locale, "review\.lightsLit"\)/);
  assert.doesNotMatch(mood, /status/);
});

// ---------------------------------------------------------------------------
// Dag 35: merket (white label, brief §13). Navn, logo og ikon kommer bare fra
// brand.ts. Et foretak bytter dem uten kodeendring.
// ---------------------------------------------------------------------------

test("merke: ingen synlig «Studio» i ordlista eller i .tsx", () => {
  for (const locale of ["nb", "en"] as const) {
    for (const [key, text] of Object.entries(DICTIONARIES[locale].ui)) {
      assert.doesNotMatch(text, /\bstudio\b/i, `${locale} ${key}`);
    }
  }
  // Uten kommentarer. Navn som openCanvasStudio er ikke et eget ord.
  for (const f of sourceFiles().filter((f) => f.endsWith(".tsx"))) {
    assert.doesNotMatch(withoutComments(readFileSync(f, "utf8")), /\bstudio\b/i, relative(APP_DIR, f));
  }
});

test("merke: tekster som nevner merket, bruker {brand}", () => {
  for (const locale of ["nb", "en"] as const) {
    const ui = DICTIONARIES[locale].ui;
    assert.match(ui["home.title"], /\{brand\}/, locale);
    // Ingen tekst har navnet som annen plassholder.
    for (const [key, text] of Object.entries(ui)) assert.doesNotMatch(text, /\{name\}/, `${locale} ${key}`);
  }
});

test("merke: et foretak med eget navn faar det i tittelen, i toppen og i tekstene", () => {
  const brand = resolveBrand({ displayName: "Kjeden Bolig" });
  assert.equal(brand.displayName, "Kjeden Bolig");
  for (const locale of ["nb", "en"] as const) {
    const title = t(locale, "home.title", { brand: brand.displayName });
    assert.ok(title.includes("Kjeden Bolig"), title);
    assert.ok(!title.includes(DEFAULT_BRAND.displayName), title);
  }
  // Tittelen og toppen leser bare fra merket (sjekkes som tekst, som i D1).
  assert.match(layout, /title: \{ default: brand\.displayName, template: `%s · \$\{brand\.displayName\}` \}/);
  assert.match(layout, /<BrandMark brand=\{brand\} \/>/);
  const mark = withoutComments(read("components/BrandMark.tsx"));
  assert.match(mark, /\{brand\.displayName\}/);
  assert.match(mark, /const \{ url, icon \} = brand\.logo;/);
  // alt="" paa logoen er riktig: navnet staar ved siden av.
  assert.deepEqual(literalTexts(mark).filter(Boolean), []);
});

test("merke: husikonet staar bare i brand.ts, og BrandMark tegner det fra merket", () => {
  const mark = withoutComments(read("components/BrandMark.tsx"));
  // Ingen stier eller sirkler skrevet rett inn.
  assert.doesNotMatch(mark, /\bd="|\b(?:cx|cy|r)="/);
  assert.match(mark, /icon\.paths\.map/);
  assert.match(mark, /icon\.circles\.map/);
  assert.match(mark, /stroke="currentColor"/);
  for (const d of HOUSE_ICON.paths) {
    const hits = sourceFiles()
      .filter((f) => readFileSync(f, "utf8").includes(d))
      .map((f) => relative(APP_DIR, f));
    assert.deepEqual(hits, ["lib/brand.ts"], d);
  }
});

test("merke: uten logo og ikon vises navnet ogsaa paa smal skjerm", () => {
  const mark = withoutComments(read("components/BrandMark.tsx"));
  assert.match(mark, /const hasMark = Boolean\(url \|\| icon\);/);
  // MS3b: markedssiden viser navnet alltid (alwaysShowName); appen og 404 som foer.
  assert.match(mark, /alwaysShowName = false/);
  assert.match(mark, /const hideNameOnSmall = hasMark && !alwaysShowName;/);
  assert.match(mark, /\$\{hideNameOnSmall \? "sr-only sm:not-sr-only " : ""\}/);
  assert.match(read("(app)/layout.tsx"), /<BrandMark brand=\{brand\} \/>/);
  assert.match(read("global-not-found.tsx"), /<BrandMark brand=\{brand\} \/>/);
});

test("merke: icon.svg er husikonet fra brand.ts, og apple-icon.png er 180 px", () => {
  const svg = read("icon.svg");
  assert.deepEqual([...svg.matchAll(/<path d="([^"]+)"/g)].map((m) => m[1]), [...HOUSE_ICON.paths]);
  assert.deepEqual(
    [...svg.matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)"/g)].map((m) => ({ cx: +m[1], cy: +m[2], r: +m[3] })),
    [...HOUSE_ICON.circles]
  );
  assert.match(svg, new RegExp(`viewBox="${HOUSE_ICON.viewBox}"`));
  assert.match(svg, new RegExp(`stroke-width="${HOUSE_ICON.strokeWidth}"`));
  // PNG: bredde og hoeyde staar i IHDR, byte 16-23.
  const png = readFileSync(join(APP_DIR, "apple-icon.png"));
  assert.equal(png.readUInt32BE(16), 180);
  assert.equal(png.readUInt32BE(20), 180);
  // Bare ett ikon i fanen: standard-favicon fra create-next-app er fjernet.
  assert.ok(!readdirSync(APP_DIR).includes("favicon.ico"));
});

// ---------------------------------------------------------------------------
// TG-NEW-147: lysstyrke med fem trinn paa godkjenningssiden (KONTRAKT_LYSSTYRKE).
// Reglene er testet i brightness.test.ts; her sjekkes at siden og
// komponentene bruker dem.
// ---------------------------------------------------------------------------

/** CSS som endrer lysstyrken i nettleseren: filter, brightness() og Tailwind-klassene. */
const CSS_BRIGHTNESS = /brightness\(|\bfilter\s*:|filter:\s*`|(^|[\s"'`])(filter|brightness-[\w[]+|backdrop-[\w[-]+)(?=[\s"'`])/;

test("TG147: ingen CSS-filter paa resultatbildet; bildet er trinnets lenke fra backend", () => {
  for (const f of [
    "(app)/godkjenning/[jobId]/page.tsx",
    "components/godkjenning/CompareViewer.tsx",
    "components/godkjenning/BrightnessControl.tsx",
  ]) {
    assert.doesNotMatch(withoutComments(read(f)), CSS_BRIGHTNESS, f);
  }
  const page = withoutComments(read("(app)/godkjenning/[jobId]/page.tsx"));
  assert.match(page, /const stepShown = brightness\.kind === "control" && !brightness\.locked \? step : null;/);
  assert.match(page, /const shownUrl = stepShown !== null \? brightnessResultUrl\(review\.brightness, stepShown\) : roundUrl;/);
  assert.match(page, /result=\{shown === null \? null : \{ url: shownUrl, label: shownLabel \}\}/);
  assert.match(page, /onResultLoad=\{\(\) => setResultLoaded\(true\)\}/);
});

test("TG147: kontrollen er en innebygd range med fem trinn, navn fra ordlista og laas", () => {
  const src = withoutComments(read("components/godkjenning/BrightnessControl.tsx"));
  for (const attr of [
    'type="range"',
    "min={BRIGHTNESS_MIN}",
    "max={BRIGHTNESS_MAX}",
    "step={1}",
    "value={step}",
    "aria-labelledby={headingId}",
    "aria-valuetext={name}",
    "disabled={view.locked || locked}",
  ]) {
    assert.ok(src.includes(attr), attr);
  }
  assert.match(src, /const name = stepName\(locale, step\);/);
  assert.match(src, /t\(locale, "brightness\.title"\)/);
  assert.match(src, /\{view\.locked && <p[^>]*>\{t\(locale, "brightness\.currentRoundOnly"\)\}<\/p>\}/);
  assert.match(src, /t\(locale, "brightness\.approved", \{ step: stepName\(locale, step\) \}\)/);
  // Forhaandslasting foerst naar hovedbildet er lastet.
  assert.match(src, /if \(!ready \|\| preloadKey === ""\) return;/);
  // Trefflate 44 px og fokus (brief §3 punkt 8).
  assert.match(src, /className=\{`h-11 w-full[^`]*\$\{FOCUS\}`\}/);
  // Navnene lages bare i brightness.ts fra step, aldri skrevet inn i komponenten.
  assert.doesNotMatch(src, /Mørk|Lys"|Standard|Ekstra|Darker|Light"/);
});

test("TG147: siden skjuler «Rått», viser kontrollen under bildet og sender trinnet ved godkjenning", () => {
  const page = withoutComments(read("(app)/godkjenning/[jobId]/page.tsx"));
  assert.match(
    page,
    /const variants = visibleVariants\(\s*compareVariants\(review\.images, \{ isAdmin: caps\.viewAll \}\),\s*review\.brightness\s*\);/
  );
  // Kontrollen rett under CompareViewer i bildekortet.
  assert.match(page, /<CompareViewer[\s\S]*?\/>\s*\{brightness\.kind === "control" && step !== null && \(\s*<BrightnessControl/);
  assert.match(page, /\{brightness\.kind === "approved" && <BrightnessApproved step=\{brightness\.step\} locale=\{locale\} \/>\}/);
  assert.match(page, /locked=\{locked\}\s*preload=\{preloadUrls\(brightness\.steps, step\)\}/);
  // Godkjenningen: trinnet med, gjennom runDecision (vern mot dobbeltklikk).
  assert.match(page, /onDecide=\{\(action\) => decide\(action, step\)\}/);
  assert.match(page, /buildDecision\(action, reasonText, answer, review, brightnessStep\)/);
  assert.match(page, /void runDecision\(\{\s*inFlight,/);
  assert.match(page, /approving=\{isApproving\(pending\)\}/);
  // Ny henting (ny runde) starter paa default_step igjen.
  const fetch = page.slice(page.indexOf("const fetchReview"), page.indexOf("useEffect("));
  assert.match(fetch, /setChosenStep\(null\);/);
  // Feilkodene via blockedResult.
  assert.match(page, /const result = blockedResult\(out\);/);
});

test("TG147: Godkjenn-knappen viser «Godkjenner …» og er laast mens kallet pågår", () => {
  const card = withoutComments(read("components/godkjenning/DecisionCard.tsx"));
  assert.match(
    card,
    /onClick=\{\(\) => onDecide\("approve"\)\}\s*disabled=\{locked\}\s*aria-busy=\{approving\}[\s\S]*?\{approving \? t\(locale, "action\.approving"\) : t\(locale, "action\.approve"\)\}/
  );
});

// ---------------------------------------------------------------------------
// Ventebildet (KONTRAKT_VENTEBILDE): JobMedia i Historikk og Express.
// Reglene er testet i jobMedia.test.ts og autoRefresh.test.ts; her sjekkes
// at komponenten og sidene bruker dem.
// ---------------------------------------------------------------------------

test("ventebilde: JobMedia har ingen AI-merkelapp, ingen tekst skrevet rett inn og bare tokens", () => {
  const src = read("components/JobMedia.tsx");
  const code = withoutComments(src);
  // Dagsbildet faar aldri AI-merkelappen.
  assert.doesNotMatch(code, /compare\.ai|>\s*AI\s*</);
  assert.match(code, /alt=\{t\(locale, "media\.originalAlt"\)\}/);
  // Ingen synlig tekst skrevet rett inn (D1c-moensteret).
  const blocks = jsxBlocks(code);
  assert.ok(blocks.length >= 2);
  assert.deepEqual(blocks.flatMap((b) => literalTexts(`${b}<`)), []);
  // Bare tokens (D1).
  assert.doesNotMatch(src, /#[0-9a-f]{3,8}\b/i);
  assert.doesNotMatch(src, /-\[(#|rgb)/);
  assert.doesNotMatch(src, /\b(slate|gray|zinc|sky|indigo|purple|emerald|teal|red|amber)-\d/);
  assert.doesNotMatch(src, /\b(text|bg|border)-(white|black)\b/);
});

test("ventebilde: symbolet snurrer bare med CSS og staar stille ved redusert bevegelse", () => {
  const code = withoutComments(read("components/JobMedia.tsx"));
  assert.match(code, /<LoaderCircle[\s\S]*?className="[^"]*animate-\[spin_2s_linear_infinite\] motion-reduce:animate-none"/);
  // Ingen animasjon i JS.
  assert.doesNotMatch(code, /requestAnimationFrame|setInterval|setTimeout/);
  // Statusen staar alltid som tekst ved siden av symbolet.
  assert.match(code, /<span>\{t\(locale, overlay\.key\)\}<\/span>/);
  // Fast boks: 3:2, eller kvadrat i Express.
  assert.match(code, /aspect === "square" \? "aspect-square" : "aspect-\[3\/2\]"/);
});

test("ventebilde: Historikk viser JobMedia fra thumbSrc og henter selv bare mens jobber er i arbeid", () => {
  const page = withoutComments(read("(app)/history/page.tsx"));
  // TG-NEW-153: kortet er components/JobCard.tsx; siden gir det thumbSrc(job).
  assert.match(page, /<JobCard key=\{job\.jobId\} job=\{job\} thumb=\{thumbSrc\(job\)\} \/>/);
  const card = withoutComments(read("components/JobCard.tsx"));
  assert.match(card, /<JobMedia\s*view=\{mediaView\(job, thumb\)\}/);
  assert.doesNotMatch(card, /thumbSrc|\.thumbUrl|\.originalThumbUrl/, "kortet velger ikke bildet selv");
  for (const src of [page, card]) assert.doesNotMatch(src, /history\.noPreview|<img/);
  assert.match(page, /useAutoRefresh\(!loading && jobs\.some\(\(j\) => isWorking\(j\.status\)\), silentRefresh, refreshEpoch\);/);
  assert.match(page, /setJobs\(\(prev\) => mergeRefresh\(prev, rows, PAGE_SIZE\)\);/);
  // «Oppdater» staar.
  assert.match(page, /onClick=\{\(\) => void loadInitial\(\)\} disabled=\{loading\}/);
  const hook = withoutComments(read("hooks/useAutoRefresh.ts"));
  assert.match(hook, /if \(!active\) return;/);
  assert.match(hook, /document\.visibilityState === "hidden"/);
  assert.match(hook, /addEventListener\("visibilitychange", onVisibility\)/);
  assert.match(hook, /control\.stop\(\);\s*document\.removeEventListener\("visibilitychange", onVisibility\);/);
});

test("ventebilde: «Ingen forhåndsvisning» finnes ingen steder i koden", () => {
  for (const f of sourceFiles()) {
    assert.doesNotMatch(read(relative(APP_DIR, f)), /history\.noPreview|Ingen forhåndsvisning/, f);
  }
});

test("ventebilde: Tjenester viser samme symbol mens jobben lages, og resultatet som foer", () => {
  const page = withoutComments(read("(app)/tjenester/page.tsx"));
  assert.match(page, /\) : isProcessing \? \(\s*<JobMedia\s*view=\{workingView\(selectedTool\.service\)\}/);
  assert.match(page, /aspect="square"/);
  assert.match(page, /outputView\(job\.status, job\.imageUrl\)/);
});

// ---------------------------------------------------------------------------
// Opprydding (dag 35): fokusramme, ubrukt tekst, statusordene, «…» og
// tidsgrensen for testene.
// ---------------------------------------------------------------------------

test("opprydding: fokusrammen bare med tastatur (focus-visible), og den finnes fortsatt", () => {
  // focus: (uten -visible/-within) med ring eller outline viser rammen etter museklikk.
  const FOCUS_ON_CLICK = /(^|[\s"'`])focus:(ring|outline)/;
  for (const f of activeFiles().filter((f) => f.endsWith(".tsx") || f.endsWith(".ts"))) {
    assert.doesNotMatch(read(f), FOCUS_ON_CLICK, f);
  }
  const RING = /focus-visible:ring-2 focus-visible:ring-accent/;
  for (const f of [
    "(app)/layout.tsx",
    "components/AppNav.tsx",
    "components/ui/Button.tsx",
    "components/godkjenning/classes.ts",
  ]) {
    assert.match(read(f), RING, f);
  }
  // Markedssidens topplinje bruker FOCUS fra godkjenning/classes.ts.
  assert.match(read("components/marketing/classes.ts"), /export \{ FOCUS \} from "\.\.\/godkjenning\/classes";/);
  assert.match(read("components/marketing/MarketingTopBar.tsx"), /\$\{FOCUS\}/);
});

test("opprydding: express.processing er fjernet fra ordlista og koden", () => {
  for (const locale of ["nb", "en"] as const) {
    assert.ok(!Object.hasOwn(DICTIONARIES[locale].ui, "express.processing"), locale);
  }
  for (const f of sourceFiles()) {
    assert.doesNotMatch(read(relative(APP_DIR, f)), /express\.processing/, f);
  }
});

test("opprydding: statusVariants ligger i app/lib, og ingen importerer den fra (app)/history", () => {
  assert.ok(existsSync(join(APP_DIR, "lib/statusVariants.ts")));
  assert.ok(!existsSync(join(APP_DIR, "(app)/history/statusVariants.ts")));
  for (const f of sourceFiles()) {
    assert.doesNotMatch(read(relative(APP_DIR, f)), /history\/statusVariants|from "\.\/statusVariants"/, f);
  }
  assert.match(read("lib/jobMedia.ts"), /from "\.\/statusVariants\.ts";/);
  assert.match(read("(app)/history/page.tsx"), /from "@\/app\/lib\/statusVariants";/);
});

test("opprydding: alle «…» i ordlista har mellomrom foran", () => {
  for (const locale of ["nb", "en"] as const) {
    const texts = [
      ...Object.values(DICTIONARIES[locale].ui),
      ...Object.values(DICTIONARIES[locale].codes).flatMap((g) => Object.values(g)),
      ...Object.values(DICTIONARIES[locale].generic),
    ];
    assert.deepEqual(texts.filter((s) => /\S…/.test(s)), [], locale);
  }
  assert.equal(t("nb", "review.loading"), "Henter jobben …");
  assert.equal(t("en", "review.statusRunning"), "Creating a new image …");
});

test("opprydding: testkommandoen har en tidsgrense, saa en test som henger, feiler", () => {
  const pkg = JSON.parse(readFileSync(join(REPO_DIR, "package.json"), "utf8"));
  assert.equal(pkg.scripts.test, "node --test --test-timeout=10000");
});

// ---------------------------------------------------------------------------
// TG-NEW-158: ingen synlig tekst skrevet rett inn i noen aktiv .tsx. Filene
// velges av activeFiles() (alt under app/ utenom HIDDEN_DIRS), saa en ny fil
// blir sjekket uten at noen legger den inn. Unntak gjelder enkelttekster, og
// bare mens tekstene ikke vises.
// ---------------------------------------------------------------------------

const TEXT_EXCEPTIONS: { file: string; texts: string[]; why: string; hidden: () => boolean }[] = [
  {
    file: "components/RejectionPanel.tsx",
    texts: [
      "Fortsett som eksteriør",
      "Bildet ble vurdert som interiør",
      "Usikker scene-vurdering",
      "Eksteriør-presets passer ikke for interiørbilder. Hvis du er sikker på at dette faktisk er et eksteriørbilde, kan du overstyre vurderingen:",
      "Klassifisereren klarte ikke avgjøre scene-typen. Hvis dette er et eksteriørbilde, kan du fortsette med eksplisitt overstyring:",
    ],
    why: "avslaget fra den gamle porten kommer bare fra klart_vaer, som er av; tekstene tas i TG-NEW-159",
    hidden: () => !ENABLED.klart_vaer,
  },
];

const ACTIVE_TSX = activeFiles().filter((f) => f.endsWith(".tsx"));

test("TG-158: ingen aktiv .tsx har synlig tekst skrevet rett inn, utover unntakene", () => {
  // Alle funnene samlet, saa feilmeldingen viser hver fil, ikke bare den foerste.
  const hits: Record<string, string[]> = {};
  for (const f of ACTIVE_TSX) {
    const allowed = TEXT_EXCEPTIONS.find((e) => e.file === f)?.texts ?? [];
    // Tom alt="" er riktig for pyntebilder (BrandMark), ikke synlig tekst.
    const texts = literalTextsInFile(read(f)).filter((x) => x !== "" && !allowed.includes(x));
    if (texts.length > 0) hits[f] = texts;
  }
  assert.deepEqual(hits, {});
});

test("TG-158: hver .tsx under components/ blir sjekket", () => {
  const all = readdirSync(join(APP_DIR, "components"), { recursive: true, encoding: "utf8" })
    .filter((f) => f.endsWith(".tsx") && !/\.test\.tsx$/.test(f))
    .map((f) => join("components", f));
  assert.ok(all.includes("components/ErrorPanel.tsx"));
  for (const f of all) assert.ok(ACTIVE_TSX.includes(f), f);
});

test("TG-158: hver .tsx med JSX har JSX-blokker hjelperen ser", () => {
  // Hjelperen ser bare `return ( … );` og `return <…>;`. En fil med JSX
  // (lukkende eller selvlukkende tagg) men uten slike blokker ville slippe gjennom.
  for (const f of ACTIVE_TSX) {
    const code = withoutComments(read(f));
    if (/<\/|\/>/.test(code)) assert.ok(jsxBlocks(code).length > 0, f);
  }
});

test("TG-158: unntakslista har bare filer og tekster som finnes, og bare skjulte tekster", () => {
  for (const e of TEXT_EXCEPTIONS) {
    assert.ok(ACTIVE_TSX.includes(e.file), e.file);
    assert.ok(e.why.length > 0, e.file);
    const found = literalTextsInFile(read(e.file));
    for (const text of e.texts) assert.ok(found.includes(text), `${e.file}: ${text}`);
    assert.ok(e.hidden(), `${e.file} vises naa: flytt tekstene til ordlista og fjern unntaket`);
  }
});

test("TG-158: ErrorPanel henter overskriften fra ordlista", () => {
  const src = withoutComments(read("components/ErrorPanel.tsx"));
  assert.match(src, /const locale = useLocale\(\);/);
  assert.match(src, /\{t\(locale, "error\.title"\)\}/);
  assert.doesNotMatch(src, />\s*Error\s*</);
  assert.equal(t("nb", "error.title"), "Noe gikk galt");
  assert.equal(t("en", "error.title"), "Something went wrong");
});

test("TG-158: UnknownStatusPanel henter teksten fra ordlista", () => {
  const src = withoutComments(read("components/UnknownStatusPanel.tsx"));
  assert.match(src, /const locale = useLocale\(\);/);
  assert.match(src, /\{t\(locale, "unknownStatus\.title"\)\}/);
  assert.equal(t("nb", "unknownStatus.title"), "Vi fikk et uventet svar fra serveren. Prøv igjen.");
  assert.equal(t("en", "unknownStatus.title"), "We got an unexpected response from the server. Please try again.");
});

// ---------------------------------------------------------------------------
// TG-NEW-129: spraakvalget. Rot-layouten for (app) leser cookien, velgeren
// staar i brukermenyen, og teksten til annonsen foelger annonsens spraak.
// ---------------------------------------------------------------------------

test("TG-129: rot-layouten for (app) leser cookien og Accept-Language, og lang foelger spraaket", () => {
  const src = withoutComments(layout);
  assert.match(src, /import \{ cookies, headers \} from "next\/headers";/);
  assert.match(src, /export default async function RootLayout/);
  assert.match(src, /cookie: cookieStore\.get\(LOCALE_COOKIE\)\?\.value,/);
  assert.match(src, /acceptLanguage: headerList\.get\("accept-language"\),/);
  assert.match(src, /<html lang=\{locale\} className=\{fontVariables\}/);
  assert.match(src, /<LocaleProvider locale=\{locale\}>[\s\S]*<AppNav \/>[\s\S]*<AccountMenu \/>[\s\S]*\{children\}[\s\S]*<\/LocaleProvider>/);
  assert.doesNotMatch(src, /<UserButton/, "brukermenyen er AccountMenu");
});

test("TG-129: markedssiden og 404 leser ikke cookien og forblir statiske og norske", () => {
  for (const rel of ["(marketing)/layout.tsx", "global-not-found.tsx"]) {
    const src = withoutComments(read(rel));
    assert.doesNotMatch(src, /next\/headers|cookies\(|headers\(|LocaleProvider|LOCALE_COOKIE/, rel);
    assert.match(src, /<html lang="nb"/, rel);
  }
});

test("TG-129: useLocale leser layoutens spraak, med nettleseren som reserve, og samme signatur", () => {
  const src = withoutComments(read("lib/i18n/useLocale.ts"));
  assert.match(src, /export function useLocale\(\): Locale \{/);
  assert.match(src, /const fromLayout = useContext\(LocaleContext\);/);
  assert.match(src, /return fromLayout \?\? fromBrowser;/);
  assert.match(withoutComments(read("lib/i18n/LocaleProvider.tsx")), /createContext<Locale \| null>\(null\)/);
});

test("TG-129: velgeren i brukermenyen skriver cookien og Clerk, og rendrer paa nytt", () => {
  const src = withoutComments(read("components/AccountMenu.tsx"));
  assert.match(src, /<UserButton\.MenuItems>\s*<UserButton\.Action/);
  assert.match(src, /label=\{t\(next, "account\.languageName"\)\}/);
  assert.match(src, /const next: Locale = locale === "nb" \? "en" : "nb";/);
  // Clerk: update erstatter hele unsafeMetadata, saa resten tas med.
  assert.match(src, /user\.update\(\{ unsafeMetadata: \{ \.\.\.user\.unsafeMetadata, locale: next \} \}\)/);
  assert.match(src, /document\.cookie = localeCookie\(locale, window\.location\.protocol === "https:"\);/);
  assert.match(src, /router\.refresh\(\);/);
  // Verdien fra Clerk valideres, og synken kan ikke overstyre brukerens valg.
  assert.match(src, /parseLocale\(user\?\.unsafeMetadata\?\.locale\)/);
  assert.match(src, /settled\.current = true;\s*writeCookie\(next\);/);
  // Navnet paa spraaket, paa spraaket selv.
  assert.equal(t("nb", "account.languageName"), "Norsk");
  assert.equal(t("en", "account.languageName"), "English");
});

test("TG-129: teksten til annonsen foelger annonsens spraak, aldri brukerens", () => {
  const src = withoutComments(read("components/godkjenning/DisclosureBlock.tsx"));
  assert.match(src, /disclosureText\(DISCLOSURE_LOCALE, disclosure, DISCLOSURE_DETAIL\)/);
  assert.match(src, /lang=\{DISCLOSURE_LOCALE\}/);
  // Ingen aktiv fil lager teksten med brukerens spraak.
  for (const f of activeFiles()) {
    // Kall med locale som foerste argument (definisjonen har `locale: Locale`).
    assert.doesNotMatch(withoutComments(read(f)), /disclosureText\(\s*locale\s*,/, f);
  }
});

test("TG-129: spraaket sendes aldri til backend (XMP og merket foelger ikke appen)", () => {
  // Skal backend faa spraaket senere, maa denne testen endres med vilje.
  for (const f of ["lib/api.ts", "lib/download.ts"]) {
    assert.doesNotMatch(withoutComments(read(f)), /Accept-Language|\blocale\b|\blang\b|LOCALE_COOKIE/i, f);
  }
});
