import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { withoutComments } from "./testing/jsxText.ts";
import { DICTIONARIES, codeText, t } from "./i18n/index.ts";
import { FURNISH_AS_CHOICES, STYLING_STYLES, stylingParams, stylingSummary, type FurnishAs, type StylingStyle } from "./styling.ts";
import { DEFAULT_BRAND } from "./brand.ts";
import { MOODBOARDS, ROOM_ICONS, boardText, type SvgNode } from "./moodboards.ts";
import { buildData, formatData } from "../../scripts/moodboards/data.ts";
import { parseMoodboard, parseSvg, SVG_ATTRS, SVG_TAGS } from "../../scripts/moodboards/parse.ts";

// D-3 (dag 54): stilvelgeren med moodboard og eksempelbilde. Fasiten er de
// byte-like kopiene av Coworks moodboard og stilpakker_v3.json i testdata/,
// med sha-ene fra ~/dev/_handoff/SHA256SUMS. node --test kan ikke laste .tsx,
// saa komponentene sjekkes som tekst (som i d5a.test.ts).

const APP_DIR = fileURLToPath(new URL("..", import.meta.url));
const TESTDATA = fileURLToPath(new URL("./testdata/", import.meta.url));
const BOARD_DIR = join(TESTDATA, "moodboard");
const IMAGE_DIR = join(APP_DIR, "(app)", "tjenester", "bilder", "stiler");
const read = (rel: string) => withoutComments(readFileSync(join(APP_DIR, rel), "utf8"));

const SHA256: Record<string, string> = {
  "moodboard/Stil01_ModerneNordisk.dc.html": "a8f2a5445a92ca4104f045b09fbd24cbe4b5aab1166972628ea228a687c24560",
  "moodboard/Stil02_Japandi.dc.html": "c4701720c3225bf1ec6ed83bb9f869720f65dfba3fd825272e22fd290fd5f2ca",
  "moodboard/Stil03_KlassiskEleganse.dc.html": "308af3b866183fb9c031dd9fe4fdd3372580b95e6daf8aa39e81fc9f71ffc86d",
  "moodboard/Stil04_StilleLuksus.dc.html": "136c5a431c479817c76467336823b4eb62b697e4af1d1db452d314230f31ce00",
  "moodboard/Stil05_Sekelskifte.dc.html": "32746b5ae97796065059c94457a58fb1e65a6cf802f0a859f613c472cfe723dc",
  "moodboard/Stil06_Funkis.dc.html": "39d03c792ea05150f25e9cc70115618764bec69dd50ff8fe92abc13542414808",
  "moodboard/Stil07_FemtiSeksti.dc.html": "cdfb9afbebc6f9af2e252588fd1e0863a538dfc7ed052e93b669b46ae54945c9",
  "moodboard/Stil08_Syttitall.dc.html": "661a45cc997d1672ed61fb9102bdd4450c50f9b1b98bce71b75a6ac11a53841a",
  "moodboard/Stil09_Fargerik.dc.html": "045e40cb01c77d3be085c3a47b928567a82a9a17d2c273429f1118fb3c9d0193",
  "moodboard/Stil10_DanskPastell.dc.html": "7e946e1934cc38daa731d1765ee72d5e1946d4cfa364201232f755d14eb27735",
  "moodboard/Stil11_Kyst.dc.html": "9d6ee628c30297228a70e6187ee64c00a9d76826e25f39a417f6a71e3ea689fe",
  "moodboard/Stil12_TradHytte.dc.html": "d94d3d9823c45e11ea80c33862c16a44abeec3266360db93b5359a4d4530f120",
  "moodboard/Stil13_ModerneHytte.dc.html": "d1f642490b1ff7a150908b97ddc09659b62b1c73844b3ee09c48fcaa4cd13678",
  "moodboard/Stil14_UrbanIndustri.dc.html": "3a3c8921ec23ac0f340dd20b23dd82cce34888988339facb27478cfc300257cc",
  "moodboard/Styling.dc.html": "2b411fd341c1ef410cf7aad2f6865c223d4ccf2db78d8f0278cf7e9fbc1255f1",
  "stilpakker_v3.json": "e5c95deb45e86252f1c37f9482c58245ac14707267675ba19a0a9b391dc091a5",
};

