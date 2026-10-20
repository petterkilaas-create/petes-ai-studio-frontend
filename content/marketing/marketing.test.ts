import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_BRAND } from "../../app/lib/brand.ts";
import {
  CONTACT_PATH,
  FAQ_PATH,
  isMarketingPath,
  isOpenMarketingPath,
  LABELING_PATH,
  MARKETING_HOME,
  MARKETING_PAGES,
  MARKETING_PUBLIC,
  rootTarget,
  START_PATH,
} from "../../app/lib/marketingAccess.ts";
import { literalTextsInFile, withoutComments } from "../../app/lib/testing/jsxText.ts";
import { DUSK_SKY_BY_TIME, DEFAULT_DUSK } from "../../app/lib/dusk.ts";
import { DICTIONARIES } from "../../app/lib/i18n/index.ts";
import { DISCLOSURE_DETAIL, DISCLOSURE_LOCALE, disclosureText } from "../../app/lib/disclosure.ts";
import { isServiceEnabled } from "../../app/lib/services.ts";
import { tabKey } from "../../app/lib/tabs.ts";
import { fill, fillParts } from "./fill.ts";
import { getContactPage, getFaq, getFaqPage, getHome, getLabelingPage, getSite } from "./index.ts";
import { contentAnchors, onPage, visibleLinks } from "./links.ts";
import { perImage, priceVars } from "./offer.ts";
import { pendingItems } from "./pending.ts";
import type { VideoKey } from "./schema.ts";
import { VIDEOS } from "./videos.ts";

// MS2: markedssiden (skall, innholdsfil og toppen), /start, proxyen og 404.
// node --test kan ikke laste .tsx, saa komponentene og proxy.ts sjekkes som
// tekst (som i L0 og D1c).

const REPO_DIR = fileURLToPath(new URL("../..", import.meta.url));
const CONTENT_DIR = fileURLToPath(new URL(".", import.meta.url));
const read = (rel: string) => readFileSync(join(REPO_DIR, rel), "utf8");

const site = getSite("no");
const home = getHome("no");
const faq = getFaq("no");
const faqPage = getFaqPage("no");
const labelingPage = getLabelingPage("no");
const contactPage = getContactPage("no");

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

/**
 * Plassene malene i innholdet kan ha. MS3b: prisene og antallene (offer.ts),
 * e-posten, tiden, aarstallet og selskapsnavnet (de tre siste venter). MS4:
 * overskriften i alt-teksten til delingsbildet.
 */
const TEMPLATE_KEYS = [
  "brand",
  "n",
  "price",
  "perImage",
  "single",
  "bundle",
  "bundleCount",
  "privacyBlur",
  "email",
  "time",
  "year",
  "companyName",
  "title",
  "name",
];

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
    ["Tjenester", "Se filmen", "Eksempler", "Priser", "For kjeder og partnere"]
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
    "home.hero.titleEmphasis",
    "home.hero.lead",
    "home.hero.secondary.label",
    "home.hero.freeNote",
    "home.hero.mosaic.label",
    "home.hero.aiLabel",
    // F5: slideren staar i eksemplene.
    "home.examples.lead",
    "home.examples.aiLabel",
    "home.examples.slider.original",
    "home.examples.slider.label",
    "home.examples.slider.value",
    ...home.examples.tabs.flatMap((_, i) =>
      ["label", "result", "before.alt", "after.alt", "caption.text"].map((k) => `home.examples.tabs[${i}].${k}`)
    ),
  ]) {
    assert.ok(all.some(([p]) => p === key), key);
  }
  for (const [path, text] of all) assert.ok(text.trim().length > 0, path);
  // Bare kjente plassholdere, saa ingen {x} blir staaende paa siden.
  for (const [path, text] of all) {
    for (const m of text.matchAll(/\{(\w+)\}/g)) assert.ok(TEMPLATE_KEYS.includes(m[1]), `${path}: {${m[1]}}`);
  }
});

