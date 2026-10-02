import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_BRAND } from "../../app/lib/brand.ts";
import {
  isMarketingPath,
  isOpenMarketingPath,
  MARKETING_HOME,
  MARKETING_PUBLIC,
  rootTarget,
  START_PATH,
} from "../../app/lib/marketingAccess.ts";
import { literalTextsInFile, withoutComments } from "../../app/lib/testing/jsxText.ts";
import { fill } from "./fill.ts";
import { getHome, getSite } from "./index.ts";

// MS2: markedssiden (skall, innholdsfil og toppen), /start, proxyen og 404.
// node --test kan ikke laste .tsx, saa komponentene og proxy.ts sjekkes som
// tekst (som i L0 og D1c).

const REPO_DIR = fileURLToPath(new URL("../..", import.meta.url));
const CONTENT_DIR = fileURLToPath(new URL(".", import.meta.url));
const read = (rel: string) => readFileSync(join(REPO_DIR, rel), "utf8");

const site = getSite("no");
const home = getHome("no");

/** Alle .ts/.tsx i en mappe (rekursivt), uten testfilene. Relativt til repoet. */
function filesIn(rel: string, ext = /\.tsx?$/): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (ext.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(relative(REPO_DIR, p));
    }
  };
  walk(join(REPO_DIR, rel));
  return out;
}

const MARKETING_TSX = [
  ...filesIn("app/(marketing)", /\.tsx$/),
  ...filesIn("app/components/marketing", /\.tsx$/),
  "app/global-not-found.tsx",
];

/** Alle strenger i et objekt, med stien til feltet. */
function strings(value: unknown, path = ""): [string, string][] {
  if (typeof value === "string") return [[path, value]];
  if (Array.isArray(value)) return value.flatMap((v, i) => strings(v, `${path}[${i}]`));
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([k, v]) => strings(v, path ? `${path}.${k}` : k));
  }
  return [];
}

// ---------------------------------------------------------------------------
// Ingen tekst i JSX
// ---------------------------------------------------------------------------

test("MS2: markedssidene og komponentene har ingen synlig tekst skrevet rett inn", () => {
  for (const f of [
    "app/(marketing)/layout.tsx",
    "app/(marketing)/no/page.tsx",
    "app/components/marketing/MarketingTopBar.tsx",
    "app/components/marketing/Hero.tsx",
    "app/components/marketing/HeroSlider.tsx",
  ]) {
    assert.ok(MARKETING_TSX.includes(f), f);
  }
  for (const f of MARKETING_TSX) {
    assert.deepEqual(literalTextsInFile(read(f)), [], f);
  }
});

// ---------------------------------------------------------------------------
// Innholdet
// ---------------------------------------------------------------------------

test("MS2: innholdet har alle feltene, og alle har tekst", () => {
  assert.equal(site._type, "site");
  assert.equal(site.topBar._type, "topBar");
  assert.equal(site.notFound._type, "notFound");
  assert.equal(home._type, "home");
  assert.equal(home.hero._type, "hero");
  assert.deepEqual(
    site.topBar.links.map((l) => l.label),
    ["Tjenester", "Eksempler", "Priser", "For kjeder og partnere"]
  );
  const all = [...strings(site, "site"), ...strings(home, "home")];
  for (const key of [
    "site.seo.title",
    "site.topBar.logoLabel",
    "site.topBar.navLabel",
    "site.topBar.login.label",
    "site.cta.label",
    "site.notFound.pageTitle",
    "site.notFound.title",
    "site.notFound.text",
    "site.notFound.toApp.label",
    "site.notFound.toHome.label",
    "home.hero.eyebrow",
    "home.hero.title",
    "home.hero.lead",
    "home.hero.secondary.label",
    "home.hero.freeNote",
    "home.hero.before.alt",
    "home.hero.after.alt",
    "home.hero.labels.original",
    "home.hero.labels.result",
    "home.hero.labels.ai",
    "home.hero.sliderLabel",
    "home.hero.sliderValue",
    "home.hero.caption",
  ]) {
    assert.ok(all.some(([p]) => p === key), key);
  }
  for (const [path, text] of all) assert.ok(text.trim().length > 0, path);
  // Bare kjente plassholdere, saa ingen {x} blir staaende paa siden.
  for (const [path, text] of all) {
    for (const m of text.matchAll(/\{(\w+)\}/g)) assert.ok(["brand", "n"].includes(m[1]), `${path}: {${m[1]}}`);
  }
});