const boardFiles = readdirSync(BOARD_DIR).filter((f) => /^Stil\d\d_.*\.dc\.html$/.test(f)).sort();
const stylingHtml = readFileSync(join(BOARD_DIR, "Styling.dc.html"), "utf8");
const htmls = boardFiles.map((f) => readFileSync(join(BOARD_DIR, f), "utf8"));
const packages = JSON.parse(readFileSync(join(TESTDATA, "stilpakker_v3.json"), "utf8")) as {
  stiler: { nr: string; navn: string; id: string; LEVEL_DEFAULT: number }[];
};
const v3Names = JSON.parse(readFileSync(join(TESTDATA, "stilnavn_v3.json"), "utf8")) as {
  stiler: { nr: string; id: string; nb: string }[];
};

/** Kildeteksten rett fra HTML-en, uavhengig av parseren. */
function sourceText(html: string, re: RegExp): string {
  const m = html.match(re);
  assert.ok(m, String(re));
  return m[1].replace(/&amp;/g, "&");
}

/** Bredde og hoeyde fra SOF-blokken, og navnene paa APPn-blokkene (EXIF er APP1). */
function jpegInfo(bytes: Buffer): { width: number; height: number; appSegments: number[] } {
  assert.equal(bytes.readUInt16BE(0), 0xffd8, "ikke JPEG");
  const appSegments: number[] = [];
  let i = 2;
  for (;;) {
    assert.equal(bytes[i], 0xff, "ugyldig blokk");
    const marker = bytes[i + 1];
    const length = bytes.readUInt16BE(i + 2);
    if (marker >= 0xe0 && marker <= 0xef) appSegments.push(marker);
    if (marker === 0xc0 || marker === 0xc2) {
      return { height: bytes.readUInt16BE(i + 5), width: bytes.readUInt16BE(i + 7), appSegments };
    }
    i += 2 + length;
  }
}

function walk(node: SvgNode, visit: (node: SvgNode) => void): void {
  visit(node);
  for (const child of node[2]) walk(child, visit);
}

// --- Dataene er lik kildene -------------------------------------------------------

test("D-3: kopiene i testdata er byte-like kildene (sha256 fra SHA256SUMS)", () => {
  assert.deepEqual(
    [...boardFiles, "Styling.dc.html"].map((f) => `moodboard/${f}`),
    Object.keys(SHA256).filter((k) => k.startsWith("moodboard/"))
  );
  for (const [rel, sha] of Object.entries(SHA256)) {
    assert.equal(createHash("sha256").update(readFileSync(join(TESTDATA, rel))).digest("hex"), sha, rel);
  }
});

test("D-3: moodboards.json er nøyaktig det skriptet lager fra kopiene", () => {
  const expected = formatData(buildData(htmls, packages, stylingHtml));
  assert.equal(readFileSync(join(APP_DIR, "lib", "moodboards.json"), "utf8"), expected);
});