test("MS2: bildene har alt-tekst og finnes i images.ts, og bare images.ts importerer bilder", () => {
  const images = read("content/marketing/images.ts");
  for (const ref of home.examples.tabs.flatMap((t) => [t.before, t.after])) {
    assert.ok(ref.alt.trim().length > 10, ref.image);
    assert.match(images, new RegExp(`^  ${ref.image},$`, "m"), ref.image);
  }
  for (const m of images.matchAll(/^import \w+ from "\.\/(images\/[\w-]+\.jpg)";$/gm)) {
    assert.ok(existsSync(join(CONTENT_DIR, m[1])), m[1]);
  }
  assert.equal([...images.matchAll(/^import \w+ from "\.\/images\//gm)].length, 11);
  for (const f of filesIn("content").filter((f) => f !== "content/marketing/images.ts")) {
    assert.doesNotMatch(read(f), /\.(jpe?g|png|webp|avif)"/, f);
  }
  // JPG i 1536x1024 (Petter 02.10); merkebildet er 1536x1040 (beslutning 4,
  // 19.10). F1: parene er 1536x1024, plakatene har videoens forhold.
  const sizes: Record<string, readonly number[]> = {};
  for (const [name, size] of [
    ["hero-original.jpg", [1536, 1024]],
    ["hero-kveld.jpg", [1536, 1024]],
    ["merking-kveld.jpg", [1536, 1040]],
    ["par-kveld-original.jpg", [1536, 1024]],
    ["par-kveld-resultat.jpg", [1536, 1024]],
    ["par-rydd-original.jpg", [1536, 1024]],
    ["par-rydd-resultat.jpg", [1536, 1024]],
    ["par-styling-original.jpg", [1536, 1024]],
    ["par-styling-resultat.jpg", [1536, 1024]],
    ["film-plakat.jpg", [1280, 720]],
    ["lokke-plakat.jpg", [720, 480]],
  ] as const) {
    sizes[name] = jpgSize(name);
    assert.deepEqual(sizes[name], size, name);
  }
  // Originalen og resultatet i hvert par har samme stoerrelse (samme utsnitt).
  for (const pair of ["kveld", "rydd", "styling"]) {
    assert.deepEqual(sizes[`par-${pair}-original.jpg`], sizes[`par-${pair}-resultat.jpg`], pair);
  }
});

/** Bredde og hoeyde paa en JPG i images/. SOF0/SOF2: hoeyde og bredde etter markoeren. */
function jpgSize(name: string): [number, number] {
  const jpg = readFileSync(join(CONTENT_DIR, "images", name));
  assert.equal(jpg.readUInt16BE(0), 0xffd8, name);
  let i = 2;
  while (i < jpg.length && !(jpg[i] === 0xff && (jpg[i + 1] === 0xc0 || jpg[i + 1] === 0xc2))) {
    i += 2 + jpg.readUInt16BE(i + 2);
  }
  return [jpg.readUInt16BE(i + 7), jpg.readUInt16BE(i + 5)];
}

test("MS2: antallet gratisbilder staar ett sted (offer.freeImages), ikke i teksten", () => {
  assert.equal(site.offer.freeImages, 3);
  assert.match(home.hero.freeNote, /\{n\}/);
  for (const [path, text] of [...strings(site, "site"), ...strings(home, "home")]) {
    assert.doesNotMatch(text, /\d/, path);
  }
  assert.equal(
    fill(home.hero.freeNote, { n: site.offer.freeImages }),
    "3 gratis bilder når du registrerer deg. Uten kort."
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

test("MS2: lenkene i innholdet er ankre, /start eller markedssidene", () => {
  const docs = { site, home, faqPage, labelingPage, contactPage };
  for (const [path, href] of strings(docs).filter(([p]) => p.endsWith(".href") || p.endsWith("logoHref"))) {
    assert.ok(/^#[a-z]+$/.test(href) || href === START_PATH || MARKETING_PAGES.includes(href), `${path}: ${href}`);
  }
  assert.equal(site.topBar.logoHref, `#${home.hero.anchor}`);
  assert.equal(site.topBar.login.href, START_PATH);
});

// ---------------------------------------------------------------------------
// Merket
// ---------------------------------------------------------------------------

/**
 * «studio» (F3, Petter 20.10): forsiden deles i Bildestudio, Filmstudio osv.,
 * og overlinja er «AI-studio for eiendomsmeglere». Fortsatt forbudt, fordi
 * siden er white label (navnet kommer fra brand.ts): det gamle navnet «The
 * Studio» (uansett store og smaa bokstaver) og «Studio» med stor S brukt som
 * navn, altsaa som eget ord og ikke etter bindestrek. Samme regel som i
 * design.test.ts.
 */
function usesOldStudioName(text: string): boolean {
  return /the studio/i.test(text) || /(?<![-\p{L}\p{N}_])Studio(?![\p{L}\p{N}_])/u.test(text);
}

test("F3: «studio»-regelen stopper «The Studio» og «Studio» som navn, men godtar «AI-studio» og «Bildestudio»", () => {
  for (const bad of ["The Studio", "the studio", "THE STUDIO", "Studio for meglere", "Velkommen til Studio.", "(Studio)"]) {
    assert.ok(usesOldStudioName(bad), bad);
  }
  for (const ok of ["AI-studio for eiendomsmeglere", "Bildestudio", "Filmstudio og Tekststudio", "studioet", "AI-Studio"]) {
    assert.ok(!usesOldStudioName(ok), ok);
  }
});

test("MS2: verken merkenavnet, «The Studio» eller «Studio» som navn staar i content/ eller i markedskomponentene", () => {
  const files = [...filesIn("content"), ...MARKETING_TSX, ...filesIn("app/components/marketing")];
  assert.ok(files.length >= 10);
  for (const f of files) {
    const src = read(f);
    for (const name of [DEFAULT_BRAND.displayName, "Husvy", "The Studio"]) {
      assert.ok(!src.toLowerCase().includes(name.toLowerCase()), `${f}: ${name}`);
    }
    assert.ok(!usesOldStudioName(src), f);
  }
  // F3: «AI-studio» er tillatt og staar i overlinja og fanetittelen.
  assert.ok(home.hero.eyebrow.includes("AI-studio") && site.seo.title.includes("AI-studio"));
});

test("MS2: markedssiden og 404 bruker standardmerket via BrandMark, aldri resolveBrand", () => {
  for (const f of ["app/(marketing)/no/page.tsx", "app/global-not-found.tsx"]) {
    const src = withoutComments(read(f));
    assert.match(src, /const brand = DEFAULT_BRAND;/, f);
    assert.doesNotMatch(src, /resolveBrand/, f);
  }
  // MS3b: navnet vises alltid paa markedssiden, ogsaa i smalt vindu (Petter 02.10).
  assert.match(read("app/components/marketing/MarketingTopBar.tsx"), /<BrandMark brand=\{brand\} alwaysShowName \/>/);
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
  for (const path of [
    "/",
    "/start",
    "/tjenester",
    "/express",
    "/history",
    "/godkjenning/abc",
    "/no",
    "/no/x",
    "/finnes-ikke",
    "/api/x",
  ]) {
    assert.ok(proxyRuns(path), path);
  }
  assert.ok(!proxyRuns("/_next/static/x.js"));
  // Ingen app-rute er aapen, uansett flagget.
  for (const pub of [false, true]) {
    for (const path of [
      "/",
      "/start",
      "/tjenester",
      "/express",
      "/history",
      "/godkjenning/abc",
      "/staging",
      "/nokke",
      "/no-x",
      "/finnes-ikke",
    ]) {
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

test("F5: slideren lastes lat og har faste maal og sizes som prop", () => {
  const src = withoutComments(read("app/components/marketing/HeroSlider.tsx"));
  const images = [...src.matchAll(/<Image\n([\s\S]*?)\/>/g)].map((m) => m[1]);
  assert.equal(images.length, 2);
  const [after, before] = images;
  assert.match(after, /src=\{after\.src\}/);
  assert.match(after, /alt=\{after\.alt\}/);
  assert.match(before, /src=\{before\.src\}/);
  assert.match(before, /alt=\{before\.alt\}/);
  for (const img of images) {
    assert.match(img, /\bfill\b/);
    assert.match(img, /sizes=\{sizes\}/);
  }
  // Slideren staar langt nede paa siden: ingen hoey prioritet og ingen eager.
  assert.doesNotMatch(src, /fetchPriority|loading="eager"|\bpriority\b|\bpreload\b/);
  // Faste maal: fill i en boks med fast forhold.
  assert.match(src, /className="relative aspect-\[3\/2\] w-full/);
  // Standardbredden er hele containeren.
  assert.match(src, /const SIZES = "\(min-width: 1320px\) 1224px, 100vw";/);
  assert.match(src, /sizes = SIZES,/);
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
  // F5: en slider per fane, som monteres paa nytt ved bytte (tilbake til 50 %).
  const tabs = withoutComments(read("app/components/marketing/ExampleTabs.tsx"));
  assert.equal(tabs.split("<HeroSlider").length - 1, 1);
  assert.match(tabs, /<HeroSlider\s+key=\{tab\.id\}/);
  assert.match(tabs, /labels=\{\{ original: slider\.original, result: tab\.result, ai: labels\.ai \}\}/);
  assert.match(tabs, /sliderLabel=\{slider\.label\}/);
  assert.match(tabs, /sliderValue=\{slider\.value\}/);
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

// ---------------------------------------------------------------------------
// MS3a: tillitsstripen, eksemplene, stemningene, tre steg, tjenestene og
// mobilmenyen, med det som venter og lenkene (regel 3-6).
// ---------------------------------------------------------------------------

const MS3A_TSX = [
  "TrustStrip",
  "Examples",
  "ExampleTabs",
  "Moods",
  "MoodPicker",
  "Steps",
  "Services",
  "MobileMenu",
  "MarketingPicture",
  "PendingMark",
].map((n) => `app/components/marketing/${n}.tsx`);

test("MS3a: de nye komponentene er med i teksttesten (ingen synlig tekst i JSX)", () => {
  for (const f of MS3A_TSX) {
    assert.ok(MARKETING_TSX.includes(f), f);
    assert.deepEqual(literalTextsInFile(read(f)), [], f);
  }
});

test("MS3a: seksjonene finnes i rekkefoelgen paa siden, med tekst og riktig _type", () => {
  // F2: film rett etter tjenestene. Stemningene og de tre stegene ligger i
  // innholdet, men ikke paa siden, til F7 sletter dem.
  // F6a: kjedene er en egen blokk etter prisene.
  const blocks = ["trustStrip", "examples", "moods", "steps", "services", "film", "labeling", "honest", "pricing", "chains", "faq", "finalCta"] as const;
  assert.deepEqual(Object.keys(home), ["_type", "hero", ...blocks]);
  for (const key of blocks) assert.equal(home[key]._type, key, key);
  assert.equal(site.footer._type, "footer");
  const page = withoutComments(read("app/(marketing)/no/page.tsx"));
  // F2: designets rekkefoelge (tjenestene og filmen foer eksemplene).
  const order = [
    "<Hero ",
    "<TrustStrip ",
    "<Services ",
    "<Film ",
    "<Examples ",
    "<Labeling ",
    "<Honest ",
    "<Pricing ",
    "<Chains ",
    "<Faq ",
    "<FinalCta ",
    "</main>",
    "<Footer ",
  ].map((tag) => page.indexOf(tag));
  assert.ok(order.every((i, n) => i > 0 && (n === 0 || i > order[n - 1])), `rekkefoelgen: ${order}`);
  for (const gone of ["<Moods", "<Steps", "/Moods\"", "/Steps\""]) assert.ok(!page.includes(gone), gone);
  assert.deepEqual(home.trustStrip.items.map((i) => i.text), [
    "Synlig AI-merke på hvert bilde",
    "Originalen røres aldri",
    "Du godkjenner hvert bilde før levering",
    "Data lagret i EU",
  ]);
  assert.deepEqual(home.examples.tabs.map((t) => t.label), ["Kveldsbilde", "Rydd opp", "Digital styling"]);
  assert.deepEqual(home.steps.items.map((s) => s.title), ["Last opp", "Velg stemning", "Godkjenn og last ned"]);
  // F4: seks kort i studioer (Petter og Cowork 20.10). Skjul ansikter og skilt er tatt ut (2e).
  assert.deepEqual(
    home.services.items.map((s) => [s.title, s.studio, s.status]),
    [
      ["Kveldsbilde", "Bildestudio", "available"],
      ["Digital styling", "Bildestudio", "soon"],
      ["Rydd opp", "Bildestudio", "soon"],
      ["Boligfilm", "Filmstudio", "soon"],
      ["Annonsetekst", "Tekststudio", "soon"],
      ["Plantegning", "Tegnestudio", "soon"],
    ]
  );
  // Ingen «Ekte eksempel» under en plassholder.
  for (const [path, text] of strings(home.moods, "moods")) assert.doesNotMatch(text, /Ekte eksempel/, path);
});

/** Alle bilder og plassholdere i innholdet, med stien. */
function pictures(value: unknown, path = ""): [string, { alt: string; image?: string; placeholder?: string }][] {
  if (Array.isArray(value)) return value.flatMap((v, i) => pictures(v, `${path}[${i}]`));
  if (value === null || typeof value !== "object") return [];
  const r = value as Record<string, unknown>;
  if (typeof r.alt === "string") return [[path, r as { alt: string }]];
  return Object.entries(r).flatMap(([k, v]) => pictures(v, path ? `${path}.${k}` : k));
}

test("MS3a: alle bilder og plassholdere har alt-tekst, og plassholderne har tekst og pending «image»", () => {
  const all = pictures(home, "home");
  // F5: mosaikken 3, eksemplene 6, stemningene 5, merkingen og tjenestene resten.
  assert.ok(all.length >= 3 + 6 + 5 + 2, `fant ${all.length}`);
  const images = read("content/marketing/images.ts");
  for (const [path, pic] of all) {
    assert.ok(pic.alt.trim().length > 10, path);
    if ("placeholder" in pic) {
      assert.ok(pic.placeholder!.trim().length > 0, path);
      assert.equal((pic as { pending?: string }).pending, "image", path);
    } else {
      assert.match(images, new RegExp(`^  ${pic.image},$`, "m"), path);
    }
  }
  // F5: kveldsbildet er ekte (AI-merket i bildet); rydd opp og styling er midlertidige.
  const [kveld, rydd, styling] = home.examples.tabs;
  assert.deepEqual([kveld.before.image, kveld.after.image], ["pairEveningOriginal", "pairEveningResult"]);
  for (const ref of [kveld.before, kveld.after]) assert.ok(!("pending" in ref), ref.image);
  assert.ok(!("pending" in kveld.caption));
  assert.deepEqual([rydd.before.image, rydd.after.image], ["pairCleanupOriginal", "pairCleanupResult"]);
  assert.deepEqual([styling.before.image, styling.after.image], ["pairStylingOriginal", "pairStylingResult"]);
  for (const t of [rydd, styling]) {
    for (const ref of [t.before, t.after]) assert.equal((ref as { pending?: string }).pending, "image", ref.image);
    assert.equal((t.caption as { pending?: string }).pending, "image", t.id);
  }
  // Plassholderen viser tekst og merkelapp, og bildet har alt fra innholdet.
  const pic = withoutComments(read("app/components/marketing/MarketingPicture.tsx"));
  assert.match(pic, /if \("placeholder" in picture\)/);
  assert.match(pic, /alt=\{picture\.alt\}/);
  assert.match(pic, /\{picture\.placeholder\}/);
  assert.match(pic, /aspect-\[3\/2\]/);
});

test("MS3a: stemningene har appens koder, navn, grupper og startvalg", () => {
  const codes = DICTIONARIES.nb.codes;
  assert.deepEqual(home.moods.groups.map((g) => g.time), ["early", "late"]);
  for (const g of home.moods.groups) {
    assert.equal(g.label, codes.duskTime[g.time], g.time);
    assert.deepEqual(g.items.map((i) => i.sky), [...DUSK_SKY_BY_TIME[g.time as "early" | "late"]], g.time);
    for (const item of g.items) assert.equal(item.name, codes.duskSky[item.sky], item.sky);
  }
  assert.match(withoutComments(read("app/components/marketing/Moods.tsx")), /defaultSky=\{DEFAULT_DUSK\.sky\}/);
  assert.equal(DEFAULT_DUSK.sky, "clear");
  const picker = withoutComments(read("app/components/marketing/MoodPicker.tsx"));
  assert.match(picker, /role="group" aria-label=\{g\.groupLabel\}/);
  assert.match(picker, /aria-pressed=\{m\.sky === mood\.sky\}/);
  assert.match(picker, /type="button"/);
});

test("MS3a: tjenestene heter det samme som i appen", () => {
  const ui = DICTIONARIES.nb.ui as Record<string, string>;
  for (const s of home.services.items) {
    const key = `service.${s.id}`;
    if (Object.hasOwn(ui, key)) assert.equal(s.title, ui[key], s.id);
  }
  // F4: Rydd opp har en egen id, fordi appen kaller magic_cleanup «Fjern
  // gjenstander» (auditen §6), og Skjul ansikter og skilt er ikke paa forsiden.
  const ids = home.services.items.map((s) => s.id);
  assert.ok(!ids.includes("magic_cleanup"), "magic_cleanup");
  assert.ok(!ids.includes("privacy_blur"), "privacy_blur");
  assert.equal(ui["service.magic_cleanup"], "Fjern gjenstander");
  // F4: ingen tjeneste har «Mer om …» lenger.
  for (const s of home.services.items) assert.ok(!("more" in s), s.id);
});

// --- Det som venter (regel 3 og 4) --------------------------------------------

const PENDING_NOW = [
  ["site.contact.email", "email"],
  ["site.footer.companyName", "companyName"],
  // F3: mosaikken. Kveldsbildet (tiles[0]) er ekte og venter ikke.
  ["home.hero.mosaic.tiles[1].image", "image"],
  ["home.hero.mosaic.tiles[3].image", "image"],
  ["home.hero.mosaic.tiles[4].video", "image"],
  ["home.trustStrip.items[3]", "dataRegion"],
  // F6a (Petter 20.10, 2c): tjenestene uten pris.
  ["home.pricing.others[0].price", "price"],
  ["home.pricing.others[1].price", "price"],
  ["home.pricing.others[2].price", "price"],
  ["home.pricing.others[3].price", "price"],
  ["home.pricing.others[4].price", "price"],
  ["home.pricing.others[5].price", "price"],
  // F6b (Petter 20.10, 2f): svaret om eierskap venter paa vilkaarene.
  ["faq[1]", "legal"],
  ["faq[4].slots.time", "time"],
  ["faq[7]", "trainingAnswer"],
  ["faq[8]", "storageAnswer"],
];

test("MS3a: lansering er sperret saa lenge noe venter (MARKETING_PUBLIC)", () => {
  const items = pendingItems({ site, home, faq, faqPage, labelingPage, contactPage });
  if (MARKETING_PUBLIC) {
    assert.deepEqual(items, [], "MARKETING_PUBLIC er true, men noe i innholdet venter fortsatt");
  }
  // Lista i dag (oppdateres bevisst etter hvert som ting avklares). Alle
  // eksempelbildene er plassholdere eller midlertidige, unntatt merkebildet
  // (beslutning 4).
  const notPictures = items.filter((i) => i.key !== "image" || i.path.startsWith("home.hero"));
  assert.deepEqual(notPictures.map((i) => [i.path, i.key]), PENDING_NOW);
  // F5: mosaikken 3, eksemplene 4 bilder og 2 tekster, stemningene 5.
  assert.ok(items.filter((i) => i.key === "image").length >= 3 + 6 + 5);
  // Hver noekkel har en merkelapp.
  for (const i of items) assert.ok(site.pendingLabels[i.key].startsWith("["), i.key);
});

test("MS3a: det som venter, vises med merkelapp der det staar", () => {
  assert.match(read("app/components/marketing/TrustStrip.tsx"), /item\.pending && <PendingMark label=\{site\.pendingLabels\[item\.pending\]\} \/>/);
  // F3: en lapp under mosaikken hvis noen rute venter (foer: under slideren).
  assert.match(
    withoutComments(read("app/components/marketing/HeroMosaic.tsx")),
    /\{pending && \(\s*<p[^>]*>\s*<PendingMark label=\{site\.pendingLabels\.image\} \/>/
  );
  const pic = withoutComments(read("app/components/marketing/MarketingPicture.tsx"));
  assert.match(pic, /<PendingMark label=\{pendingLabel\} \/>/);
  assert.match(pic, /\{picture\.pending && \(/);
  assert.match(read("app/components/marketing/PendingMark.tsx"), /bg-amber-bg[^"]*text-amber-fg/);
});

// --- Lenkene (regel 5) -----------------------------------------------------------

/** Om en intern rute har en side: app/(gruppe)/<sti>/page.tsx. */
function routeExists(href: string): boolean {
  const path = href.replace(/^\//, "");
  return readdirSync(join(REPO_DIR, "app"), { withFileTypes: true })
    .filter((e) => e.isDirectory() && /^\(.+\)$/.test(e.name))
    .some((g) => existsSync(join(REPO_DIR, "app", g.name, path, "page.tsx")));
}

test("MS3a: alle lenker som vises, peker paa et anker paa siden eller en rute som finnes", () => {
  const anchors = contentAnchors({ home, footer: site.footer });
  assert.deepEqual([...anchors].sort(), ["eksempler", "film", "kjeder", "kontakt", "merking", "priser", "sporsmal", "tjenester", "topp"]);
  const shown = [
    ...strings(home, "home").filter(([p]) => p.endsWith(".href")),
    ...strings(site.footer, "footer").filter(([p]) => p.endsWith(".href")),
    ...strings({ cta: site.cta, login: site.topBar.login, logo: { href: site.topBar.logoHref } }, "site").filter(([p]) =>
      p.endsWith(".href")
    ),
    ...visibleLinks(site.topBar.links, anchors).map((l, i): [string, string] => [`topBar.links[${i}]`, l.href]),
  ];
  assert.ok(shown.length >= 5);
  for (const [path, href] of shown) {
    if (href.startsWith("#")) assert.ok(anchors.has(href.slice(1)), `${path}: ${href} finnes ikke paa siden`);
    else assert.ok(href.startsWith("/") && routeExists(href), `${path}: ${href} finnes ikke`);
  }
  // MS3b og F2: alle seksjonene finnes, saa alle fem lenkene vises. Uten seksjonen vises ikke lenken.
  assert.deepEqual(visibleLinks(site.topBar.links, anchors).map((l) => l.href), ["#tjenester", "#film", "#eksempler", "#priser", "#kjeder"]);
  assert.deepEqual(
    visibleLinks(site.topBar.links, contentAnchors({ hero: home.hero, examples: home.examples, services: home.services })).map((l) => l.href),
    ["#tjenester", "#eksempler"]
  );
  // Sidene som ikke finnes ennaa (MS5), har ingen href.
  for (const col of site.footer.columns) {
    for (const l of col.links) if (!("href" in l)) assert.ok(!routeExists(`/${l.label.toLowerCase()}`), l.label);
  }
  assert.equal((home.labeling.guide as { href?: string }).href, undefined);
  assert.ok(routeExists("/start") && routeExists("/no") && !routeExists("/personvern"));
});

test("MS3a: toppmenyen og mobilmenyen viser bare lenkene siden sender (visibleLinks)", () => {
  const page = withoutComments(read("app/(marketing)/no/page.tsx"));
  assert.match(page, /const anchors = contentAnchors\(\{ home, footer: site\.footer \}\);/);
  assert.match(page, /links=\{visibleLinks\(site\.topBar\.links, anchors\)\}/);
  for (const f of ["app/components/marketing/MarketingTopBar.tsx", "app/components/marketing/MobileMenu.tsx"]) {
    assert.doesNotMatch(withoutComments(read(f)), /topBar\.links/, f);
  }
  assert.match(read("app/components/marketing/MarketingTopBar.tsx"), /<MobileMenu label=\{topBar\.menuLabel\} navLabel=\{topBar\.navLabel\} links=\{links\} \/>/);
  // Seksjonene har id fra ankeret.
  assert.match(read("app/components/marketing/Examples.tsx"), /<section id=\{examples\.anchor\}/);
  assert.match(read("app/components/marketing/Services.tsx"), /<section id=\{services\.anchor\}/);
  assert.match(read("app/components/marketing/Film.tsx"), /<section\s+id=\{film\.anchor\}/);
  // Ingen spraakvelger foer det finnes mer enn ett spraak.
  for (const f of MARKETING_TSX) assert.doesNotMatch(read(f), /hrefLang|Svenska|English \(UK\)/, f);
});

// --- Tastatur og ytelse ------------------------------------------------------------

test("MS3a: fanene foelger WAI-ARIA (tablist, roving tabindex, piltaster, Home og End)", () => {
  assert.deepEqual([0, 1, 6].map((i) => tabKey(i, "ArrowRight", 7)), [1, 2, 0]);
  assert.deepEqual([0, 1, 6].map((i) => tabKey(i, "ArrowLeft", 7)), [6, 0, 5]);
  assert.equal(tabKey(3, "Home", 7), 0);
  assert.equal(tabKey(3, "End", 7), 6);
  assert.equal(tabKey(3, "Tab", 7), null);
  assert.equal(tabKey(0, "ArrowRight", 0), null);
  const src = withoutComments(read("app/components/marketing/ExampleTabs.tsx"));
  for (const attr of [
    'role="tablist"',
    "aria-label={labels.tabList}",
    'role="tab"',
    "aria-selected={i === active}",
    "aria-controls={panelId}",
    "tabIndex={i === active ? 0 : -1}",
    'role="tabpanel"',
    "aria-labelledby={`${baseId}-tab-${tab.id}`}",
  ]) {
    assert.ok(src.includes(attr), attr);
  }
  assert.match(src, /const next = tabKey\(active, e\.key, tabs\.length\);/);
  assert.match(src, /refs\.current\[next\]\?\.focus\(\);/);
});

test("MS3a: mobilmenyen har aria-expanded og aria-controls, lukkes med Escape og vises bare under 820 px", () => {
  const src = withoutComments(read("app/components/marketing/MobileMenu.tsx"));
  assert.match(src, /aria-expanded=\{open\}/);
  assert.match(src, /aria-controls=\{panelId\}/);
  assert.match(src, /<nav\s+id=\{panelId\}/);
  assert.match(src, /hidden=\{!open\}/);
  assert.match(src, /if \(e\.key !== "Escape"\) return;\s*setOpen\(false\);\s*buttonRef\.current\?\.focus\(\);/);
  assert.match(src, /onClick=\{\(\) => setOpen\(false\)\}/);
  assert.match(src, /className="min-\[820px\]:hidden"/);
  assert.equal(site.topBar.menuLabel, "Meny");
});

test("MS3a: bare toppbildet har hoey prioritet; alle andre bilder lastes lat", () => {
  // F5: ogsaa slideren (HeroSlider.tsx), som staar i eksemplene.
  for (const f of filesIn("app/components/marketing", /\.tsx$/)) {
    let src = withoutComments(read(f));
    // F1: videoene laster ingenting foer de spilles; bare preload="none" er lov, og bare der.
    if (f.endsWith("MarketingVideo.tsx")) src = src.replaceAll('preload="none"', "");
    // F3: kveldsbildet i mosaikken er toppbildet (LCP), en gang og bare det (testen i F3 under).
    if (f.endsWith("HeroMosaic.tsx")) {
      for (const attr of ['loading="eager"', 'fetchPriority="high"']) {
        assert.equal(src.split(attr).length - 1, 1, `${f}: ${attr}`);
        src = src.replace(attr, "");
      }
    }
    assert.doesNotMatch(src, /fetchPriority|loading="eager"|\bpriority\b|\bpreload\b/, f);
  }
  // Seksjonene er serverkomponenter; bare fanene, stemningene og mobilmenyen
  // (og slideren og videoen) er klientdeler.
  const client = filesIn("app/components/marketing", /\.tsx$/).filter((f) => /^"use client";/.test(read(f)));
  assert.deepEqual(client.map((f) => f.split("/").pop()).sort(), [
    "ExampleTabs.tsx",
    "HeroSlider.tsx",
    "MarketingVideo.tsx",
    "MobileMenu.tsx",
    "MoodPicker.tsx",
  ]);
});

// ---------------------------------------------------------------------------
// MS3b: merkingen, den aerlige versjonen, prisene, spoersmaal og svar, siste
// knapp og bunnen, pluss rettelsene fra den lokale sjekken.
// ---------------------------------------------------------------------------

const MS3B_TSX = ["Labeling", "Honest", "Pricing", "Chains", "Faq", "FinalCta", "Footer", "TemplateText"].map(
  (n) => `app/components/marketing/${n}.tsx`
);

test("MS3b: de nye komponentene er med i teksttesten, og ingen markedskomponent har hex-farger", () => {
  for (const f of MS3B_TSX) {
    assert.ok(MARKETING_TSX.includes(f), f);
    assert.deepEqual(literalTextsInFile(read(f)), [], f);
  }
  for (const f of filesIn("app/components/marketing", /\.tsx?$/)) {
    assert.doesNotMatch(read(f), /#[0-9a-f]{3,8}\b/i, f);
  }
  // Kveldsblaatt er tokenet night (Petter 02.10). F6a: merkingen er lys
  // (SECTION_BAND), og kjedene er en egen seksjon paa ink, som i designet.
  assert.match(read("app/globals.css"), /--color-night: #101A2C;/);
  assert.doesNotMatch(withoutComments(read("app/components/marketing/Labeling.tsx")), /bg-night/);
  assert.match(read("app/components/marketing/Chains.tsx"), /id=\{chains\.anchor\}[\s\S]*?bg-ink/);
});

test("MS3b: prisene og antallene staar ett sted, og «ca. 116» og svaret om pris er regnet ut", () => {
  assert.deepEqual(site.offer, {
    freeImages: 3,
    bundleCount: 3,
    prices: { free: 0, single: 149, bundle: 349, privacyBlur: 29 },
    copyrightYear: 2026,
  });
  assert.equal(perImage(site.offer), 116);
  assert.equal(
    fill(home.pricing.bundle.text, priceVars(site.offer)),
    "Fasade og to rom i samme annonse, for eksempel. Ca. 116 kr per bilde."
  );
  assert.equal(fill(home.pricing.bundle.name, { n: site.offer.bundleCount }), "3 kveldsbilder");
  const price = faq.find((i) => i.id === "pris")!;
  assert.equal(
    fill(price.a!, priceVars(site.offer)),
    "Et kveldsbilde koster 149 kr eks. mva., og 3 kveldsbilder i samme oppdrag koster 349 kr. Skjul ansikter og skilt koster 29 kr per bilde. Kjeder og partnere får pris etter volum."
  );
  // Ingen tall i tekstene, heller ikke i spoersmaalene, og ingen tall skrevet inn i komponentene.
  for (const [path, text] of strings(faq, "faq")) assert.doesNotMatch(text, /\d/, path);
  for (const f of [...MS3B_TSX, "app/components/marketing/Pricing.tsx"]) {
    assert.doesNotMatch(withoutComments(read(f)), /\b(149|349|116|2026)\b|"29"|\{29\}/, f);
  }
  const pricing = withoutComments(read("app/components/marketing/Pricing.tsx"));
  assert.match(pricing, /const vars = priceVars\(offer\);/);
  assert.match(pricing, /price\(offer\.prices\.single\)/);
  assert.match(pricing, /price\(offer\.prices\.bundle\)/);
  assert.match(read("app/components/marketing/FaqList.tsx"), /const vars = priceVars\(site\.offer\);/);
  // «Prøv gratis» og «Prøv gratis først» gaar dit site.cta gaar.
  assert.equal((pricing.match(/href=\{cta\.href\}/g) ?? []).length, 3);
  assert.match(read("app/components/marketing/FinalCta.tsx"), /href=\{site\.cta\.href\}/);
});

test("MS3b: eksempelet paa annonseteksten lages med produktets funksjon og er likt utkastet", () => {
  const { example } = home.labeling;
  const result = disclosureText(
    DISCLOSURE_LOCALE,
    { version: null, base: example.base, time: example.time, scope: null, edited: [...example.edited], source: null, status: "ok" },
    DISCLOSURE_DETAIL
  );
  assert.deepEqual(result, {
    kind: "text",
    text: "Kveldsbilde laget med AI fra dagsbilde. Himmel, lys i nabohus og stearinlys er redigert.",
  });
  const src = withoutComments(read("app/components/marketing/Labeling.tsx"));
  assert.match(src, /const disclosure = disclosureText\(\s*DISCLOSURE_LOCALE,/);
  assert.match(src, /DISCLOSURE_DETAIL\s*\);/);
  assert.match(src, /\{disclosure\.text\}/);
  // Teksten staar ikke i innholdet, bare kodene.
  for (const [path, text] of strings(home.labeling, "labeling")) assert.doesNotMatch(text, /redigert|laget med AI fra/, path);
});

test("MS3b: spoersmaal og svar har alle spoersmaalene fra utkastet, med <details>", () => {
  assert.deepEqual(faq.map((i) => i.q), [
    "Er det lov å bruke AI-redigerte bilder i boligannonser?",
    "Hvem eier bildene?",
    "Hvordan merkes bildene?",
    "Hva koster det?",
    "Hvor lang tid tar det?",
    "Hva om jeg ikke er fornøyd?",
    "Hvilke bilder passer?",
    "Brukes bildene til å trene AI?",
    "Hvor lagres bildene?",
    "Kan kjeden få sin egen løsning?",
  ]);
  assert.equal(new Set(faq.map((i) => i.id)).size, faq.length);
  // F6b: forsiden viser bare fire (testen under); spoersmaalssiden alle.
  for (const i of faq) {
    assert.equal(typeof i.showOnHome, "boolean", i.id);
    assert.ok(i.a !== null || i.pending !== undefined, `${i.id}: svaret mangler og venter ikke`);
    for (const m of (i.a ?? "").matchAll(/\{(\w+)\}/g)) assert.ok(TEMPLATE_KEYS.includes(m[1]), `${i.id}: {${m[1]}}`);
  }
  assert.match(read("app/(marketing)/no/page.tsx"), /getFaq\("no"\)\.filter\(\(item\) => item\.showOnHome\)/);
  // MS5a: lista er skilt ut i FaqList (forsiden og spoersmaalssiden).
  const src = withoutComments(read("app/components/marketing/FaqList.tsx"));
  assert.match(src, /<details key=\{item\.id\} id=\{item\.id\}/);
  assert.match(src, /<summary/);
  assert.match(src, /item\.pending && <PendingMark label=\{site\.pendingLabels\[item\.pending\]\} \/>/);
  const block = withoutComments(read("app/components/marketing/Faq.tsx"));
  assert.match(block, /vars=\{\{ email: site\.contact\.email \}\}/);
  assert.match(block, /<FaqList items=\{items\} site=\{site\} \/>/);
});

test("MS3b: fillParts setter merkelappen der verdien som venter skal staa", () => {
  assert.deepEqual(fillParts("Skriv til {email}.", { email: { pending: "email" } }), [
    "Skriv til ",
    { pending: "email" },
    ".",
  ]);
  assert.deepEqual(fillParts("© {year} {companyName}", { year: 2026, companyName: { pending: "companyName" } }), [
    "© 2026 ",
    { pending: "companyName" },
  ]);
  assert.deepEqual(fillParts("Vanligvis {time} fra", { time: "to minutter" }), ["Vanligvis to minutter fra"]);
  assert.deepEqual(fillParts("{ukjent} blir staaende", {}), ["{ukjent} blir staaende"]);
});

test("MS3b: bunnen har merket med navn, lenker bare til det som finnes, og ingen spraakvelger", () => {
  const src = withoutComments(read("app/components/marketing/Footer.tsx"));
  assert.match(src, /<footer id=\{footer\.anchor\}/);
  assert.match(src, /<BrandMark brand=\{brand\} alwaysShowName \/>/);
  assert.match(src, /if \(link\.href === undefined\) return <span/);
  assert.match(src, /vars=\{\{ year: offer\.copyrightYear, companyName: footer\.companyName \}\}/);
  assert.doesNotMatch(src, /Språk|lang=|hrefLang/);
  assert.deepEqual(site.footer.columns.map((c) => c.title), ["Tjenester", "Trygghet"]);
  assert.deepEqual(site.footer.columns[1].links.map((l) => "href" in l), [false, false, false, false]);
});

test("MS3b: rettelsene fra den lokale sjekken (rullefeltet under fanene og navnet i smalt vindu)", () => {
  // Fanene kan fortsatt rulles, men uten det graa rullefeltet.
  const tabs = withoutComments(read("app/components/marketing/ExampleTabs.tsx"));
  assert.match(tabs, /role="tablist"[\s\S]*?overflow-x-auto[^"]*\[scrollbar-width:none\] \[&::-webkit-scrollbar\]:hidden/);
  // Navnet vises alltid paa markedssiden; «Meny» er bare ikonet, med teksten for skjermlesere.
  assert.match(read("app/components/marketing/MarketingTopBar.tsx"), /<BrandMark brand=\{brand\} alwaysShowName \/>/);
  const menu = withoutComments(read("app/components/marketing/MobileMenu.tsx"));
  assert.match(menu, /<span className="sr-only">\{label\}<\/span>/);
  assert.match(menu, /className=\{`flex size-11 /);
  // Appen og 404 er uendret (navnet skjules under 640 px naar merket har ikon).
  for (const f of ["app/(app)/layout.tsx", "app/global-not-found.tsx"]) {
    assert.match(read(f), /<BrandMark brand=\{brand\} \/>/, f);
  }
});

// ---------------------------------------------------------------------------
// MS5a: innholdssidene og «Hjelp» i appen
// ---------------------------------------------------------------------------

const MS5A_PAGES = [
  "app/(marketing)/no/sporsmal-og-svar/page.tsx",
  "app/(marketing)/no/merking/page.tsx",
  "app/(marketing)/no/kontakt/page.tsx",
];
const MS5A_TSX = [
  ...MS5A_PAGES,
  ...["Subpage", "PageIntro", "TextSection", "FaqList", "LabelingPage", "ContactPage"].map(
    (n) => `app/components/marketing/${n}.tsx`
  ),
];

test("MS5a: de nye sidene og komponentene er med i teksttesten (ingen synlig tekst i JSX)", () => {
  for (const f of MS5A_TSX) {
    assert.ok(MARKETING_TSX.includes(f), f);
    assert.deepEqual(literalTextsInFile(read(f)), [], f);
  }
});

test("MS5a: hjelpelista har de tre sidene, og de finnes", () => {
  assert.deepEqual(
    site.help.links.map((l) => l.href),
    [FAQ_PATH, LABELING_PATH, CONTACT_PATH]
  );
  // Den foerste er dit «Hjelp» i appen gaar.
  assert.equal(site.help.links[0].href, FAQ_PATH);
  for (const p of [FAQ_PATH, LABELING_PATH, CONTACT_PATH]) {
    assert.ok(routeExists(p), p);
    assert.ok(MARKETING_PAGES.includes(p), p);
    assert.match(p, /^\/no\/[a-z-]+$/, "ASCII, uten skraastrek til slutt");
  }
});

/**
 * Om en lenke paa en side virker: en rute som finnes, eventuelt med et
 * anker som finnes paa maalsiden (forsidens seksjoner, eller et spoersmaal
 * paa spoersmaalssiden). Et anker alene maa finnes paa siden selv.
 */
function linkWorks(href: string, ownAnchors: ReadonlySet<string>): boolean {
  const homeAnchors = contentAnchors({ home, footer: site.footer });
  const [path, hash] = href.split("#");
  if (path === "") return ownAnchors.has(hash);
  if (!routeExists(path)) return false;
  if (hash === undefined) return true;
  if (path === MARKETING_HOME) return homeAnchors.has(hash);
  if (path === FAQ_PATH) return faq.some((i) => i.id === hash);
  return false;
}

test("MS5a: alle lenker paa en underside virker (topplinjen, bunnen, hjelpen og innholdet)", () => {
  const homeAnchors = contentAnchors({ home, footer: site.footer });
  // Undersiden har bare bunnens anker (#kontakt) selv; alt annet gaar til forsiden.
  const own = new Set([site.footer.anchor]);
  const shown: [string, string][] = [
    ...onPage(visibleLinks(site.topBar.links, homeAnchors), MARKETING_HOME).map((l): [string, string] => ["topBar", l.href]),
    ["logo", MARKETING_HOME],
    ["login", site.topBar.login.href],
    ["cta", site.cta.href],
    ...[...site.footer.columns, site.help, site.footer.contact].flatMap((col) =>
      onPage(col.links, MARKETING_HOME)
        .filter((l): l is { label: string; href: string } => l.href !== undefined)
        .map((l): [string, string] => [col.title, l.href])
    ),
    ...strings({ faqPage, labelingPage, contactPage }).filter(([p]) => p.endsWith(".href")),
    ["merking → spoersmaal", `${FAQ_PATH}#${labelingPage.rules.faqId}`],
  ];
  assert.ok(shown.length >= 12, String(shown.length));
  for (const [where, href] of shown) assert.ok(linkWorks(href, own), `${where}: ${href} virker ikke fra en underside`);
  // Paa en underside gaar ankrene til forsiden.
  assert.deepEqual(
    onPage(visibleLinks(site.topBar.links, homeAnchors), MARKETING_HOME).map((l) => l.href),
    ["/no#tjenester", "/no#film", "/no#eksempler", "/no#priser", "/no#kjeder"]
  );
  assert.deepEqual(onPage(site.topBar.links, null), [...site.topBar.links]);
  // Forsiden lenker videre.
  assert.equal(home.faq.more.href, FAQ_PATH);
  assert.equal(home.labeling.more.href, LABELING_PATH);
  // Guiden kommer i MS5b, og sidene under «Trygghet» finnes ikke ennaa (TG-NEW-154).
  assert.equal((home.labeling.guide as { href?: string }).href, undefined);
  assert.deepEqual(site.footer.columns[1].links.map((l) => "href" in l), [false, false, false, false]);
});

test("MS5a: undersidene bruker skallet med merket til /no, og bunnen har kolonnen «Hjelp»", () => {
  for (const f of MS5A_PAGES) {
    const src = withoutComments(read(f));
    assert.match(src, /<Subpage site=\{site\} home=\{home\} brand=\{brand\}>/, f);
    assert.match(src, /<PageIntro /, f);
  }
  const shell = withoutComments(read("app/components/marketing/Subpage.tsx"));
  assert.match(shell, /links=\{onPage\(visibleLinks\(site\.topBar\.links, anchors\), MARKETING_HOME\)\}/);
  assert.match(shell, /href: MARKETING_HOME, label: fill\(site\.topBar\.logoHomeLabel/);
  assert.match(shell, /<Footer site=\{site\} brand=\{brand\} homePath=\{MARKETING_HOME\} \/>/);
  const footer = withoutComments(read("app/components/marketing/Footer.tsx"));
  assert.match(footer, /const columns = \[services, help, \.\.\.rest\];/);
  assert.match(footer, /onPage\(col\.links, homePath\)/);
  assert.match(footer, /onPage\(footer\.contact\.links, homePath\)/);
  // Forsiden sender ikke homePath: ankrene er uendret der.
  assert.match(withoutComments(read("app/(marketing)/no/page.tsx")), /<Footer site=\{site\} brand=\{brand\} \/>/);
});

test("MS5a: «Hjelp» i appen kommer fra hjelpelista i site.ts, og AppNav har ingen egne kopier", () => {
  const src = withoutComments(read("app/components/AppNav.tsx"));
  assert.match(src, /import \{ site \} from "\.\.\/\.\.\/content\/marketing\/nb\/site";/);
  assert.match(src, /const HELP_HREF = site\.help\.links\[0\]\.href;/);
  assert.match(src, /href=\{HELP_HREF\}/);
  assert.match(src, /<span className="sr-only sm:not-sr-only">\{t\(locale, "nav\.help"\)\}<\/span>/);
  // Ingen adresser eller lenketekster fra hjelpelista skrevet inn i AppNav.
  assert.doesNotMatch(src, /["'`]\/no\b/);
  for (const l of site.help.links) {
    assert.ok(!src.includes(l.href), `AppNav har en kopi av ${l.href}`);
    assert.ok(!src.includes(l.label), `AppNav har en kopi av «${l.label}»`);
  }
  // Ordet foelger appens spraak.
  assert.equal(DICTIONARIES.nb.ui["nav.help"], "Hjelp");
  assert.equal(DICTIONARIES.en.ui["nav.help"], "Help");
  // AppNav importerer ikke hele innholdet (forsiden har bildeimporter).
  assert.doesNotMatch(src, /content\/marketing["']|content\/marketing\/index|nb\/home/);
});

test("MS5a: spoersmaalssiden viser alle spoersmaalene, og forsiden bare showOnHome", () => {
  const src = withoutComments(read("app/(marketing)/no/sporsmal-og-svar/page.tsx"));
  assert.match(src, /const faq = getFaq\("no"\);/);
  assert.match(src, /<FaqList items=\{faq\} site=\{site\} \/>/);
  assert.doesNotMatch(src, /showOnHome/);
  assert.match(src, /const related = site\.help\.links\.filter\(\(l\) => l\.href !== FAQ_PATH\);/);
  assert.match(read("app/(marketing)/no/page.tsx"), /getFaq\("no"\)\.filter\(\(item\) => item\.showOnHome\)/);
});

test("MS5a: hver underside har en h1, og den er tittelen fra innholdet", () => {
  const shellParts = ["Subpage", "TextSection", "FaqList", "LabelingPage", "ContactPage", "Footer", "MarketingTopBar", "MobileMenu", "MarketingPicture"];
  for (const n of shellParts) assert.doesNotMatch(read(`app/components/marketing/${n}.tsx`), /<h1/, n);
  assert.equal(read("app/components/marketing/PageIntro.tsx").split("<h1").length - 1, 1);
  for (const f of MS5A_PAGES) assert.equal(read(f).split("<PageIntro").length - 1, 1, f);
  for (const page of [faqPage, labelingPage, contactPage]) assert.ok(page.title.trim().length > 0);
});

test("MS5a: merkesiden henter bildet, eksempelet og lista fra kilden, ingen kopier", () => {
  const src = withoutComments(read("app/components/marketing/LabelingPage.tsx"));
  assert.match(src, /DICTIONARIES\[DISCLOSURE_LOCALE\]\.codes\.disclosureEdited/);
  assert.match(src, /const disclosure = disclosureText\(\s*DISCLOSURE_LOCALE,/);
  assert.match(src, /picture=\{labeling\.picture\}/);
  assert.match(src, /\{labeling\.guide\.label\}/);
  assert.match(src, /faq\.find\(\(item\) => item\.id === page\.rules\.faqId\)/);
  // Lista og eksempelet staar ikke i innholdet til siden.
  for (const [path, text] of strings(labelingPage, "labelingPage")) {
    assert.doesNotMatch(text, /stearinlys|ild i peisen|lys i nabohus|Himmel og lamper/i, path);
  }
  assert.ok(faq.some((i) => i.id === labelingPage.rules.faqId));
  // Forsiden og merkesiden sier det samme om originalen (MS5_TEKSTER_SVAR).
  assert.equal(labelingPage.original.points[0].text, home.labeling.points[2].text);
  assert.equal(labelingPage.rules.points[0].text, home.labeling.points[3].text);
});

test("MS5a: ingen tekst sier at hele teksten til annonsen foelger med fila (AVVIK 1)", () => {
  const all = strings({ site, home, faq, faqPage, labelingPage, contactPage });
  for (const [path, text] of all) {
    assert.doesNotMatch(text, /følger med (nedlastingen|når du laster ned|bildet når du laster ned)/i, path);
  }
  assert.equal(home.labeling.points[1].text, "Teksten til annonsen får du når du godkjenner bildet.");
  assert.equal(home.labeling.example.note, "Klar til å kopiere når bildet er godkjent.");
  // Petter 04.10 (AVVIK 2 i Fase B): det tredje steget.
  assert.ok(
    home.steps.items.some((i) => i.text.endsWith("Du laster ned bildet med AI-merket og kopierer den ferdige teksten til annonsen.")),
    "tredje steg"
  );
  for (const [path, text] of all) assert.doesNotMatch(text, /laster ned bildet med AI-merke og ferdig tekst/, path);
  assert.match(faq.find((i) => i.id === "merking")?.a ?? "", /Teksten får du når du godkjenner bildet, klar til å kopiere inn i annonsen\.$/);
});

test("MS5a: kontaktsiden har e-post og selskapsnavn fra site, og ikke noe skjema", () => {
  const src = withoutComments(read("app/components/marketing/ContactPage.tsx"));
  assert.match(src, /vars=\{\{ email: site\.contact\.email \}\}/);
  assert.match(src, /const company = site\.footer\.companyName;/);
  assert.doesNotMatch(src, /<form|<input|<textarea/);
  for (const g of contactPage.groups) assert.match(g.text, /\{email\}/, g.title);
  assert.doesNotMatch(JSON.stringify(contactPage), /@|telefon|org\.?nr|\badresse\b/i);
});

test("Beslutning 4: merkebildet er ekte, EU-setningen er ny og venter ikke, og [E-POST] staar", () => {
  // Bildet: jobb 2f6c3c5b, statisk importert, uten pending; merkesiden henter det fra forsiden.
  assert.deepEqual(home.labeling.picture, {
    image: "merkingEvening",
    alt: "Stue med åpen balkongdør som kveldsbilde laget med AI, med AI-merket og setningen nede til venstre",
  });
  const images = read("content/marketing/images.ts");
  assert.match(images, /^import merkingEvening from "\.\/images\/merking-kveld\.jpg";$/m);
  assert.match(images, /^  merkingEvening,$/m);
  assert.match(withoutComments(read("app/components/marketing/LabelingPage.tsx")), /picture=\{labeling\.picture\}/);
  // Kodene er det jobben fikk (XMP pas:Edited).
  assert.deepEqual([...home.labeling.example.edited], ["sky", "neighbour_window_lights", "candles"]);
  // EU-setningen ordrett begge steder, uten pending.
  const eu = "Laget med tanke på EUs åpenhetskrav for AI-innhold og Forbrukertilsynets veiledning.";
  assert.deepEqual(home.labeling.points[3], { text: eu });
  assert.deepEqual(labelingPage.rules.points[0], { text: eu });
  for (const f of ["content/marketing/nb/home.ts", "content/marketing/nb/labeling.ts"]) {
    assert.doesNotMatch(read(f), /pending: "legal"/, f);
    assert.doesNotMatch(read(f), /Laget for EUs krav/, f);
  }
  // E-posten venter fortsatt (lappen [E-POST]).
  assert.deepEqual(site.contact.email, { pending: "email" });
  assert.equal(site.pendingLabels.email, "[E-POST]");
});

test("TG-NEW-220: gratisbildene heter «gratis bilder», de betalte produktene er fortsatt kveldsbilder", () => {
  // Blaa himmel trekker ogsaa fra gratisbildene (Petter 19.10).
  const nb = DICTIONARIES.nb;
  const en = DICTIONARIES.en;
  const free = {
    freeNote: home.hero.freeNote,
    "free.text": home.pricing.free.text,
    "finalCta.text": home.finalCta.text,
    "quota.exhausted": nb.ui["quota.exhausted"],
    free_quota_exhausted: nb.codes.orderError.free_quota_exhausted,
  };
  assert.deepEqual(free, {
    freeNote: "{n} gratis bilder når du registrerer deg. Uten kort.",
    "free.text": "{n} bilder når du registrerer deg. Nok til en hel annonse. Uten kort.",
    "finalCta.text": "{n} gratis bilder når du registrerer deg. Uten kort.",
    "quota.exhausted": "Du har brukt de {limit} gratis bildene dine. Du kan ikke bestille flere bilder nå.",
    free_quota_exhausted: "Du har brukt alle gratisbildene dine. Du kan ikke bestille flere bilder nå.",
  });
  for (const [key, text] of Object.entries(free)) assert.doesNotMatch(text, /kveldsbild/i, key);
  assert.equal(en.ui["quota.exhausted"], "You have used your {limit} free images. You cannot order more images right now.");
  assert.equal(
    en.codes.orderError.free_quota_exhausted,
    "You have used all your free images. You cannot order more images right now."
  );
  // De betalte produktene gjelder kveldsbildet og staar.
  assert.equal(home.pricing.single.name, "Kveldsbilde");
  assert.equal(home.pricing.bundle.name, "{n} kveldsbilder");
});

test("TG-NEW-223: svaret om lov staar ordrett, uten lapp og uten tall", () => {
  const lov = faq[0];
  assert.equal(lov.id, "lov");
  assert.equal("pending" in lov, false);
  assert.equal(
    lov.a,
    "Ja, så lenge bildet ikke gir et feil inntrykk av boligen og det går tydelig fram hva som er redigert. Forbrukertilsynets veileder sier at et redigert bilde skal ha en tydelig forklaring om at og hva som er redigert. Det holder ikke å skrive at AI er brukt. Derfor har hvert bilde et synlig AI-merke, og du får en ferdig tekst som sier konkret hva som er endret. Ansvaret for annonsen ligger hos megleren."
  );
  assert.doesNotMatch(lov.a ?? "", /\d/);
  assert.ok(lov.showOnHome);
  // Merkesiden lenker til det samme svaret.
  assert.equal(labelingPage.rules.faqId, lov.id);
});

// ---------------------------------------------------------------------------
// F1 (TG-NEW-230): bildene, videoene og videokomponenten til den nye forsiden.
// Ingen side bruker dem ennaa (F2-F4).
// ---------------------------------------------------------------------------

/** Boksene paa toppnivaa i en MP4, i rekkefoelge. */
function mp4Boxes(file: Buffer): string[] {
  const out: string[] = [];
  let i = 0;
  while (i + 8 <= file.length) {
    let size = file.readUInt32BE(i);
    out.push(file.toString("latin1", i + 4, i + 8));
    if (size === 1) size = Number(file.readBigUInt64BE(i + 8));
    if (size === 0) break; // boksen gaar til slutten av fila
    i += size;
  }
  return out;
}

test("F1: videoene ligger under public/no/, er smaa nok, starter med en gang (faststart) og har plakat", () => {
  assert.deepEqual(Object.keys(VIDEOS), ["film", "loop"]);
  const images = read("content/marketing/images.ts");
  // Tak i byte (desimale MB): filmen 3,5 MB, loekka 0,5 MB.
  const limits: Record<VideoKey, number> = { film: 3_500_000, loop: 500_000 };
  for (const key of ["film", "loop"] as const) {
    const v = VIDEOS[key];
    // Under /no/, saa isOpenMarketingPath slipper dem gjennom ved lansering.
    assert.ok(v.src.startsWith("/no/") && isMarketingPath(v.src), v.src);
    const path = join(REPO_DIR, "public", v.src);
    assert.ok(existsSync(path), v.src);
    const file = readFileSync(path);
    assert.ok(file.length <= limits[key], `${key}: ${file.length} byte`);
    const boxes = mp4Boxes(file);
    assert.equal(boxes[0], "ftyp", key);
    assert.ok(boxes.includes("mdat"), `${key}: ${boxes}`);
    assert.ok(boxes.includes("moov") && boxes.indexOf("moov") < boxes.indexOf("mdat"), `${key}: ${boxes}`);
    assert.match(images, new RegExp(`^  ${v.poster},$`, "m"), v.poster);
  }
  assert.deepEqual([VIDEOS.film.width, VIDEOS.film.height], [1920, 1080]);
  assert.deepEqual([VIDEOS.loop.width, VIDEOS.loop.height], [720, 480]);
});

test("F1: MarketingVideo er stum, inline, laster ingenting foer avspilling og respekterer redusert bevegelse", () => {
  const src = withoutComments(read("app/components/marketing/MarketingVideo.tsx"));
  assert.match(src, /^"use client";/);
  for (const attr of [/^\s+muted$/m, /^\s+loop$/m, /^\s+playsInline$/m, /^\s+controls$/m]) assert.match(src, attr);
  assert.ok(src.includes('preload="none"'));
  assert.ok(src.includes("prefers-reduced-motion"));
  assert.ok(src.includes("new IntersectionObserver("));
  // Loekka startes med play() naar den er synlig (feilen fanges), aldri med attributtet.
  assert.match(src, /\.play\(\)\.catch\(/);
  assert.doesNotMatch(src, /autoplay/i);
  assert.doesNotMatch(src, /preload="(auto|metadata)"|preload=\{/);
  // aria-label kommer fra props, aldri en fast tekst.
  const ariaLabels = [...src.matchAll(/aria-label=(\S+)/g)].map((m) => m[1]);
  assert.equal(ariaLabels.filter((a) => a === "{label}").length, 2);
  for (const a of ariaLabels) assert.match(a, /^\{/, a);
  assert.match(src, /aria-label=\{running \? labels\.pause : labels\.play\}/);
  // Knappen bruker Lucide-ikonene og fokusrammen fra classes.ts.
  assert.match(src, /import \{ Pause, Play \} from "lucide-react";/);
  assert.match(src, /import \{ FOCUS \} from "\.\/classes";/);
  assert.ok(src.includes("${FOCUS}"));
  assert.match(src, /type="button"/);
  // Tekstene paa knappen kommer fra site.video.
  assert.deepEqual(site.video, { play: "Spill av", pause: "Sett på pause" });
});

/**
 * Bildene som er midlertidige (images.ts): rydd opp-paret (probe R0b) og
 * styling-paret (probe M0), begge uten AI-merke.
 */
const TEMPORARY_MEDIA = ["pairCleanupOriginal", "pairCleanupResult", "pairStylingOriginal", "pairStylingResult"];

/**
 * Stiene til bilder og videoer i innholdet som mangler pending «image»: et
 * midlertidig bilde (TEMPORARY_MEDIA) eller en video (VideoRef, `video` er en
 * noekkel). Begge videoene viser styling-bildet (videos.ts).
 */
function missingTemporaryLabel(value: unknown, path = ""): string[] {
  if (Array.isArray(value)) return value.flatMap((v, i) => missingTemporaryLabel(v, `${path}[${i}]`));
  if (value === null || typeof value !== "object") return [];
  const r = value as Record<string, unknown>;
  const temporary = typeof r.image === "string" && TEMPORARY_MEDIA.includes(r.image);
  const video = typeof r.video === "string";
  const own = (temporary || video) && r.pending !== "image" ? [path] : [];
  return [...own, ...Object.entries(r).flatMap(([k, v]) => missingTemporaryLabel(v, path ? `${path}.${k}` : k))];
}

test("F1: midlertidige bilder og videoene har pending «image» der de brukes", () => {
  const images = read("content/marketing/images.ts");
  for (const key of TEMPORARY_MEDIA) assert.match(images, new RegExp(`^  ${key},$`, "m"), key);
  // Vakta virker: den finner et bilde og en video uten lappen, og godtar dem med lappen.
  assert.deepEqual(
    missingTemporaryLabel({
      a: { image: "pairStylingResult", alt: "x" },
      b: [{ video: "loop", label: "x" }],
      c: { image: "pairCleanupOriginal", alt: "x", pending: "image" },
      d: { video: "film", label: "x", pending: "image" },
      e: { image: "pairEveningResult", alt: "x" },
    }),
    ["a", "b[0]"]
  );
  // site.video er tekstene til knappen, ikke en VideoRef.
  assert.deepEqual(missingTemporaryLabel({ site, home }), []);
});

// ---------------------------------------------------------------------------
// F2: filmseksjonen erstatter stemningene og de tre stegene paa siden.
// ---------------------------------------------------------------------------

test("F2: filmseksjonen har tekstene Petter bestemte (20.10)", () => {
  const { film } = home;
  assert.equal(film._type, "film");
  assert.equal(film.anchor, "film");
  assert.deepEqual(site.topBar.links[1], { label: "Se filmen", href: "#film" });
  assert.deepEqual(film.steps, [
    "Last opp bildene",
    "Velg tjeneste per bilde",
    "Sammenlign og godkjenn",
    "Last ned bildet og kopier teksten",
  ]);
  // MS5a AVVIK 1: teksten foelger ikke med fila; den kopieres.
  assert.equal(film.steps[3], "Last ned bildet og kopier teksten");
  assert.match(film.lead, /kopierer teksten/);
  assert.doesNotMatch(film.lead, /med tekst til annonsen/);
  for (const step of film.steps) assert.doesNotMatch(step, /med tekst til annonsen/, step);
  assert.equal(film.caption, "Illustrasjon av arbeidsflyten, uten lyd.");
  // Filmen viser styling-bildet: lappen staar til det er byttet (vakta fra F1).
  assert.deepEqual(film.video, { video: "film", label: "Produktfilm: fra opplasting til ferdig annonse", pending: "image" });
  assert.equal(film.video.pending, "image");
});

test("F2: Film.tsx er en serverkomponent paa night, uten tekst i JSX, med filmen i 16:9", () => {
  const f = "app/components/marketing/Film.tsx";
  assert.ok(MARKETING_TSX.includes(f), f);
  assert.deepEqual(literalTextsInFile(read(f)), [], f);
  const src = withoutComments(read(f));
  assert.doesNotMatch(src, /^"use client";/);
  assert.match(src, /aria-labelledby=\{titleId\}/);
  assert.match(src, /className="bg-night [^"]*text-paper"/);
  assert.match(src, /import \{ CONTAINER, H2 \} from "\.\/classes";/);
  assert.match(src, /aspect-video[^"]*rounded-card/);
  assert.doesNotMatch(src, /#[0-9a-fA-F]{3,8}\b/);
  // Filmen: kontroller, plakat og tekstversjonen (WCAG 1.2.1).
  const video = src.slice(src.indexOf("<MarketingVideo"), src.indexOf("/>", src.indexOf("<MarketingVideo")));
  for (const attr of [
    "src={VIDEOS.film.src}",
    "poster={IMAGES.filmPoster.src}",
    "label={film.video.label}",
    'mode="film"',
    "labels={site.video}",
    "describedBy={`${leadId} ${stepsId}`}",
  ]) {
    assert.ok(video.includes(attr), attr);
  }
  assert.match(src, /<p id=\{leadId\}/);
  assert.match(src, /<ol id=\{stepsId\}/);
  // Lappen under filmen, og nummeret paa stegene kommer fra rekkefoelgen.
  assert.match(src, /\{film\.caption\}\s*\{film\.video\.pending && <PendingMark label=\{site\.pendingLabels\.image\} \/>\}/);
  assert.match(src, /film\.steps\.map\(\(step, i\) =>/);
  assert.match(src, /\{i \+ 1\}/);
  // MarketingVideo sender describedBy videre til filmen.
  const mv = withoutComments(read("app/components/marketing/MarketingVideo.tsx"));
  assert.match(mv, /describedBy\?: string;/);
  assert.match(mv, /aria-describedby=\{describedBy\}/);
});

// ---------------------------------------------------------------------------
// F3: toppen med mosaikken, «AI-studio» og ny SEO-tittel (Petter og Cowork 20.10).
// ---------------------------------------------------------------------------

test("F3: toppen har tekstene Petter bestemte, og freeNote og «Prøv gratis» er uendret", () => {
  const { hero } = home;
  assert.equal(hero.eyebrow, "AI-studio for eiendomsmeglere");
  assert.equal(hero.title, "Bilder, film og tekst til boligannonsen.");
  assert.equal(hero.titleEmphasis, "Ett sted.");
  assert.equal(
    hero.lead,
    "Gjør dagsbilder til kveldsbilder, rydd og møbler rommene, lag film og skriv annonseteksten. Du godkjenner alt, og hvert bilde får synlig AI-merke og ferdig tekst til annonsen."
  );
  assert.deepEqual(hero.secondary, { label: "Se filmen", href: "#film" });
  assert.equal(hero.freeNote, "{n} gratis bilder når du registrerer deg. Uten kort.");
  assert.equal(hero.aiLabel, "AI");
  // Designets tekster som ikke brukes (Cowork 20.10).
  for (const [path, text] of strings(home, "home")) {
    assert.ok(!text.includes("Prøv gratis med") && !text.includes("Uten kort. Originalen"), path);
  }
});

test("F3: mosaikken har fem ruter, kveldsbildet foerst og ekte, de andre med pending «image»", () => {
  const { tiles } = home.hero.mosaic;
  assert.deepEqual(
    tiles.map((t) => t.label),
    ["Kveldsbilde", "Rydd opp", "Annonsetekst", "Digital styling", "Film"]
  );
  // Det foerste bildet er det ekte kveldsbildet med AI-merket, uten lapp (LCP).
  assert.deepEqual(tiles[0], {
    label: "Kveldsbilde",
    image: { image: "pairEveningResult", alt: "Stue som kveldsbilde laget med AI, med AI-merket nede til venstre" },
  });
  assert.ok(!("pending" in tiles[0].image), "kveldsbildet er ekte");
  // Alle andre resultatbilder og videoen er midlertidige.
  const rest = tiles
    .slice(1)
    .flatMap((t): { pending?: string }[] => ("image" in t ? [t.image] : "video" in t ? [t.video] : []));
  assert.equal(rest.length, 3);
  for (const media of rest) assert.equal(media.pending, "image", JSON.stringify(media));
  assert.deepEqual(tiles.map((t) => ("image" in t ? t.image.image : null)), [
    "pairEveningResult",
    "pairCleanupResult",
    null,
    "pairStylingResult",
    null,
  ]);
  assert.deepEqual(tiles[2], { label: "Annonsetekst", quote: "«Lys hjørnestue med utgang til vestvendt balkong …»" });
  assert.deepEqual(tiles[4], {
    label: "Film",
    video: { video: "loop", label: "Utdrag fra produktfilmen", pending: "image" },
  });
});

test("F3: HeroMosaic er en serverkomponent uten tekst i JSX, med kveldsbildet nede til venstre og hoey prioritet", () => {
  const f = "app/components/marketing/HeroMosaic.tsx";
  assert.ok(MARKETING_TSX.includes(f), f);
  assert.deepEqual(literalTextsInFile(read(f)), [], f);
  const src = withoutComments(read(f));
  assert.doesNotMatch(src, /^"use client";/);
  assert.doesNotMatch(src, /#[0-9a-fA-F]{3,8}\b/);
  // Rutenettet: 6 kolonner fra 768 px, to under, kveldsbildet 4x3 og i full bredde paa mobil.
  assert.match(src, /className="grid grid-cols-2 [^"]*md:grid-cols-6 md:grid-rows-5/);
  assert.match(src, /role="group"\s+aria-label=\{mosaic\.label\}/);
  const areas = [...src.matchAll(/area: "([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(
    areas.map((a) => a.match(/md:col-span-\d md:row-span-\d/)?.[0]),
    ["md:col-span-4 md:row-span-3", "md:col-span-2 md:row-span-2", "md:col-span-2 md:row-span-1", "md:col-span-3 md:row-span-2", "md:col-span-3 md:row-span-2"]
  );
  assert.match(areas[0], /^col-span-2 /);
  // To <Image>: det foerste (kveldsbildet, i === 0) med hoey prioritet og utsnittet nede til venstre.
  assert.match(src, /const lead = i === 0;/);
  const images = [...src.matchAll(/<Image\n([\s\S]*?)\/>/g)].map((m) => m[1]);
  assert.equal(images.length, 2);
  const [lead, other] = images;
  for (const attr of ['loading="eager"', 'fetchPriority="high"', "object-left-bottom", "sizes={sizes}", "fill"]) {
    assert.ok(lead.includes(attr), `kveldsbildet: ${attr}`);
  }
  for (const attr of ["loading=", "fetchPriority", "object-left-bottom", "priority"]) {
    assert.ok(!other.includes(attr), `de andre bildene: ${attr}`);
  }
  for (const img of images) {
    assert.match(img, /src=\{IMAGES\[tile\.image\.image\]\}/);
    assert.match(img, /alt=\{tile\.image\.alt\}/);
  }
  // AI-lappen (CSS) bare paa de andre bildene; etiketten oeverst til venstre.
  assert.match(src, /\{!lead && \(\s*<span aria-hidden="true" className=\{AI_TAG\}>\s*\{aiLabel\}/);
  assert.match(src, /const AI_TAG =\s*"[^"]*bottom-2\.5 left-2\.5/);
  assert.match(src, /const TAG =\s*"[^"]*left-2\.5 top-2\.5/);
  // Loekka: MarketingVideo i loop-modus med plakaten og knappetekstene.
  const video = src.slice(src.indexOf("<MarketingVideo"), src.indexOf("/>", src.indexOf("<MarketingVideo")));
  for (const attr of ["src={VIDEOS.loop.src}", "poster={IMAGES.loopPoster.src}", "label={tile.video.label}", 'mode="loop"', "labels={site.video}"]) {
    assert.ok(video.includes(attr), attr);
  }
  // Annonseteksten: moerk rute med sitatet i font-display.
  assert.match(src, /bg-ink [^"`]*text-paper/);
  assert.match(src, /className="[^"]*font-display[^"]*">\{tile\.quote\}/);
});

test("F3: Hero.tsx viser mosaikken, ikke slideren, med kursiv titleEmphasis og ikonet paa «Se filmen»", () => {
  const src = withoutComments(read("app/components/marketing/Hero.tsx"));
  assert.doesNotMatch(src, /HeroSlider/);
  assert.match(src, /<HeroMosaic mosaic=\{hero\.mosaic\} aiLabel=\{hero\.aiLabel\} site=\{site\} \/>/);
  assert.match(src, /\{hero\.title\} <em className="italic">\{hero\.titleEmphasis\}<\/em>/);
  // Ekte kursiv i Instrument Serif (Petter 20.10, valg B), ikke en skraa variant fra nettleseren.
  assert.match(read("app/lib/fonts.ts"), /Instrument_Serif\(\{[^}]*style: \["normal", "italic"\],/);
  assert.match(src, /import \{ ArrowRight, Check, CirclePlay \} from "lucide-react";/);
  assert.match(src, /<CirclePlay aria-hidden="true"[^>]*\/>\s*\{hero\.secondary\.label\}/);
  // F5: slideren staar i eksemplene; bare ExampleTabs.tsx bruker den.
  assert.ok(existsSync(join(REPO_DIR, "app/components/marketing/HeroSlider.tsx")));
  const users = MARKETING_TSX.filter((f) => /<HeroSlider|from "\.\/HeroSlider"/.test(withoutComments(read(f))));
  assert.deepEqual(users, ["app/components/marketing/ExampleTabs.tsx"]);
});

// ---------------------------------------------------------------------------
// F4: tjenestene som seks kort i studioer (Petter og Cowork 20.10).
// ---------------------------------------------------------------------------

test("F4: tjenestene har tekstene Petter bestemte, og Skjul ansikter og skilt er ikke med", () => {
  const { services } = home;
  assert.equal(services.anchor, "tjenester");
  assert.equal(services.title, "Alt annonsen trenger, i ett studio.");
  assert.equal(
    services.lead,
    "Last opp bildene én gang, og velg hva som skal gjøres med hvert av dem. Alt kommer tilbake på samme sted, klart til annonsen."
  );
  assert.equal(services.aiLabel, "AI");
  assert.deepEqual(services.earlyAccess, { label: "Få tidlig tilgang", href: CONTACT_PATH });
  assert.deepEqual(services.also, {
    label: "Også i Bildestudio:",
    text: "Blå himmel, der grå himmel byttes med klar, blå himmel.",
  });
  assert.deepEqual(
    services.items.map((s) => [s.id, s.status === "available" ? s.orderLabel : null, s.media.kind]),
    [
      ["scene_transform", "Bestill kveldsbilde", "split"],
      ["virtual_stage", null, "split"],
      ["rydd_opp", null, "split"],
      ["video", null, "video"],
      ["copywriter", null, "ad"],
      ["plantegning", null, "plan"],
    ]
  );
  assert.equal(
    services.items[0].text,
    "Dagsbildet blir kveldsbilde, med himmel i blåtimen og lys i vinduer og lamper som finnes i bildet."
  );
  // 2e: Skjul ansikter og skilt blir i appen; prisene og bunnen tas i F6.
  for (const [path, text] of strings(services, "services")) assert.ok(!text.includes("Skjul ansikter"), path);
  const plan = services.items[5].media;
  assert.equal(plan.kind, "plan");
  if (plan.kind === "plan") {
    assert.deepEqual(plan.sketch, { caption: "Skisse", rooms: ["stue", "sov", "kjøkken", "bad"] });
    assert.deepEqual(plan.plan, { caption: "Plantegning", rooms: ["Stue", "Sov", "Kjøkken", "Bad", "Gang"] });
  }
});

test("F4: TG-142 paa markedssiden: bare det som er slaatt paa i appen kan bestilles", () => {
  // TG-NEW-142: forsiden skal ikke selge en tjeneste appen ikke leverer. Alle
  // tjenestene vises (Petter dag 48), men bare de som er slaatt paa, har
  // bestillingslenken; de andre har «Få tidlig tilgang» til kontaktsiden.
  // Id-en paa markedssiden er tjenestens kode; appen styrer verktoeyet (ENABLED).
  const APP_TOOL: Record<string, string> = { scene_transform: "skumring" };
  for (const s of home.services.items) {
    if (s.status === "soon") assert.ok(!("orderLabel" in s), s.id);
    else {
      assert.ok(Object.hasOwn(APP_TOOL, s.id), `${s.id}: mangler i kartet`);
      assert.equal(isServiceEnabled(APP_TOOL[s.id]), true, s.id);
    }
  }
  // «Også i Bildestudio» er Blå himmel, som er aapnet i appen (K3) og heter det samme der.
  assert.match(home.services.also.text, /^Blå himmel,/);
  assert.equal(isServiceEnabled("klart_vaer"), true);
  assert.equal((DICTIONARIES.nb.ui as Record<string, string>)["express.tool.klart_vaer.title"], "Blå himmel");
  assert.equal(home.services.earlyAccess.href, CONTACT_PATH);
  // Lenkene i Services.tsx: bestillingen gaar til site.cta, de andre til earlyAccess.
  const src = withoutComments(read("app/components/marketing/Services.tsx"));
  assert.match(
    src,
    /const link = s\.status === "available" \? \{ label: s\.orderLabel, href: site\.cta\.href \} : services\.earlyAccess;/
  );
  assert.equal(site.cta.href, START_PATH);
});

test("F4: det ekte AI-merket synes: resultatet til venstre, nede til venstre i utsnittet", () => {
  const evening = home.services.items[0].media;
  assert.equal(evening.kind, "split");
  if (evening.kind === "split") {
    assert.deepEqual(evening.after, {
      image: "pairEveningResult",
      alt: "Stue som kveldsbilde laget med AI, med AI-merket nede til venstre",
    });
    assert.ok(!("pending" in evening.after), "kveldsbildet er ekte");
    assert.deepEqual(evening.before, { image: "pairEveningOriginal", alt: "Samme stue tatt på dagtid" });
    assert.deepEqual(evening.labels, { after: "Kveld", before: "Dag" });
  }
  // Mediet tegnes i Media (isPending over har de samme if-ene).
  const src = withoutComments(read("app/components/marketing/Services.tsx"));
  const media = src.slice(src.indexOf("function Media("));
  const split = media.slice(media.indexOf('if (media.kind === "split")'), media.indexOf('if (media.kind === "video")'));
  const images = [...split.matchAll(/<Image\n([\s\S]*?)\/>/g)].map((m) => m[1]);
  assert.equal(images.length, 2);
  const [after, before] = images;
  assert.match(after, /src=\{IMAGES\[media\.after\.image\]\}/);
  assert.match(before, /src=\{IMAGES\[media\.before\.image\]\}/);
  for (const img of images) {
    assert.ok(img.includes('className="object-cover object-left-bottom"'), img);
    assert.ok(img.includes("fill") && !/loading=|fetchPriority|priority/.test(img), img);
  }
  // Originalen ligger over og klippes til hoeyre halvdel; resultatet ligger under og vises helt.
  assert.match(
    split,
    /<div className="absolute inset-0 \[clip-path:inset\(0_0_0_50%\)\]">\s*<Image\n\s*src=\{IMAGES\[media\.before\.image\]\}/
  );
  assert.ok(split.indexOf("media.after.image") < split.indexOf("media.before.image"));
  assert.match(split, /<span aria-hidden="true" className=\{AI_DOT\}>\s*\{aiLabel\}\s*<\/span>\s*\{media\.labels\.after\}/);
  // Sirkelen er lys paa den moerke lappen, som i designet (Petter 20.10).
  assert.match(src, /const AI_DOT =\s*"[^"]*\bbg-surface\b[^"]*\btext-ink"/);
  assert.doesNotMatch(src, /AI_CHIP/);
  // Bildet i annonseteksten: utsnittet nede til venstre og ingen CSS-lapp (som i mosaikken).
  const ad = media.slice(media.indexOf('if (media.kind === "ad")'), media.indexOf("<PlanIllustration"));
  assert.ok(ad.length > 0);
  assert.match(ad, /<Image\n[^/]*className="object-cover object-left-bottom"/);
  assert.doesNotMatch(ad, /AI_DOT|aiLabel/);
});

test("F4: F1-vakta finner de midlertidige bildene og videoen i tjenestene", () => {
  assert.deepEqual(missingTemporaryLabel(home.services, "services"), []);
  const stripped = JSON.parse(JSON.stringify(home.services, (k, v) => (k === "pending" ? undefined : v)));
  assert.deepEqual(missingTemporaryLabel(stripped, "services"), [
    "services.items[1].media.after",
    "services.items[1].media.before",
    "services.items[2].media.after",
    "services.items[2].media.before",
    "services.items[3].media.video",
  ]);
  assert.deepEqual(home.services.items[3].media, {
    kind: "video",
    video: { video: "loop", label: "Utdrag fra produktfilmen", pending: "image" },
    label: "Film",
  });
  // Lappen [BILDE] under kortene naar noe medium venter, i samme moenster som mosaikken.
  assert.match(
    withoutComments(read("app/components/marketing/Services.tsx")),
    /\{pending && \(\s*<p[^>]*>\s*<PendingMark label=\{site\.pendingLabels\.image\} \/>/
  );
});

test("F4: Services og PlanIllustration er serverkomponenter uten tekst i JSX og uten hex", () => {
  for (const f of ["app/components/marketing/Services.tsx", "app/components/marketing/PlanIllustration.tsx"]) {
    assert.ok(MARKETING_TSX.includes(f), f);
    assert.ok(filesIn("app/components/marketing", /\.tsx?$/).includes(f), f);
    assert.deepEqual(literalTextsInFile(read(f)), [], f);
    const src = withoutComments(read(f));
    assert.doesNotMatch(src, /^"use client";/, f);
    assert.doesNotMatch(read(f), /#[0-9a-fA-F]{3,8}\b/, f);
  }
  const src = withoutComments(read("app/components/marketing/Services.tsx"));
  // Toppen: «Prøv gratis» (site.cta) som knapp; rutenettet 1, 2 og 3 kolonner.
  assert.match(src, /<a href=\{site\.cta\.href\} className=\{`\$\{BIG_BUTTON\} shrink-0`\}>\s*\{site\.cta\.label\}/);
  assert.match(src, /className="grid grid-cols-1 [^"]*md:grid-cols-2 lg:grid-cols-3"/);
  assert.match(src, /<section id=\{services\.anchor\}/);
  // Kortet: article, studio, h3 med id og lenken som peker paa h3.
  assert.match(src, /<article\s/);
  assert.match(src, /\{s\.studio\}/);
  assert.match(src, /<h3 id=\{titleId\}/);
  assert.match(src, /aria-describedby=\{titleId\}/);
  assert.match(src, /const MEDIA = "relative h-\[230px\] overflow-hidden";/);
  // Videoen: loekka som i mosaikken, med Play foran etiketten.
  const video = src.slice(src.indexOf("<MarketingVideo"), src.indexOf("/>", src.indexOf("<MarketingVideo")));
  for (const attr of [
    "src={VIDEOS.loop.src}",
    "poster={IMAGES.loopPoster.src}",
    "label={media.video.label}",
    'mode="loop"',
    "labels={site.video}",
  ]) {
    assert.ok(video.includes(attr), attr);
  }
  assert.match(src, /<Play aria-hidden="true"[^>]*\/>\s*\{media\.label\}/);
  assert.match(src, /import \{ ArrowRight, PenLine, Play \} from "lucide-react";/);
  // Annonseteksten paa moerk flate, etiketten i amber.
  assert.match(src, /bg-ink p-\[18px\] text-paper/);
  assert.match(src, /bg-amber-bg [^"]*text-amber-fg/);
  assert.match(src, /text-paper\/75">\{media\.excerpt\}/);
  // Linja under kortene.
  assert.match(src, /\{services\.also\.label\}<\/span>\s*<span>\{services\.also\.text\}<\/span>/);
  // Plantegningen: SVG med role="img", aria-label fra innholdet og bare tokens.
  const plan = withoutComments(read("app/components/marketing/PlanIllustration.tsx"));
  assert.match(plan, /<svg viewBox=\{VIEW_BOX\} role="img" aria-label=\{plan\.label\}/);
  assert.match(plan, /\{plan\.sketch\.caption\}/);
  assert.match(plan, /\{plan\.plan\.caption\}/);
  assert.match(plan, /plan\.sketch\.rooms\.map\(/);
  assert.match(plan, /plan\.plan\.rooms\.map\(/);
  assert.doesNotMatch(plan, /\b(fill|stroke)="(?!none)/, "farger bare via klasser");
  const tokens = [...plan.matchAll(/\b(?:fill|stroke)-([a-z][a-z0-9-]*)/g)].map((m) => m[1]);
  const allowed = new Set(["none", "ink", "ink-2", "surface", "surface-2", "amber-bg", "green-bg", "neutral-bg", "neutral-fg"]);
  for (const t of tokens) assert.ok(allowed.has(t), t);
});

// ---------------------------------------------------------------------------
// F6a (Petter 20.10): merkingen lys, den aerlige versjonen som kort blokk,
// prisene uten Skjul ansikter og skilt og med [PRIS], og kjedene som egen
// seksjon.
// ---------------------------------------------------------------------------

test("F6a: merkingen er lys med strek over og under, og tekstene er uendret (A4)", () => {
  const src = withoutComments(read("app/components/marketing/Labeling.tsx"));
  assert.doesNotMatch(src, /bg-night|text-paper/);
  assert.match(src, /import \{ CONTAINER, FOCUS, H2, SECTION_BAND \} from "\.\/classes";/);
  assert.match(src, /className=\{`\$\{SECTION_BAND\} [^`]*text-ink`\}/);
  assert.match(src, /<h2 id=\{`\$\{labeling\.anchor\}-tittel`\} className=\{H2\}>/);
  // Tekstene er laast (A4 2, 3 og 7); de andre testene laaser dem ogsaa.
  assert.equal(home.labeling.eyebrow, "Merking");
  assert.equal(home.labeling.title, "Merket riktig. Hver gang.");
  assert.equal(
    home.labeling.lead,
    "Kjøpere skal kunne stole på bildene i annonsen. Derfor har hvert bilde vi lager et synlig AI-merke, og du får en ferdig tekst som sier hva som er endret."
  );
  assert.deepEqual(home.labeling.points.map((p) => p.text), [
    "AI-merket står på bildet, også i forhåndsvisningen.",
    "Teksten til annonsen får du når du godkjenner bildet.",
    "Originalen lagres urørt, og du ser den ved siden av kveldsbildet før du godkjenner.",
    "Laget med tanke på EUs åpenhetskrav for AI-innhold og Forbrukertilsynets veiledning.",
  ]);
  assert.deepEqual(home.labeling.more, { label: "Les mer om merkingen", href: "/no/merking" });
});

test("F6a: den aerlige versjonen er en kort blokk rett etter merkingen, med de samme tekstene (A4 5)", () => {
  const src = withoutComments(read("app/components/marketing/Honest.tsx"));
  // Mindre luft og mindre tittel enn en vanlig seksjon, men fortsatt h2.
  assert.doesNotMatch(src, /\bSECTION_Y\b|\bH2\b/);
  assert.match(src, /<h2\s+id="aerlig-tittel"/);
  assert.match(src, /md:grid-cols-2/);
  const page = withoutComments(read("app/(marketing)/no/page.tsx"));
  assert.ok(page.indexOf("<Labeling ") < page.indexOf("<Honest ") && page.indexOf("<Honest ") < page.indexOf("<Pricing "));
  assert.equal(home.honest.title, "Den ærlige versjonen.");
  assert.equal(home.honest.lead, "AI kan mye. Dette lar vi være, fordi bildene skal vise boligen slik den er.");
  assert.deepEqual(home.honest.points, [
    "Vi lager ikke vinduer, rom eller utsikt som ikke finnes.",
    "Vi endrer ikke arkitektur, materialer eller omgivelser.",
    "Lyset kommer bare fra vinduer og lamper som allerede er i bildet.",
    "Vi skjuler ikke skader eller feil ved boligen.",
  ]);
});

test("F6a: prisene har ikke Skjul ansikter og skilt, og linja med [PRIS] har de seks tjenestene", () => {
  // 2e: tillegget er ute av innholdet, typen og komponenten.
  for (const [path, text] of strings(home.pricing, "pricing")) assert.ok(!text.includes("Skjul ansikter"), path);
  assert.ok(!("addOn" in home.pricing) && !("chains" in home.pricing));
  const src = read("app/components/marketing/Pricing.tsx");
  assert.ok(!src.includes("Skjul ansikter"));
  assert.doesNotMatch(withoutComments(src), /addOn|privacyBlur|chains/);
  // 2c: navnet, kolon fra malen og lappen [PRIS].
  assert.equal(home.pricing.otherFormat, "{name}:");
  assert.deepEqual(
    home.pricing.others.map((o) => [o.name, o.price]),
    ["Digital styling", "Rydd opp", "Blå himmel", "Boligfilm", "Annonsetekst", "Plantegning"].map((n) => [n, { pending: "price" }])
  );
  assert.equal(fill(home.pricing.otherFormat, { name: "Blå himmel" }), "Blå himmel:");
  assert.equal(site.pendingLabels.price, "[PRIS]");
  const pricing = withoutComments(src);
  assert.match(pricing, /pricing\.others\.map\(\(o\) => \(/);
  assert.match(pricing, /\{fill\(pricing\.otherFormat, \{ name: o\.name \}\)\}\s*<PendingMark label=\{site\.pendingLabels\[o\.price\.pending\]\} \/>/);
  // Kortene er uendret.
  assert.deepEqual(
    [home.pricing.free.name, home.pricing.single.name, home.pricing.bundle.name],
    ["Prøv gratis", "Kveldsbilde", "{n} kveldsbilder"]
  );
  assert.equal((pricing.match(/<article className=/g) ?? []).length, 3);
});

test("F6a: lanseringssperren finner prisene som venter", () => {
  const items = pendingItems({ site, home, faq, faqPage, labelingPage, contactPage });
  assert.deepEqual(
    items.filter((i) => i.key === "price").map((i) => i.path),
    [0, 1, 2, 3, 4, 5].map((n) => `home.pricing.others[${n}].price`)
  );
  // MARKETING_PUBLIC kan ikke vaere true mens noe venter (se MS3a-testen).
  assert.ok(!MARKETING_PUBLIC);
});

test("F6a: kjedene er en egen seksjon etter prisene, paa ink, med #kjeder og de samme tekstene", () => {
  const f = "app/components/marketing/Chains.tsx";
  assert.ok(MARKETING_TSX.includes(f), f);
  assert.deepEqual(literalTextsInFile(read(f)), [], f);
  const src = withoutComments(read(f));
  assert.doesNotMatch(src, /^"use client";/);
  assert.doesNotMatch(read(f), /#[0-9a-fA-F]{3,8}\b/);
  assert.match(src, /<section\s+id=\{chains\.anchor\}\s+aria-labelledby=\{`\$\{chains\.anchor\}-tittel`\}\s+className="bg-ink [^"]*text-paper"/);
  assert.match(src, /<h2 id=\{`\$\{chains\.anchor\}-tittel`\}/);
  // Teksten til venstre og knappen til hoeyre fra md, under hverandre paa mobil.
  assert.match(src, /flex flex-col [^`]*md:flex-row [^`]*md:justify-between/);
  assert.match(src, /href=\{chains\.cta\.href\}/);
  assert.match(withoutComments(read("app/(marketing)/no/page.tsx")), /<Chains chains=\{home\.chains\} \/>/);
  // Samme tekster som kortet i prisene hadde (ingen nye loefter).
  assert.deepEqual(home.chains, {
    _type: "chains",
    anchor: "kjeder",
    eyebrow: "For kjeder og partnere",
    title: "Deres merkevare. Vår motor.",
    text: "Pris etter volum og type konto. Løsningen kan leveres i kjedens egen profil.",
    points: ["Egen logo, egne farger og egen nettadresse", "Bildene leveres i kjedens profil", "Volumpris for alle kontorene"],
    cta: { label: "Snakk med oss", href: "#kontakt" },
  });
  // Menyen og «Kjede eller partner?» peker hit.
  const target = `#${home.chains.anchor}`;
  assert.ok(site.topBar.links.some((l) => l.label === "For kjeder og partnere" && l.href === target));
  assert.equal(home.finalCta.secondary.href, target);
});

// ---------------------------------------------------------------------------
// F6b (Petter 20.10): fire spoersmaal paa forsiden, «Hvem eier bildene?»
// med [JURIDISK SJEKK], den siste knappen lys med {brand}, og bunnen med de
// seks tjenestene. Skjul ansikter og skilt er ikke paa forsiden (2e).
// ---------------------------------------------------------------------------

test("F6b: forsiden viser fire spoersmaal i rekkefoelgen fra designet, og «Hvem eier bildene?» venter paa juridisk sjekk", () => {
  assert.deepEqual(faq.filter((i) => i.showOnHome).map((i) => i.id), ["lov", "eierskap", "fornoyd", "lagring"]);
  // Rett etter svaret om lov, som er uendret (TG-NEW-223-testen laaser teksten).
  assert.equal(faq[0].id, "lov");
  const owner = faq[1];
  assert.deepEqual(owner, {
    id: "eierskap",
    q: "Hvem eier bildene?",
    a: "Ikke vi. Rettighetene til originalfotoet ligger hos deg eller fotografen, som før, og det redigerte bildet kan du bruke på de samme vilkårene som originalen. Du må ha lov til å bruke og redigere bildet du laster opp. Ofte står det i avtalen med fotografen.",
    pending: "legal",
    showOnHome: true,
  });
  assert.equal(site.pendingLabels.legal, "[JURIDISK SJEKK]");
  // Svaret og lappen vises etter hverandre (FaqList).
  const list = withoutComments(read("app/components/marketing/FaqList.tsx"));
  assert.ok(list.indexOf("item.a !== null &&") < list.indexOf("item.pending &&"));
});

test("F6b: ingen tekst paa forsiden nevner Skjul ansikter og skilt, men svaret om pris paa spoersmaalssiden gjoer det", () => {
  // site.offer er bare tall (privacyBlur staar for svaret om pris).
  const shown = [
    ...strings(home, "home"),
    ...strings(site, "site").filter(([p]) => !p.startsWith("site.offer.")),
    ...strings(faq.filter((i) => i.showOnHome), "faq"),
  ];
  assert.ok(shown.length > 100, String(shown.length));
  for (const [path, text] of shown) assert.ok(!text.includes("Skjul ansikter"), path);
  const price = faq.find((i) => i.id === "pris")!;
  assert.ok((price.a ?? "").includes("Skjul ansikter og skilt koster {privacyBlur} kr per bilde."));
  assert.equal(price.showOnHome, false);
  assert.equal(typeof site.offer.prices.privacyBlur, "number");
});

test("F6b: den siste knappen er lys og har {brand} i tittelen", () => {
  assert.equal(home.finalCta.title, "Prøv {brand} på dine egne bilder.");
  assert.equal(fill(home.finalCta.title, { brand: DEFAULT_BRAND.displayName }), `Prøv ${DEFAULT_BRAND.displayName} på dine egne bilder.`);
  assert.equal(home.finalCta.text, "{n} gratis bilder når du registrerer deg. Uten kort.");
  assert.deepEqual(home.finalCta.secondary, { label: "Kjede eller partner? Snakk med oss", href: "#kjeder" });
  const src = withoutComments(read("app/components/marketing/FinalCta.tsx"));
  assert.doesNotMatch(src, /bg-ink|text-paper/);
  assert.match(src, /className="bg-surface-2 [^"]*text-ink"/);
  assert.match(src, /\{fill\(finalCta\.title, \{ brand: brand\.displayName \}\)\}/);
  assert.match(src, /href=\{site\.cta\.href\}\s+className=\{`[^`]*bg-primary [^`]*text-on-primary/);
  assert.match(withoutComments(read("app/(marketing)/no/page.tsx")), /<FinalCta finalCta=\{home\.finalCta\} site=\{site\} brand=\{brand\} \/>/);
});

test("F6b: bunnen har de seks tjenestene og Priser, og linja nederst venter paa bildene", () => {
  assert.equal(site.footer.tagline, "AI-studio for eiendomsmeglere.");
  const [services] = site.footer.columns;
  assert.equal(services.title, "Tjenester");
  assert.deepEqual(services.links, [
    { label: "Kveldsbilde", href: "#tjenester" },
    { label: "Digital styling", href: "#tjenester" },
    { label: "Rydd opp", href: "#tjenester" },
    { label: "Boligfilm", href: "#tjenester" },
    { label: "Annonsetekst", href: "#tjenester" },
    { label: "Plantegning", href: "#tjenester" },
    { label: "Priser", href: "#priser" },
    { label: "Guide: AI-bilder i boligannonsen" },
  ]);
  // Samme navn som tjenestekortene, i samme rekkefoelge.
  assert.deepEqual(services.links.slice(0, 6).map((l) => l.label), home.services.items.map((i) => i.title));
  assert.equal(`#${home.services.anchor}`, "#tjenester");
  // Paa en underside gaar ankrene til forsiden.
  assert.deepEqual(
    onPage(services.links, MARKETING_HOME).map((l) => l.href),
    [...Array(6).fill("/no#tjenester"), "/no#priser", undefined]
  );
  assert.deepEqual(site.footer.note, { text: "Alle eksempelbilder er laget med tjenesten og merket som AI.", pending: "image" });
  assert.ok(pendingItems({ site }).some((i) => i.path === "site.footer.note" && i.key === "image"));
  const src = withoutComments(read("app/components/marketing/Footer.tsx"));
  assert.match(src, /\{footer\.note\.text\}\s*\{footer\.note\.pending && <PendingMark label=\{site\.pendingLabels\[footer\.note\.pending\]\} \/>\}/);
  // Hjelp, Trygghet og Kontakt er uendret.
  assert.deepEqual(site.footer.columns.map((c) => c.title), ["Tjenester", "Trygghet"]);
  assert.deepEqual(site.footer.contact.links, [
    { label: "For kjeder og partnere", href: "#kjeder" },
    { label: "Logg inn", href: "/start" },
  ]);
});
