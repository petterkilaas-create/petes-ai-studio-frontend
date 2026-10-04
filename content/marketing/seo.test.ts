import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_BRAND } from "../../app/lib/brand.ts";
import {
  CONTACT_PATH,
  FAQ_PATH,
  LABELING_PATH,
  MARKETING_HOME,
  MARKETING_PAGES,
  MARKETING_PUBLIC,
  SITE_URL,
} from "../../app/lib/marketingAccess.ts";
import { ogText, robotsFor, sitemapFor } from "../../app/lib/seo.ts";
import { literalTextsInFile, withoutComments } from "../../app/lib/testing/jsxText.ts";
import { fill } from "./fill.ts";
import { getContactPage, getFaq, getFaqPage, getHome, getLabelingPage, getSite } from "./index.ts";
import { pendingItems } from "./pending.ts";

// MS4: SEO-grunnlaget. robots og sitemap foelger MARKETING_PUBLIC, metadata
// for /no fra innholdet, delingsbildet, noindex og bildeformatene.
// node --test kan ikke laste .tsx, saa sidene og configen sjekkes som tekst.

const REPO_DIR = fileURLToPath(new URL("../..", import.meta.url));
const read = (rel: string) => readFileSync(join(REPO_DIR, rel), "utf8");

const site = getSite("no");
const home = getHome("no");
const brand = DEFAULT_BRAND.displayName;

/** Alle filer under en mappe (rekursivt), relativt til repoet. */
function walk(rel: string): string[] {
  const dir = join(REPO_DIR, rel);
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(relative(REPO_DIR, full)) : [relative(REPO_DIR, full)];
  });
}