test("MS2: bildene har alt-tekst og finnes i images.ts, og bare images.ts importerer bilder", () => {
  const images = read("content/marketing/images.ts");
  for (const ref of [home.hero.before, home.hero.after]) {
    assert.ok(ref.alt.trim().length > 10, ref.image);
    assert.match(images, new RegExp(`^  ${ref.image},$`, "m"), ref.image);
  }
  for (const m of images.matchAll(/^import \w+ from "\.\/(images\/[\w-]+\.jpg)";$/gm)) {
    assert.ok(existsSync(join(CONTENT_DIR, m[1])), m[1]);
  }
  assert.equal([...images.matchAll(/^import \w+ from "\.\/images\//gm)].length, 2);
  for (const f of filesIn("content").filter((f) => f !== "content/marketing/images.ts")) {
    assert.doesNotMatch(read(f), /\.(jpe?g|png|webp|avif)"/, f);
  }
  // JPG i 1536x1024 (Petter 02.10). SOF0/SOF2: hoeyde og bredde etter markoeren.
  for (const name of ["hero-original.jpg", "hero-kveld.jpg"]) {
    const jpg = readFileSync(join(CONTENT_DIR, "images", name));
    assert.equal(jpg.readUInt16BE(0), 0xffd8, name);
    let i = 2;
    while (i < jpg.length && !(jpg[i] === 0xff && (jpg[i + 1] === 0xc0 || jpg[i + 1] === 0xc2))) {
      i += 2 + jpg.readUInt16BE(i + 2);
    }
    assert.deepEqual([jpg.readUInt16BE(i + 7), jpg.readUInt16BE(i + 5)], [1536, 1024], name);
  }
});

test("MS2: antallet gratisbilder staar ett sted (offer.freeImages), ikke i teksten", () => {
  assert.equal(site.offer.freeImages, 3);
  assert.match(home.hero.freeNote, /\{n\}/);
  for (const [path, text] of [...strings(site, "site"), ...strings(home, "home")]) {
    assert.doesNotMatch(text, /\d/, path);
  }
  assert.equal(
    fill(home.hero.freeNote, { n: site.offer.freeImages }),
    "3 gratis kveldsbilder når du registrerer deg. Uten kort."
  );
  assert.ok(read("app/components/marketing/Hero.tsx").includes("fill(hero.freeNote, { n: site.offer.freeImages })"));
});

test("MS2: «Prøv gratis» staar ett sted (site.cta) og brukes i topplinjen og toppen", () => {
  assert.deepEqual(site.cta, { label: "Prøv gratis", href: "/start" });
  assert.ok(read("app/components/marketing/MarketingTopBar.tsx").includes("{cta.label}"));
  assert.ok(read("app/components/marketing/Hero.tsx").includes("{site.cta.label}"));
});

test("MS2: under 820 px skjules bare menylenkene, «Logg inn» og «Prøv gratis» vises alltid", () => {
  const src = withoutComments(read("app/components/marketing/MarketingTopBar.tsx"));
  assert.match(src, /<nav aria-label=\{topBar\.navLabel\} className="hidden [^"]*min-\[820px\]:flex">/);
  const login = src.slice(src.indexOf("<a href={topBar.login.href}"), src.indexOf("{topBar.login.label}"));
  const cta = src.slice(src.indexOf("href={cta.href}"), src.indexOf("{cta.label}"));
  for (const [name, part] of [["login", login], ["cta", cta]]) {
    assert.ok(part.length > 0, name);
    assert.doesNotMatch(part, /\bhidden\b|max-\[|sr-only/, name);
  }
});

test("MS2: lenkene i innholdet er ankre, /start eller markedssiden", () => {
  for (const [path, href] of [...strings(site, "site"), ...strings(home, "home")].filter(([p]) => p.endsWith(".href") || p.endsWith("logoHref"))) {
    assert.ok(/^#[a-z]+$/.test(href) || href === START_PATH || href === MARKETING_HOME, `${path}: ${href}`);
  }
  assert.equal(site.topBar.logoHref, `#${home.hero.anchor}`);
  assert.equal(site.topBar.login.href, START_PATH);
});

// ---------------------------------------------------------------------------
// Merket
// ---------------------------------------------------------------------------

test("MS2: verken merkenavnet eller «Studio» staar i content/ eller i markedskomponentene", () => {
  const files = [...filesIn("content"), ...MARKETING_TSX, ...filesIn("app/components/marketing")];
  assert.ok(files.length >= 10);
  for (const f of files) {
    const src = read(f);
    for (const name of [DEFAULT_BRAND.displayName, "Husvy", "The Studio"]) {
      assert.ok(!src.toLowerCase().includes(name.toLowerCase()), `${f}: ${name}`);
    }
    assert.doesNotMatch(src, /\bstudio\b/i, f);
  }
});

test("MS2: markedssiden og 404 bruker standardmerket via BrandMark, aldri resolveBrand", () => {
  for (const f of ["app/(marketing)/no/page.tsx", "app/global-not-found.tsx"]) {
    const src = withoutComments(read(f));
    assert.match(src, /const brand = DEFAULT_BRAND;/, f);
    assert.doesNotMatch(src, /resolveBrand/, f);
  }
  assert.match(read("app/components/marketing/MarketingTopBar.tsx"), /<BrandMark brand=\{brand\} \/>/);
  assert.match(read("app/global-not-found.tsx"), /<BrandMark brand=\{brand\} \/>/);
  for (const f of MARKETING_TSX) assert.doesNotMatch(withoutComments(read(f)), /resolveBrand/, f);
  // Tekster som nevner merket, bruker {brand}.
  assert.match(site.seo.title, /^\{brand\} /);
  assert.match(site.topBar.logoLabel, /^\{brand\}, /);
  assert.match(site.notFound.pageTitle, /· \{brand\}$/);
});

// ---------------------------------------------------------------------------
// Proxyen og tilgangen
// ---------------------------------------------------------------------------

const proxy = read("proxy.ts");

/** Matcherne i proxy.ts som JS-regex (path-to-regexp-moensteret er ogsaa gyldig regex). */
function matchers(): RegExp[] {
  const block = proxy.slice(proxy.indexOf("matcher: ["), proxy.indexOf("],", proxy.indexOf("matcher: [")));
  return [...block.matchAll(/^\s*'([^']+)',$/gm)].map((m) => new RegExp(`^${m[1].replace(/\\\\/g, "\\")}$`));
}
const proxyRuns = (path: string) => matchers().some((r) => r.test(path));

test("MS2: proxyen beskytter app-rutene som foer", () => {
  assert.match(proxy, /const isPublicRoute = createRouteMatcher\(\['\/sign-in\(\.\*\)', '\/sign-up\(\.\*\)'\]\)/);
  assert.match(
    proxy,
    /if \(!isPublicRoute\(request\) && !isOpenMarketingPath\(pathname, MARKETING_PUBLIC\)\) \{\n\s*await auth\.protect\(\)\n\s*\}/
  );
  // Matcheren er uendret fra foer MS2: proxyen kjoerer paa alle sider.
  assert.equal(matchers().length, 2);
  for (const path of ["/", "/start", "/express", "/history", "/godkjenning/abc", "/no", "/no/x", "/finnes-ikke", "/api/x"]) {
    assert.ok(proxyRuns(path), path);
  }
  assert.ok(!proxyRuns("/_next/static/x.js"));
  // Ingen app-rute er aapen, uansett flagget.
  for (const pub of [false, true]) {
    for (const path of ["/", "/start", "/express", "/history", "/godkjenning/abc", "/staging", "/nokke", "/no-x", "/finnes-ikke"]) {
      assert.equal(isOpenMarketingPath(path, pub), false, `${path} (${pub})`);
    }
  }
});

test("MS2: / sender innloggede til /start, og andre til innlogging til lansering", () => {
  assert.match(proxy, /if \(pathname === '\/'\) \{\n\s*const \{ userId \} = await auth\(\)\n\s*const target = rootTarget\(Boolean\(userId\), MARKETING_PUBLIC\)\n\s*if \(target\) return NextResponse\.redirect\(new URL\(target, request\.url\)\)/);
  assert.equal(START_PATH, "/start");
  assert.equal(rootTarget(true, false), "/start");
  assert.equal(rootTarget(true, true), "/start");
  assert.equal(rootTarget(false, false), null);
  assert.equal(rootTarget(false, true), "/no");
  // Reserven: (app)/page.tsx sender ogsaa til /start, og logoen i appen gaar dit.
  assert.match(read("app/(app)/page.tsx"), /redirect\(START_PATH\);/);
  assert.match(read("app/(app)/layout.tsx"), /href=\{START_PATH\}/);
  assert.doesNotMatch(read("app/(app)/layout.tsx"), /href="\/"/);
});

test("MS2: MARKETING_PUBLIC styrer /no, og matcheren og noindex henger sammen med flagget", () => {
  assert.ok(isMarketingPath("/no") && isMarketingPath("/no/x"));
  assert.ok(!isMarketingPath("/nokke") && !isMarketingPath("/no-x") && !isMarketingPath("/"));
  // Begge tilstandene.
  assert.equal(isOpenMarketingPath("/no", false), false);
  assert.equal(isOpenMarketingPath("/no/x", false), false);
  assert.equal(isOpenMarketingPath("/no", true), true);
  assert.equal(isOpenMarketingPath("/no/x", true), true);
  // Markedslayouten: noindex naar siden ikke er offentlig.
  assert.match(
    read("app/(marketing)/layout.tsx"),
    /robots: MARKETING_PUBLIC \? undefined : \{ index: false, follow: false \},/
  );
  if (MARKETING_PUBLIC) {
    // Lansering: /no er tatt ut av matcheren, saa proxyen ikke kjoerer der.
    assert.ok(!proxyRuns("/no") && !proxyRuns("/no/x"), "MARKETING_PUBLIC er true, men /no er i matcheren");
  } else {
    assert.ok(proxyRuns("/no") && proxyRuns("/no/x"), "MARKETING_PUBLIC er false, men /no er tatt ut av matcheren");
  }
});

// ---------------------------------------------------------------------------
// Layouten, toppbildet og 404
// ---------------------------------------------------------------------------

test("MS2: markedssiden har ingen ClerkProvider og ingen import fra @clerk/*", () => {
  for (const f of [...MARKETING_TSX, ...filesIn("content")]) {
    const src = withoutComments(read(f));
    assert.doesNotMatch(src, /ClerkProvider/, f);
    assert.doesNotMatch(src, /from ["']@clerk\//, f);
  }
  const layout = read("app/(marketing)/layout.tsx");
  assert.match(layout, /<html lang="nb"/);
  assert.doesNotMatch(layout, /AppNav|UserButton/);
});

test("MS2: toppbildet har hoey prioritet og faste maal, originalen lastes uten hoey prioritet", () => {
  const src = withoutComments(read("app/components/marketing/HeroSlider.tsx"));
  const images = [...src.matchAll(/<Image\n([\s\S]*?)\/>/g)].map((m) => m[1]);
  assert.equal(images.length, 2);
  const [after, before] = images;
  assert.match(after, /src=\{after\.src\}/);
  assert.match(after, /alt=\{after\.alt\}/);
  assert.match(after, /loading="eager"/);
  assert.match(after, /fetchPriority="high"/);
  assert.match(before, /src=\{before\.src\}/);
  assert.match(before, /alt=\{before\.alt\}/);
  assert.match(before, /loading="eager"/);
  assert.doesNotMatch(before, /fetchPriority/);
  for (const img of images) {
    assert.match(img, /\bfill\b/);
    assert.match(img, /sizes=\{SIZES\}/);
    assert.doesNotMatch(img, /\bpriority\b|\bpreload\b/, "priority er utgaatt i Next 16");
  }
  // Faste maal: fill i en boks med fast forhold.
  assert.match(src, /className="relative aspect-\[3\/2\] w-full/);
  assert.match(src, /const SIZES = "\(min-width: 1320px\) 780px, \(min-width: 1024px\) 60vw, 100vw";/);
  // Bildene er statisk importert (bredde og hoeyde fra next/image).
  assert.match(read("app/components/marketing/Hero.tsx"), /src: IMAGES\[hero\.after\.image\]/);
});

test("MS2: slideren kan styres uten aa dra (WCAG 2.5.7) og har AI-merkelappen", () => {
  const src = withoutComments(read("app/components/marketing/HeroSlider.tsx"));
  for (const attr of ['role="slider"', "tabIndex={0}", "aria-valuemin={0}", "aria-valuemax={100}", "aria-valuenow={value}", "aria-label={sliderLabel}"]) {
    assert.ok(src.includes(attr), attr);
  }
  assert.match(src, /aria-valuetext=\{fill\(sliderValue, \{ n: value \}\)\}/);
  assert.match(src, /onKeyDown=\{onKeyDown\}/);
  assert.match(src, /const next = sliderKey\(value, e\.key, e\.shiftKey\);/);
  assert.match(src, /ref=\{trackRef\}[\s\S]*?onPointerDown=\{onPointerDown\}/);
  assert.match(src, /setValue\(valueFromPointer\(/);
  assert.ok(src.includes("touch-pan-y"));
  assert.match(src, /\{labels\.ai\}/);
  assert.match(src, /\{labels\.result\}/);
});

test("MS2: 404-siden har merket, lenkene og ingen tekst skrevet rett inn", () => {
  assert.match(read("next.config.ts"), /experimental: \{[\s\S]*globalNotFound: true,/);
  const src = read("app/global-not-found.tsx");
  assert.match(src, /import "\.\/globals\.css";/);
  assert.match(src, /\{notFound\.title\}/);
  assert.match(src, /\{notFound\.text\}/);
  assert.match(src, /href=\{notFound\.toApp\.href\}/);
  assert.match(src, /href=\{notFound\.toHome\.href\}/);
  assert.match(src, /title: fill\(notFound\.pageTitle, \{ brand: brand\.displayName \}\)/);
  assert.deepEqual(site.notFound.toApp, { label: "Til appen", href: START_PATH });
  assert.deepEqual(site.notFound.toHome, { label: "Til forsiden", href: MARKETING_HOME });
  assert.equal(site.notFound.pageTitle, "Fant ikke siden · {brand}");
  assert.deepEqual(literalTextsInFile(src), []);
});