test("D-3: navn, kategori, setning, «Tenk på», «Passer for» og «Unngå» er lik kildeteksten for alle 14", () => {
  for (const [i, style] of STYLING_STYLES.entries()) {
    const html = htmls[i];
    const board = MOODBOARDS[style];
    assert.equal(board.id, style);
    assert.equal(board.nr, String(i + 1).padStart(2, "0"));
    assert.equal(board.navn, v3Names.stiler[i].nb, style);
    assert.equal(boardText(board.kategori), sourceText(html, /color: #5F5A52">\d\d · ([^<]+)</), style);
    assert.equal(boardText(board.setning), sourceText(html, /<\/h2>\s*<span[^>]*>([^<]+)</), style);
    assert.equal(board.tenkPaa, sourceText(html, />Tenk på<\/span> ([^<]+)<\/span>/), style);
    assert.equal(boardText(board.passerFor), sourceText(html, /<b>Passer for:<\/b> ([^<]+)</), style);
    assert.equal(boardText(board.unnga), sourceText(html, /<b>Unngå:<\/b> ([^<]+)</), style);
  }
});

test("D-3: pynt er LEVEL_DEFAULT fra stilpakker_v3.json, ikke prikkene i moodboardet", () => {
  for (const [i, style] of STYLING_STYLES.entries()) {
    assert.equal(packages.stiler[i].id, style);
    assert.equal(MOODBOARDS[style].pynt, packages.stiler[i].LEVEL_DEFAULT, style);
  }
  // Moodboardet for Klassisk eleganse sier 3; v3 sier 4 (RAPPORT_D3, AVVIK 4).
  assert.equal(MOODBOARDS.styling_nordisk_klassisk.pynt, 4);
});

// --- Alle 14 har alle delene og et bilde --------------------------------------------

test("D-3: alle 14 har kategori, setning, «Tenk på», 6 fliser, 6 møbelkort, 6 farger, «Passer for», «Unngå» og pynt 1–5", () => {
  assert.deepEqual(Object.keys(MOODBOARDS), [...STYLING_STYLES]);
  for (const style of STYLING_STYLES) {
    const b = MOODBOARDS[style];
    for (const text of [b.kategori, b.setning, b.tenkPaa, b.passerFor, b.unnga]) assert.ok(text.trim().length > 0, style);
    assert.equal(b.materialer.length, 6, style);
    assert.equal(b.mobler.length, 6, style);
    assert.equal(b.palett.length, 6, style);
    assert.ok(b.defs.length > 0, style);
    for (const tile of b.materialer) {
      assert.ok(tile.navn.trim().length > 0, style);
      assert.equal(tile.svg[0], "svg", style);
    }
    assert.match(b.mobler[0].etikett, /^Sofa$/, style);
    assert.match(b.mobler[1].etikett, /^Lenestol/, style);
    assert.match(b.mobler[2].etikett, /^Spiseplass$/, style);
    assert.match(b.mobler[3].etikett, /^Lys$/, style);
    assert.match(b.mobler[4].etikett, /^(Kunst|Pynt)$/, style);
    assert.match(b.mobler[5].etikett, /^Gulv$/, style);
    for (const m of b.mobler) assert.ok(m.tekst.trim().length > 0, style);
    for (const c of b.palett) {
      assert.match(c.hex, /^#[0-9A-F]{6}$/, style);
      assert.ok(c.navn.trim().length > 0, style);
    }
    assert.ok(Number.isInteger(b.pynt) && b.pynt >= 1 && b.pynt <= 5, style);
  }
});

test("D-3: hver stil har et eksempelbilde, 960 bredt, uten EXIF, importert i styleImages.ts", () => {
  const images = read("(app)/tjenester/styleImages.ts");
  for (const style of STYLING_STYLES) {
    const file = MOODBOARDS[style].bilde;
    assert.equal(file, `${MOODBOARDS[style].nr}_${style}.jpg`);
    const path = join(IMAGE_DIR, file);
    assert.ok(existsSync(path), file);
    const info = jpegInfo(readFileSync(path));
    assert.equal(info.width, 960, file);
    assert.equal(info.height, 640, file);
    assert.deepEqual(info.appSegments.filter((m) => m === 0xe1), [], `${file} har EXIF`);
    assert.match(images, new RegExp(`import \\w+ from "\\./bilder/stiler/${file}";`), file);
  }
  // Én fil per stil, og ingen originaler (1600 brede) i mappa.
  assert.equal(readdirSync(IMAGE_DIR).filter((f) => f.endsWith(".jpg")).length, STYLING_STYLES.length);
  assert.match(images, /export const STYLE_IMAGES: Record<StylingStyle, StaticImageData> = \{/);
  const page = read("(app)/tjenester/page.tsx");
  assert.match(page, /import \{ STYLE_IMAGES \} from "\.\/styleImages";/);
  assert.match(page, /images=\{STYLE_IMAGES\}/);
});

// --- Ingen interne merker, og «Tenk på» med ------------------------------------------

test("D-3: ingen «Cowork» eller «Reserve» i dataene, komponentene eller ordlista", () => {
  const sources = [
    readFileSync(join(APP_DIR, "lib", "moodboards.json"), "utf8"),
    read("components/StylingChoicePicker.tsx"),
    ...readdirSync(join(APP_DIR, "components", "styling")).map((f) => read(`components/styling/${f}`)),
    ...(["nb", "en"] as const).flatMap((l) => Object.values(DICTIONARIES[l].ui)),
  ];
  for (const src of sources) assert.doesNotMatch(src, /Cowork anbefaler|\bReserve\b/);
  // Dataene per stil nevner aldri Cowork; kilde-feltet sier hvor de kommer fra.
  // (\b: «preserveAspectRatio» i tegningene er ikke merket.)
  for (const style of STYLING_STYLES) assert.doesNotMatch(JSON.stringify(MOODBOARDS[style]), /cowork|\breserve\b/i);
});

test("D-3: «Tenk på» vises i fokuspanelet og er lik moodboardet for alle 14", () => {
  const panel = read("components/styling/StyleFocusPanel.tsx");
  assert.match(panel, /\{t\(locale, "styling\.thinkOf"\)\}:<\/b> \{boardText\(board\.tenkPaa\)\}/);
  assert.equal(t("nb", "styling.thinkOf"), "Tenk på");
  for (const [i, style] of STYLING_STYLES.entries()) {
    assert.equal(boardText(MOODBOARDS[style].tenkPaa), sourceText(htmls[i], />Tenk på<\/span> ([^<]+)<\/span>/), style);
  }
  assert.equal(MOODBOARDS.styling_moderne_nordisk.tenkPaa, "Bolia · Skeidar · IKEA Skandinavisk");
});

test("D-3: merkenavnet staar som {brand} i dataene og fylles fra brand.ts", () => {
  const json = readFileSync(join(APP_DIR, "lib", "moodboards.json"), "utf8");
  assert.ok(!json.includes(DEFAULT_BRAND.displayName));
  assert.equal(json.split("{brand}").length - 1, 3);
  assert.match(MOODBOARDS.styling_dansk_farge.unnga, /\{brand\} ikke maler vegger/);
  assert.equal(boardText("a {brand} b {brand}"), `a ${DEFAULT_BRAND.displayName} b ${DEFAULT_BRAND.displayName}`);
  const panel = read("components/styling/StyleFocusPanel.tsx");
  assert.match(panel, /t\(locale, "styling\.example", \{ brand: DEFAULT_BRAND\.displayName \}\)/);
  assert.match(panel, /t\(locale, "styling\.exampleAlt", \{ brand: DEFAULT_BRAND\.displayName, style: name \}\)/);
});

// --- Tegningene: hviteliste, ingen dangerouslySetInnerHTML -------------------------------

test("D-3: tegningene bruker bare hvitelista, og SvgArt har den samme lista", () => {
  const tags = new Set<string>();
  const attrs = new Set<string>();
  for (const style of STYLING_STYLES) {
    const b = MOODBOARDS[style];
    const roots = [...b.defs, ...b.materialer.map((m) => m.svg), ...b.mobler.map((m) => m.svg)];
    for (const root of roots) {
      walk(root, ([tag, a]) => {
        tags.add(tag);
        for (const name of Object.keys(a)) attrs.add(name);
      });
    }
  }
  for (const tag of tags) assert.ok((SVG_TAGS as readonly string[]).includes(tag), tag);
  for (const name of attrs) assert.ok((SVG_ATTRS as readonly string[]).includes(name), name);

  const art = read("components/styling/SvgArt.tsx");
  const artTags = [...art.match(/const TAGS = new Set\(\[([^\]]*)\]\)/)![1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(artTags, [...SVG_TAGS]);
  const attrBlock = art.match(/const ATTRS: Record<string, string> = \{([\s\S]*?)\n\};/)![1];
  const artAttrs = [...attrBlock.matchAll(/^\s*"?([\w-]+)"?:/gm)].map((m) => m[1]);
  assert.deepEqual(artAttrs, [...SVG_ATTRS]);
  assert.match(art, /if \(!TAGS\.has\(tag\)\) return null;/);
  assert.match(art, /if \(prop === undefined\) continue;/);
});

test("D-3: ingen fil under app/ bruker dangerouslySetInnerHTML", () => {
  const files = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? files(join(dir, e.name)) : /\.tsx?$/.test(e.name) && !/\.test\./.test(e.name) ? [join(dir, e.name)] : []
    );
  const all = files(APP_DIR);
  assert.ok(all.length > 50);
  for (const f of all) assert.doesNotMatch(withoutComments(readFileSync(f, "utf8")), /dangerouslySetInnerHTML/, f);
});

test("D-3: parseren kaster ved et ukjent element, en ukjent attributt og feil antall fliser", () => {
  assert.throws(() => parseSvg('<svg viewBox="0 0 1 1"><script></script></svg>'), /ukjent SVG-element <script>/);
  assert.throws(() => parseSvg('<svg viewBox="0 0 1 1"><rect onclick="x"></rect></svg>'), /ukjent attributt onclick/);
  assert.throws(() => parseSvg('<svg><a href="x"></a></svg>'), /ukjent SVG-element <a>/);
  assert.throws(() => parseSvg("<svg><rect></svg>"), /lukker/);
  const oneTileLess = htmls[0].replace(/<div style="position: relative; border-radius: 12px; overflow: hidden">[\s\S]*?<\/div>\n/, "");
  assert.throws(() => parseMoodboard(oneTileLess), /5 materialfliser, ventet 6/);
});

// --- Velgeren: oppsett og tilgjengelighet (D-3 kompakt) ---------------------------------

test("D-3: utstillingsvinduet har bildet med AI-lapp, navn, setning, palettprikker, brikker, pynt, «Tenk på», «Passer for» og «Unngå»", () => {
  const panel = read("components/styling/StyleFocusPanel.tsx");
  for (const field of ["kategori", "setning", "tenkPaa", "passerFor", "unnga"]) {
    assert.match(panel, new RegExp(`\\{boardText\\(board\\.${field}\\)\\}`), field);
  }
  assert.match(panel, /<Image\s+src=\{image\}/);
  assert.match(panel, /<span className=\{TAG\}>\{t\(locale, "compare\.ai"\)\}<\/span>/);
  assert.match(panel, /\{t\(locale, "styling\.exampleCaption"\)\}/);
  // Paletten som seks runde prikker: navnet som title og som skjermlesertekst.
  assert.match(panel, /board\.palett\.map\(/);
  assert.match(panel, /title=\{boardText\(swatch\.navn\)\}/);
  assert.match(panel, /<span className="sr-only">\{boardText\(swatch\.navn\)\}<\/span>/);
  // 3–4 materialer som brikker.
  assert.match(panel, /const CHIPS = 4;/);
  assert.match(panel, /board\.materialer\.slice\(0, CHIPS\)\.map\(/);
  assert.match(panel, /<DecorDots filled=\{board\.pynt\} of=\{5\} label=\{t\(locale, "styling\.decorDotsValue", \{ n: board\.pynt \}\)\} \/>/);
  // «Velg {style}» / «Fjern {style}» og «Åpne moodboard».
  assert.match(panel, /t\(locale, on \? "styling\.remove" : "styling\.pick", \{ style: name \}\)/);
  assert.match(panel, /onClick=\{\(e\) => onOpen\(e\.currentTarget\)\}/);
  assert.match(panel, /\{t\(locale, "styling\.openMoodboard"\)\}/);
  // Mobil: bildet oeverst (foerst i DOM-en), teksten under; PC: to kolonner.
  assert.ok(panel.indexOf("<Image") < panel.indexOf("board.setning"));
  assert.match(panel, /lg:grid-cols-2/);
  assert.equal(
    t("nb", "styling.exampleCaption"),
    "En tom referansestue møblert i stilen. Ditt rom får samme stil, ikke de samme møblene."
  );
  assert.equal(t("nb", "styling.example", { brand: DEFAULT_BRAND.displayName }), `Eksempel fra ${DEFAULT_BRAND.displayName}`);
  assert.equal(t("nb", "styling.remove", { style: "Japandi" }), "Fjern Japandi");
  assert.equal(t("nb", "styling.openMoodboard"), "Åpne moodboard");
});

test("D-3: moodboardet åpnes i en <dialog> med showModal(), med alle delene, og fokus går tilbake", () => {
  const dialog = read("components/styling/Moodboard.tsx");
  const picker = read("components/StylingChoicePicker.tsx");
  assert.match(dialog, /<dialog\s+ref=\{dialogRef\}/);
  assert.match(dialog, /dialog\.showModal\(\);/);
  assert.match(dialog, /dialog\.addEventListener\("close", close\);/);
  assert.match(dialog, /onClick=\{\(\) => dialogRef\.current\?\.close\(\)\}\s*aria-label=\{t\(locale, "lightbox\.close"\)\}/);
  // Nesten fullskjerm, lerretet 1200 × 860 skalert til vinduet; smalt vindu stables og ruller.
  assert.match(dialog, /h-\[96dvh\] max-h-none w-\[96vw\] max-w-none/);
  assert.match(dialog, /const CANVAS_W = 1200;\s*const CANVAS_H = 860;/);
  assert.match(dialog, /setScale\(Math\.min\(width \/ CANVAS_W, height \/ CANVAS_H\)\);/);
  assert.match(dialog, /transform: `scale\(\$\{scale\}\)`/);
  assert.match(dialog, /const wide = scale >= MIN_SCALE;/);
  // Alle delene.
  for (const part of [
    "board.materialer.map(",
    "big.map(",
    "small.map(",
    "board.palett.map(",
    "boardText(board.tenkPaa)",
    "boardText(board.passerFor)",
    "boardText(board.unnga)",
    "boardText(board.kategori)",
    "boardText(board.setning)",
    "<DecorDots filled={board.pynt}",
  ]) {
    assert.ok(dialog.includes(part), part);
  }
  // Fokus tilbake til knappen som aapnet den (kortets i-knapp eller panelets knapp).
  assert.match(picker, /const openSheet = \(style: StylingStyle, from: HTMLElement\) => \{\s*opener\.current = from;\s*setSheet\(style\);/);
  assert.match(picker, /const closeSheet = \(\) => \{\s*setSheet\(null\);\s*opener\.current\?\.focus\(\);/);
  assert.match(picker, /\{sheet !== null && \(\s*<MoodboardDialog board=\{MOODBOARDS\[sheet\]\} name=\{nameOf\(sheet\)\} onClose=\{closeSheet\}/);
  assert.match(picker, /onOpen=\{openSheet\}/);
  assert.match(picker, /onOpen=\{\(from\) => openSheet\(focus, from\)\}/);
});

test("D-3: kortene har tre knapper: vis (aria-current), i-knappen (44 px) og haken (aria-pressed)", () => {
  const cards = read("components/styling/StyleCards.tsx");
  const classes = read("components/styling/classes.ts");
  assert.match(classes, /export const FOCUS =\s*"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/);
  assert.equal(cards.match(/type="button"/g)?.length, 3);
  assert.equal(cards.match(/\$\{FOCUS\}/g)?.length, 3);
  assert.match(cards, /aria-label=\{t\(locale, "styling\.showStyle", \{ style: name \}\)\}\s*aria-current=\{focused \|\| undefined\}/);
  assert.match(cards, /onClick=\{\(e\) => onOpen\(style, e\.currentTarget\)\}\s*aria-label=\{t\(locale, "styling\.openMoodboardFor", \{ style: name \}\)\}/);
  assert.match(cards, /aria-label=\{t\(locale, "styling\.toggleStyle", \{ style: name \}\)\}/);
  // Trykkflaten paa i-knappen og haken er 44 px (size-11), selv om ikonet er mindre.
  assert.equal(cards.match(/flex size-11 items-center justify-center/g)?.length, 2);
  // Valgt: moerk ramme og fylt hake. Fokus: lys bakgrunn. To ting.
  assert.match(cards, /on \? "border-ink ring-1 ring-ink" : "border-line"/);
  assert.match(cards, /focused \? "bg-surface-2" : "bg-surface"/);
  // Stripe med seks farger (14 px) og navnet, uten beskrivelse. PC 7 per rad; mobil sveipes.
  assert.match(cards, /className="flex h-3\.5 w-full"/);
  assert.doesNotMatch(cards, /styleDesc/);
  assert.match(cards, /overflow-x-auto/);
  assert.match(cards, /snap-x snap-mandatory/);
  assert.match(cards, /lg:grid-cols-7/);
  assert.match(cards, /w-\[38%\] shrink-0 snap-start/);
  assert.equal(t("nb", "styling.openMoodboardFor", { style: "Funkis" }), "Åpne moodboard for Funkis");
  for (const locale of ["nb", "en"] as const) {
    const ui = DICTIONARIES[locale].ui;
    for (const key of ["styling.showStyle", "styling.toggleStyle", "styling.pick", "styling.remove", "styling.openMoodboardFor", "styling.moodboardLabel"] as const) {
      assert.match(ui[key], /\{style\}/, `${locale} ${key}`);
    }
  }
});

test("D-3: fokus og valg er to ting: et kort viser stilen, haken velger og viser den", () => {
  const picker = read("components/StylingChoicePicker.tsx");
  assert.match(picker, /useState<StylingStyle>\(value\.styles\[0\] \?\? STYLING_STYLES\[0\]\)/);
  // Kortet: bare setFocus, ingen onChange.
  assert.match(picker, /onFocus=\{setFocus\}/);
  // Haken og panelknappen: setFocus og toggleStyle (med taket).
  assert.match(picker, /const toggle = \(style: StylingStyle\) => \{\s*setFocus\(style\);/);
  assert.match(picker, /board=\{MOODBOARDS\[focus\]\}/);
  assert.match(picker, /image=\{images\[focus\]\}/);
  // Aa vise endrer ikke valget: kortets knapp kaller bare onFocus.
  const cards = read("components/styling/StyleCards.tsx");
  const show = cards.slice(cards.indexOf("onClick={() => onFocus(style)}"), cards.indexOf("onClick={(e) => onOpen("));
  assert.doesNotMatch(show, /onToggle|onChange/);
});

test("D-3: romflisene har ikonet fra designet, «Møbler som …» og linja, og sender samme furnish_as", () => {
  const picker = read("components/StylingChoicePicker.tsx");
  assert.match(picker, /FURNISH_AS_CHOICES\.map\(\(room\) => \(/);
  assert.match(picker, /onClick=\{\(\) => onChange\(\{ \.\.\.value, furnishAs: room \}\)\}\s*disabled=\{disabled\}\s*aria-pressed=\{value\.furnishAs === room\}/);
  assert.match(picker, /<SvgArt node=\{ROOM_ICONS\[room\]\} prefix="rom" className="size-5" \/>/);
  assert.match(picker, /\{codeText\(locale, "furnishAs", room\)\}/);
  assert.match(picker, /\{t\(locale, `styling\.roomSub\.\$\{room\}`\)\}/);
  assert.match(picker, /lg:grid-cols-5/);
  // Ikonene er lik designet, i samme rekkefoelge som FURNISH_AS_CHOICES.
  const defs = [...stylingHtml.matchAll(/\['(\w+)', '([^']+)', '([^']+)', '(is\w+)'\]/g)];
  assert.deepEqual(defs.map((d) => d[1]), [...FURNISH_AS_CHOICES]);
  for (const [, room, , sub, flag] of defs) {
    const svg = stylingHtml.match(new RegExp(`<sc-if value="\\{\\{item\\.${flag}\\}\\}"[^>]*>(<svg\\b[\\s\\S]*?<\\/svg>)<\\/sc-if>`))![1];
    assert.deepEqual(ROOM_ICONS[room as FurnishAs], parseSvg(svg), room);
    // Linja under er ordrett fra designet paa norsk, unntatt gangen (Petter,
    // AVVIK 1: gangen faar aldri speil, og knagger er faste ting).
    const nb = room === "hallway" ? "Benk, konsoll og teppe" : sub;
    assert.equal(t("nb", `styling.roomSub.${room as FurnishAs}`), nb, room);
    assert.ok(t("en", `styling.roomSub.${room as FurnishAs}`).length > 0, room);
  }
  assert.equal(t("en", "styling.roomSub.hallway"), "Bench, console and rug");
  for (const room of FURNISH_AS_CHOICES) {
    assert.doesNotMatch(t("nb", `styling.roomSub.${room}`), /speil|knagg/i, room);
    assert.doesNotMatch(t("en", `styling.roomSub.${room}`), /mirror|hook/i, room);
  }
  // Etiketten er fortsatt «Møbler som …», og verdien som sendes er rom-id-en.
  for (const room of FURNISH_AS_CHOICES) {
    assert.match(codeText("nb", "furnishAs", room), /^Møbler som /);
    assert.equal(
      stylingParams({ furnishAs: room, roomEmpty: true, styles: ["styling_japandi"], decor: null, wishes: "" })?.furnish_as,
      room
    );
  }
});

test("D-3: bestillingslinja viser riktig sammendrag, hva som mangler, og «Bestill» er av uten komplett valg", () => {
  const full = { furnishAs: "living_dining" as const, roomEmpty: true, styles: ["styling_japandi", "styling_funkis"] as StylingStyle[], decor: 3 as const, wishes: "" };
  assert.deepEqual(stylingSummary("nb", full), {
    text: "2 stiler · Middels pynt · Møbler som stue og spisestue",
    short: "2 stiler · Middels pynt",
    missing: null,
  });
  assert.equal(stylingSummary("nb", { ...full, styles: ["styling_japandi"], decor: null }).text, "1 stil · Anbefalt pynt · Møbler som stue og spisestue");
  assert.equal(stylingSummary("en", full).text, "2 styles · Medium decor · Furnish as living and dining room");
  // Det som mangler, i velgerens rekkefoelge: rom, stil, kryss. Samme regler som stylingParams.
  const none = { furnishAs: null, roomEmpty: false, styles: [] as StylingStyle[], decor: null, wishes: "" };
  assert.equal(stylingSummary("nb", none).text, "Ingen stil valgt · Anbefalt pynt · Rom ikke valgt");
  assert.equal(stylingSummary("nb", none).missing, "Velg hva rommet skal møbleres som.");
  assert.equal(stylingSummary("nb", { ...full, styles: [] }).missing, "Velg minst én stil.");
  assert.equal(stylingSummary("nb", { ...full, roomEmpty: false }).missing, "Bekreft at rommet er tomt for løse møbler.");
  for (const choice of [none, { ...full, styles: [] }, { ...full, roomEmpty: false }, { ...full, furnishAs: null }]) {
    assert.notEqual(stylingSummary("nb", choice).missing, null);
    assert.equal(stylingParams(choice), null);
  }
  assert.notEqual(stylingParams(full), null);

  // Siden: samme knapp, samme handleRun og runDisabled, bare for styling; «Start paa nytt» staar der den stod.
  const page = read("(app)/tjenester/page.tsx");
  assert.match(page, /\{isStyling && \(\s*<StylingOrderBar \{\.\.\.stylingSummary\(locale, styling\)\}>\s*<Button onClick=\{handleRun\} disabled=\{runDisabled\}>\s*\{t\(locale, isProcessing \? "styling\.ordering" : "styling\.order"\)\}/);
  // Dag 57: knappen «Lag bilde» gjelder ikke bestillingene (styling og aarstider, isOrder).
  assert.match(page, /\{!isOrder && \(\s*<Button onClick=\{handleRun\} disabled=\{runDisabled\}>\s*\{t\(locale, isProcessing \? "express\.running" : "express\.run"\)\}/);
  assert.match(page, /<Button variant="secondary" onClick=\{handleReset\} disabled=\{isProcessing\}>/);
  assert.ok(page.indexOf("<StylingOrderBar") < page.indexOf('variant="secondary" onClick={handleReset}'));
  // Sticky nederst, kant til kant i kortet, over safe-area paa mobil; én kort linje paa mobil.
  const bar = read("components/styling/StylingOrderBar.tsx");
  assert.match(bar, /sticky bottom-0 z-20 -mx-8/);
  assert.match(bar, /md:-mx-10 md:px-10/);
  assert.match(bar, /pb-\[calc\(0\.75rem\+env\(safe-area-inset-bottom\)\)\]/);
  assert.match(bar, /<p className="truncate text-sm font-medium text-ink sm:hidden">\{missing \?\? short\}<\/p>/);
});