/** Rutene i app/(app)/ (mappene, uten route groups og dynamiske segmenter). */
const appRoutes = readdirSync(join(REPO_DIR, "app/(app)"), { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => `/${d.name}`);

const robotsText = (r: ReturnType<typeof robotsFor>) => JSON.stringify(r);

// ---------------------------------------------------------------------------
// robots og sitemap
// ---------------------------------------------------------------------------

test("MS4: robots er Disallow: / og uten sitemap til lansering", () => {
  const r = robotsFor(false);
  assert.deepEqual(r.rules, { userAgent: "*", disallow: "/" });
  assert.equal(r.sitemap, undefined);
  assert.doesNotMatch(robotsText(r), /"allow"/);
});

test("MS4: robots tillater markedssidene og peker til sitemap etter lansering (B1)", () => {
  const r = robotsFor(true);
  assert.deepEqual(r.rules, { userAgent: "*", allow: "/" });
  assert.equal(r.sitemap, `${SITE_URL}/sitemap.xml`);
  assert.doesNotMatch(robotsText(r), /disallow/i);
});

test("MS4: robots og sitemap foelger flagget, og filene bruker funksjonene", () => {
  assert.deepEqual(robotsFor(), robotsFor(MARKETING_PUBLIC));
  assert.deepEqual(sitemapFor(), sitemapFor(MARKETING_PUBLIC));
  assert.match(read("app/robots.ts"), /return robotsFor\(\);/);
  assert.match(read("app/sitemap.ts"), /return sitemapFor\(\);/);
  // Ingen Request-time API eller dynamisk config, saa de bygges statisk.
  for (const f of ["app/robots.ts", "app/sitemap.ts", "app/lib/seo.ts", "app/(marketing)/no/opengraph-image.tsx"]) {
    assert.doesNotMatch(read(f), /headers\(\)|cookies\(\)|export const dynamic|export const revalidate/, f);
  }
});

test("MS4: sitemap er tom til lansering, og har bare markedssidene med full adresse etter", () => {
  assert.deepEqual(sitemapFor(false), []);
  const urls = sitemapFor(true).map((e) => e.url);
  assert.deepEqual(urls, MARKETING_PAGES.map((p) => `${SITE_URL}${p}`));
  assert.ok(urls.includes(`${SITE_URL}${MARKETING_HOME}`));
  assert.ok(appRoutes.length > 3 && appRoutes.includes("/start"), "fant ikke app-rutene");
  for (const url of urls) {
    assert.ok(url.startsWith(`${SITE_URL}/`), url);
    assert.ok(!url.endsWith("/"), url);
    const path = url.slice(SITE_URL.length);
    for (const route of appRoutes) {
      assert.ok(path !== route && !path.startsWith(`${route}/`), `app-rute i sitemap: ${url}`);
    }
  }
  for (const p of MARKETING_PAGES) assert.ok(p === MARKETING_HOME || p.startsWith(`${MARKETING_HOME}/`), p);
});

// ---------------------------------------------------------------------------
// Adressen
// ---------------------------------------------------------------------------

test("MS4: adressen staar ett sted (SITE_URL), uten skraastrek til slutt", () => {
  assert.equal(SITE_URL, "https://husvy.com");
  const files = [...walk("app"), ...walk("content"), "proxy.ts", "next.config.ts"].filter(
    (f) => /\.(tsx?|css|json|md)$/.test(f) && !/\.test\.ts$/.test(f)
  );
  const hits = files.filter((f) => read(f).includes("husvy.com"));
  assert.deepEqual(hits, ["app/lib/marketingAccess.ts"]);
  assert.equal(read("app/lib/marketingAccess.ts").split("husvy.com").length - 1, 1);
});

// ---------------------------------------------------------------------------
// Metadata for /no
// ---------------------------------------------------------------------------

const layout = read("app/(marketing)/layout.tsx");
const page = read("app/(marketing)/no/page.tsx");

/** Tekstene i innholdet som venter (Claim med pending). */
function pendingTexts(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(pendingTexts);
  if (value === null || typeof value !== "object") return [];
  const r = value as Record<string, unknown>;
  const own = typeof r.pending === "string" && typeof r.text === "string" ? [r.text] : [];
  return [...own, ...Object.values(r).flatMap(pendingTexts)];
}

test("MS4: metadataBase er SITE_URL, og canonical og og:url er /no (blir https://husvy.com/no)", () => {
  assert.match(layout, /metadataBase: new URL\(SITE_URL\),/);
  assert.match(page, /alternates: \{ canonical: MARKETING_HOME \},/);
  assert.match(page, /openGraph: \{ type: "website", url: MARKETING_HOME, siteName: brand\.displayName, locale: "nb_NO" \},/);
  assert.match(page, /twitter: \{ card: "summary_large_image" \},/);
  assert.equal(new URL(MARKETING_HOME, SITE_URL).href, "https://husvy.com/no");
  // Siden setter ikke robots (da ville noindex fra layouten blitt overskrevet).
  assert.doesNotMatch(page, /robots:/);
});

test("MS4: tittel og beskrivelse kommer fra innholdet, uten plassholder og uten noe som venter", () => {
  assert.match(page, /title: fill\(site\.seo\.title, \{ brand: brand\.displayName \}\),/);
  assert.match(page, /description: home\.hero\.lead,/);
  assert.ok(site.seo.title.includes("{brand}"));
  assert.ok(!site.seo.title.includes(brand), "merket skal komme via {brand}");
  const title = fill(site.seo.title, { brand });
  assert.equal(title, "Husvy – kveldsbilder for eiendomsmeglere");
  const description = home.hero.lead;
  const waiting = pendingTexts({ site, home, faq: getFaq("no") });
  assert.ok(waiting.length > 0, "fant ingen tekst som venter");
  for (const text of [title, description]) {
    assert.doesNotMatch(text, /[[\]{}]/, text);
    assert.doesNotMatch(text, /\bEU\b|juridisk|minutt|sekund|\btimer?\b/i, text);
    for (const w of waiting) assert.ok(!text.includes(w), `${text} har en paastand som venter: ${w}`);
  }
  // Feltene selv venter ikke.
  assert.deepEqual(pendingItems({ seo: site.seo, title: home.hero.title, lead: home.hero.lead }), []);
  assert.ok(description.length >= 50 && description.length <= 160, String(description.length));
});

// ---------------------------------------------------------------------------
// Delingsbildet
// ---------------------------------------------------------------------------

const og = read("app/(marketing)/no/opengraph-image.tsx");

test("MS4: delingsbildet er 1200x630 med alt-tekst fra innholdet og ingen tekst skrevet rett inn", () => {
  assert.match(og, /export const size = \{ width: 1200, height: 630 \};/);
  assert.match(og, /export const contentType = "image\/png";/);
  assert.match(og, /export const alt = fill\(site\.seo\.ogImageAlt, \{ brand: brand\.displayName, title: hero\.title \}\);/);
  assert.match(og, /new ImageResponse\(<Card brand=\{brand\} hero=\{hero\} \/>, size\)/);
  assert.match(og, /\{ogText\(hero\.eyebrow\)\}/);
  assert.match(og, /\{ogText\(hero\.title\)\}/);
  assert.match(og, /\{ogText\(brand\.displayName\)\}/);
  assert.deepEqual(literalTextsInFile(og), []);
  assert.ok(site.seo.ogImageAlt.includes("{brand}"));
  const alt = fill(site.seo.ogImageAlt, { brand, title: home.hero.title });
  assert.equal(alt, "Husvy: Kveldsbilder av dagsbildene dine.");
  assert.doesNotMatch(alt, /[[\]{}]/);
  // Uten foto (bildene venter) og uten egen fontfil (A1: Geist fra next/og).
  assert.doesNotMatch(og, /readFile|fonts:|fetch\(|images\.ts|\.jpe?g|\.png"/);
});

test("MS4: teksten i delingsbildet har bare tegn Geist har (ellers henter next/og en font uten tidsgrense)", () => {
  // Verifisert 02.10: bokstavene, æøå, – ’ og «» gir ingen nettkall; symboler som → og ✓ gjoer det.
  // U+200B (usynlig bruddpunkt) mangler ogsaa. Sjekket paa teksten slik den tegnes (etter ogText).
  const geist = /^[\p{Script=Latin}0-9 \u00a0.,:;!?'’\-–«»()%]+$/u;
  for (const text of [brand, home.hero.eyebrow, home.hero.title]) {
    assert.match(text, geist, text);
    assert.match(ogText(text), geist, text);
  }
  assert.doesNotMatch("Kveldsbilder ✓", geist);
  assert.doesNotMatch("Kveldsbilder\u200bav", geist);
});

test("MS4: ogText gir riktige mellomrom, og teksten faar plass paa en linje", () => {
  assert.equal(ogText("Kveldsbilder av dagsbildene"), "Kveldsbilder\u00a0av\u00a0dagsbildene");
  for (const text of [brand, home.hero.eyebrow, home.hero.title]) {
    const out = ogText(text);
    assert.ok(!out.includes(" "), out);
    assert.equal(out.replace(/\u00a0/g, " "), text);
  }
  // ogText bryter ikke linja, saa teksten maa faa plass paa en linje (1040 px):
  // overskriften er 33 tegn og ca. 900 px ved 64 px (verifisert 02.10).
  assert.match(og, /fontSize: 64, lineHeight: 1\.05, letterSpacing: -2/);
  assert.ok(home.hero.title.length <= 36, `overskriften er ${home.hero.title.length} tegn, maks 36 paa en linje i delingsbildet`);
  assert.ok(home.hero.eyebrow.length <= 60, `linja over er ${home.hero.eyebrow.length} tegn, maks 60`);
  // Alt-teksten er vanlig tekst.
  assert.match(og, /export const alt = fill\(site\.seo\.ogImageAlt/);
});

// ---------------------------------------------------------------------------
// noindex og bildeformatene
// ---------------------------------------------------------------------------

const config = read("next.config.ts");

test("MS4: noindex paa *.vercel.app, paa app-sidene og paa markedssidene til lansering", () => {
  assert.match(
    config,
    /source: "\/:path\*",\n\s*has: \[\{ type: "host", value: "\.\*\\\\\.vercel\\\\\.app" \}\],\n\s*headers: \[\{ key: "X-Robots-Tag", value: "noindex" \}\],/
  );
  // Regelen matcher slik Next gjoer det (^verdi$ mot vertsnavnet).
  const host = new RegExp(`^${".*\\.vercel\\.app"}$`);
  assert.ok(host.test("petes-ai-studio-frontend.vercel.app"));
  assert.ok(host.test("petes-ai-studio-frontend-git-x-petter.vercel.app"));
  assert.ok(!host.test("husvy.com") && !host.test("vercel.app.husvy.com"));
  assert.match(read("app/(app)/layout.tsx"), /robots: \{ index: false, follow: false \},/);
  assert.match(layout, /robots: MARKETING_PUBLIC \? undefined : \{ index: false, follow: false \},/);
  assert.match(config, /globalNotFound: true,/);
});

test("MS4: next/image leverer AVIF foerst og WebP etter", () => {
  assert.match(config, /formats: \["image\/avif", "image\/webp"\],/);
});

// ---------------------------------------------------------------------------
// Lansering (MS6)
// ---------------------------------------------------------------------------

test("MS4: ved lansering er robots, sitemap og delingsbildet utenfor innloggingen", () => {
  const proxy = read("proxy.ts");
  const block = proxy.slice(proxy.indexOf("matcher: ["), proxy.indexOf("],", proxy.indexOf("matcher: [")));
  const matchers = [...block.matchAll(/^\s*'([^']+)',$/gm)].map((m) => new RegExp(`^${m[1].replace(/\\\\/g, "\\")}$`));
  const runs = (path: string) => matchers.some((r) => r.test(path));
  // Next 16 legger et suffiks paa bildeadressen (/no/opengraph-image-1pnh5h);
  // adressen uten suffiks gir 404. Begge maa vaere aapne.
  const paths = ["/robots.txt", "/sitemap.xml", `${MARKETING_HOME}/opengraph-image`, `${MARKETING_HOME}/opengraph-image-1pnh5h`];
  if (MARKETING_PUBLIC) {
    for (const p of paths) assert.ok(!runs(p), `MARKETING_PUBLIC er true, men ${p} krever innlogging`);
  } else {
    // Til lansering ligger alt bak innloggingen (MS4 endrer ikke proxyen).
    for (const p of paths) assert.ok(runs(p), p);
  }
});

// ---------------------------------------------------------------------------
// MS5a: innholdssidene
// ---------------------------------------------------------------------------

test("MS5a: MARKETING_PAGES er sidene som finnes under (marketing)/no", () => {
  const pages = walk("app/(marketing)/no")
    .filter((f) => f.endsWith("/page.tsx"))
    .map((f) => f.slice("app/(marketing)".length, -"/page.tsx".length))
    .sort();
  assert.deepEqual(pages, [...MARKETING_PAGES].sort());
  assert.deepEqual(MARKETING_PAGES, [MARKETING_HOME, FAQ_PATH, LABELING_PATH, CONTACT_PATH]);
  // Sitemap tar dem med ved lansering, med full adresse.
  assert.deepEqual(
    sitemapFor(true).map((e) => e.url),
    MARKETING_PAGES.map((p) => `${SITE_URL}${p}`)
  );
});

const SUBPAGES = [
  { file: "app/(marketing)/no/sporsmal-og-svar/page.tsx", path: FAQ_PATH, constName: "FAQ_PATH", content: getFaqPage("no") },
  { file: "app/(marketing)/no/merking/page.tsx", path: LABELING_PATH, constName: "LABELING_PATH", content: getLabelingPage("no") },
  { file: "app/(marketing)/no/kontakt/page.tsx", path: CONTACT_PATH, constName: "CONTACT_PATH", content: getContactPage("no") },
];

test("MS5a: hver underside har tittel, beskrivelse og canonical, og arver noindex og delingsbildet", () => {
  const waiting = pendingTexts({ site, home, faq: getFaq("no") });
  for (const { file, path, constName, content } of SUBPAGES) {
    const src = withoutComments(read(file));
    assert.match(src, /title: fill\(page\.seo\.title, \{ brand: brand\.displayName \}\),/, file);
    assert.match(src, /description: fill\(page\.seo\.description, \{ brand: brand\.displayName \}\),/, file);
    assert.match(src, new RegExp(`alternates: \\{ canonical: ${constName} \\},`), file);
    // Siden setter ikke robots, openGraph eller twitter: noindex og
    // delingsbildet arves (openGraph her ville erstattet bildet, sjekket i build).
    assert.doesNotMatch(src, /robots:/, file);
    assert.doesNotMatch(src, /openGraph:|twitter:|images:/, file);
    assert.equal(new URL(path, SITE_URL).href, `https://husvy.com${path}`);
    const title = fill(content.seo.title, { brand });
    const description = fill(content.seo.description, { brand });
    assert.ok(content.seo.title.includes("{brand}") && !content.seo.title.includes(brand), file);
    assert.ok(title.endsWith(` – ${brand}`), title);
    for (const text of [title, description]) {
      assert.doesNotMatch(text, /[[\]{}]/, text);
      assert.doesNotMatch(text, /\bEU\b|juridisk|minutt|sekund|\btimer?\b/i, text);
      for (const w of waiting) assert.ok(!text.includes(w), `${text} har en paastand som venter: ${w}`);
    }
    assert.ok(description.length >= 50 && description.length <= 160, `${file}: ${description.length}`);
  }
  // Delingsbildet ligger bare paa /no; undersidene arver det.
  assert.deepEqual(walk("app/(marketing)").filter((f) => /opengraph-image|twitter-image/.test(f)), [
    "app/(marketing)/no/opengraph-image.tsx",
  ]);
});
