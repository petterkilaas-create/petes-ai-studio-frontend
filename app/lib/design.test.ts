import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { brandCssVars, DEFAULT_BRAND } from "./brand.ts";

// Redesign D0 (brief v4 §8, §13). node --test kan ikke laste .tsx, saa
// globals.css og layout.tsx sjekkes som tekst (som i L0).

const APP_DIR = fileURLToPath(new URL("..", import.meta.url));
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
  // git grep -i: exit 1 betyr ingen treff. Denne fila unntas (den maa nevne ordet).
  let out = "";
  try {
    out = execFileSync("git", ["grep", "-il", "gavl", "--", ".", ":!app/lib/design.test.ts"], {
      cwd: APP_DIR,
      encoding: "utf8",
    });
  } catch (e) {
    if ((e as { status?: number }).status !== 1) throw e;
  }
  assert.equal(out.trim(), "");
});
