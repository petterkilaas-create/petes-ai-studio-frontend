import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { brandCssVars, DEFAULT_BRAND } from "./brand.ts";
import { DICTIONARIES } from "./i18n/index.ts";
import type { NavId } from "./services.ts";

// Redesign D0 (brief v4 §8, §13). node --test kan ikke laste .tsx, saa
// globals.css og layout.tsx sjekkes som tekst (som i L0).

const APP_DIR = fileURLToPath(new URL("..", import.meta.url));
const REPO_DIR = fileURLToPath(new URL("../..", import.meta.url));
const read = (rel: string) => readFileSync(join(APP_DIR, rel), "utf8");
const css = read("globals.css");
const layout = read("layout.tsx");

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

test("layout.tsx laster begge fontene med next/font, bare som variabler", () => {
  assert.match(layout, /import\s*\{[^}]*\bGeist\b[^}]*\}\s*from\s*"next\/font\/google"/);
  assert.match(layout, /import\s*\{[^}]*\bInstrument_Serif\b[^}]*\}\s*from\s*"next\/font\/google"/);
  assert.match(layout, /variable:\s*"--font-instrument-serif"/);
  assert.match(layout, /variable:\s*"--font-geist"/);
  assert.match(layout, /instrumentSerif\.variable/);
  assert.match(layout, /geist\.variable/);
  assert.doesNotMatch(layout, /(instrumentSerif|geist)\.className/, ".className bytter font (synlig)");
  assert.match(layout, /brandCssVars\(/);
});

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

test("visningsnavnet staar ikke skrevet rett inn i .tsx (kommer fra brand.ts)", () => {
  const hits = sourceFiles()
    .filter((f) => f.endsWith(".tsx"))
    .filter((f) => readFileSync(f, "utf8").includes(DEFAULT_BRAND.displayName));
  assert.deepEqual(hits, []);
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

/** Skjulte sider: viser bare ServiceUnavailable og ryddes i D5. */
const HIDDEN_DIRS = ["staging", "express-v2", "video", "copywriter", "orders"];

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
  return out;
}

test("D1: listen over aktive filer har skallet, sidene og komponentene", () => {
  const files = activeFiles();
  for (const f of [
    "layout.tsx",
    "page.tsx",
    "globals.css",
    "express/page.tsx",
    "history/page.tsx",
    "history/statusVariants.ts",
    "lib/services.ts",
    "components/AppNav.tsx",
    "components/ServiceUnavailable.tsx",
    "components/ui/Button.tsx",
    "godkjenning/[jobId]/page.tsx",
    "components/PreviewPlaceholder.tsx",
  ]) {
    assert.ok(files.includes(f), f);
  }
  assert.ok(!files.some((f) => f.startsWith("video/") || f.startsWith("orders/")));
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
  assert.match(layout, /\{brand\.displayName\}/);
  assert.match(layout, /brand\.logo\.url/);
  assert.match(layout, /brand\.logo\.monogram/);
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
  for (const [dir, title] of [["express", "Express"], ["history", "Historikk"], ["godkjenning", "Godkjenning"]]) {
    assert.match(read(`${dir}/layout.tsx`), new RegExp(`title: "${title}"`), dir);
  }
});

test("D1b: godkjenningssiden og PreviewPlaceholder bruker bare tokenene", () => {
  for (const f of ["godkjenning/[jobId]/page.tsx", "components/PreviewPlaceholder.tsx"]) {
    const src = read(f);
    assert.doesNotMatch(src, /#[0-9a-f]{3,8}\b/i, f);
    assert.doesNotMatch(src, /-\[(#|rgb)/, f);
    assert.doesNotMatch(src, /\b(slate|gray|zinc|sky|indigo|purple|emerald|teal)-\d/, f);
    assert.doesNotMatch(src, /\b(text|bg|border)-(white|black)\b/, f);
    assert.doesNotMatch(src, /\b(red|amber)-\d/, f);
  }
  const page = read("godkjenning/[jobId]/page.tsx");
  // Knappene og kortene er de felles komponentene (primary, ikke turkis).
  assert.match(page, /const BTN_PRIMARY = buttonClass\("primary"\);/);
  assert.match(page, /const BTN_SECONDARY = buttonClass\("secondary"\);/);
  assert.match(page, /const BTN_DANGER = buttonClass\("danger"\);/);
  assert.match(page, /const CARD = cardClass\(/);
  assert.match(page, /<h1 className="font-display /);
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

const NAV_IDS: NavId[] = ["express", "staging", "video", "copywriter", "orders", "history"];

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
    assert.match(ui["home.title"], /\{name\}/, locale);
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
      assert.ok(!text.includes(DEFAULT_BRAND.displayName), `${locale} ${key}`);
    }
  }
  assert.match(read("page.tsx"), /t\(locale, "home\.title", \{ name: brand\.displayName \}\)/);
});

test("D1: testene for annonseteksten og lekkasjevernet er uendret", () => {
  // sha256 fra main foer D1 (249cee3). Endres de, maa det vaere et eget valg.
  const expected: Record<string, string> = {
    "lib/disclosure.test.ts": "8acedaed814203b88c6395209b43ffe7798734b58d888b63985f9126937769ce",
    "lib/previews.test.ts": "c0b012e49efa3483912d61301aeac1c4ca78a526a5e0ced406beb0e15f7a13b0",
    "lib/jobState.test.ts": "cac4d79a9ed60e6307f4cdd0118fcba43c22b8aa8ba7a783ba4c0e1522a818c5",
  };
  for (const [rel, hash] of Object.entries(expected)) {
    assert.equal(createHash("sha256").update(readFileSync(join(APP_DIR, rel))).digest("hex"), hash, rel);
  }
});
