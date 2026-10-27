import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { SERVICE_CARD_TEXT, UPLOAD_CARD_ID, uploadScrollBehavior } from "./serviceCards.ts";
import { orderableTools, visibleCategories } from "./services.ts";
import { DICTIONARIES } from "./i18n/index.ts";
import { withoutComments } from "./testing/jsxText.ts";

// D-1 (dag 54): de store tjenestekortene med foer/etter-bilde paa Tjenester
// (tegnebrett 1, svarene i dag54/D1_SVAR.md).

const APP_DIR = fileURLToPath(new URL("..", import.meta.url));
const read = (rel: string) => readFileSync(join(APP_DIR, rel), "utf8");

const PAGE = "(app)/tjenester/page.tsx";
const CARD = "components/ServiceCard.tsx";
const IMAGES = "(app)/tjenester/cardImages.ts";

test("D-1: hvert bestillbart kort har to brikker og en knappetekst paa nb og en, og ingen andre kort har det", () => {
  const ids = orderableTools().map((t) => t.id);
  assert.deepEqual(Object.keys(SERVICE_CARD_TEXT).sort(), [...ids].sort());
  for (const id of ids) {
    const { chips, cta } = SERVICE_CARD_TEXT[id];
    for (const key of [...chips, cta]) {
      for (const locale of ["nb", "en"] as const) {
        assert.ok(DICTIONARIES[locale].ui[key].trim().length > 0, `${locale} ${key}`);
      }
    }
  }
});

test("D-1: knappene sier «Velg …» til stegflyten kommer (D1_SVAR punkt 8)", () => {
  const cta = (locale: "nb" | "en") =>
    Object.fromEntries(Object.entries(SERVICE_CARD_TEXT).map(([id, c]) => [id, DICTIONARIES[locale].ui[c.cta]]));
  assert.deepEqual(cta("nb"), {
    skumring: "Velg kveldsbilde",
    klart_vaer: "Velg blå himmel",
    aarstider: "Velg årstider",
    digital_styling: "Velg digital styling",
    privacy_blur: "Velg Skjul ansikter",
  });
  assert.deepEqual(cta("en"), {
    skumring: "Choose dusk image",
    klart_vaer: "Choose blue sky",
    aarstider: "Choose seasons",
    digital_styling: "Choose virtual staging",
    privacy_blur: "Choose Blur faces",
  });
});

test("D-1: tittelen og linja er de samme noeklene som foer, og ingen tekst lover skilt eller gratisbilder", () => {
  const privacy = orderableTools().find((t) => t.id === "privacy_blur");
  assert.ok(privacy);
  assert.equal(DICTIONARIES.nb.ui[privacy.titleKey], "Skjul ansikter");
  assert.equal(DICTIONARIES.nb.ui[privacy.descKey], "Gjør ansikter og familiebilder uskarpe.");
  const nb = DICTIONARIES.nb.ui;
  assert.equal(nb["express.card.before"], "Før");
  assert.equal(nb["express.card.afterAi"], "Etter · AI");
  assert.equal(nb["express.card.example"], "Eksempel");
  for (const locale of ["nb", "en"] as const) {
    for (const [key, text] of Object.entries(DICTIONARIES[locale].ui)) {
      if (!key.startsWith("express.card.") && key !== "express.comingTitle") continue;
      assert.doesNotMatch(text, /skilt|plate|gratisbilde|free image|Bestill|Order/i, `${locale} ${key}`);
    }
  }
  // Kortet bruker titleKey og descKey fra services.ts, ikke egne tekster.
  const card = withoutComments(read(CARD));
  assert.match(card, /t\(locale, tool\.titleKey\)/);
  assert.match(card, /t\(locale, tool\.descKey\)/);
});

test("D-1: hele kortet er én knapp med aria-pressed, uten knapp eller lenke inni", () => {
  const card = withoutComments(read(CARD));
  assert.equal(card.match(/<button\b/g)?.length, 1);
  assert.doesNotMatch(card, /<a\b|href=|<Link\b/);
  assert.match(card, /aria-pressed=\{selected\}/);
  assert.match(card, /onClick=\{onSelect\}/);
  assert.match(card, /disabled=\{disabled\}/);
  // Navnet er tittelen; bildene er pynt inne i knappen.
  assert.match(card, /aria-labelledby=\{titleId\}/);
  assert.match(card, /aria-describedby=\{descId\}/);
  const alts = [...card.matchAll(/<Image\b[^>]*?alt=("[^"]*"|\{[^}]*\})/g)].map((m) => m[1]);
  assert.equal(alts.length, 3);
  for (const alt of alts) assert.equal(alt, '""');
  // Tittelen med Instrument Serif fra 28 px, knappeflaten minst 44 px, ingen skygge.
  assert.match(card, /font-display text-\[30px\][^"]*lg:text-\[38px\]/);
  assert.match(card, /min-h-12/);
  assert.doesNotMatch(card, /shadow|#[0-9a-f]{3,8}\b|-\[(#|rgb)/i);
  // Siden sender valget videre til selectTool, som foer.
  assert.match(withoutComments(read(PAGE)), /onSelect=\{\(\) => selectTool\(tool\.id\)\}/);
});

test("D-1: bildet er speilvendt som paa forsiden, saa AI-merket nede til venstre synes", () => {
  const card = withoutComments(read(CARD));
  const split = card.slice(card.indexOf("{images?.after ? ("), card.indexOf(") : images ? ("));
  // Resultatet ligger under og vises helt; originalen ligger over og klippes til hoeyre halvdel.
  assert.ok(split.indexOf("src={images.after}") > 0);
  assert.ok(split.indexOf("src={images.after}") < split.indexOf("src={images.before}"));
  assert.match(split, /\[clip-path:inset\(0_0_0_50%\)\]">\s*<Image src=\{images\.before\}/);
  // «Etter · AI» til venstre, «Før» til hoeyre.
  assert.match(split, /left-4`\}>\s*\{t\(locale, "express\.card\.afterAi"\)\}/);
  assert.match(split, /right-4`\}>\s*\{t\(locale, "express\.card\.before"\)\}/);
  // Uten resultat: bare originalen, med «Eksempel».
  const single = card.slice(card.indexOf(") : images ? ("));
  assert.doesNotMatch(single.slice(0, single.indexOf(") : null}")), /images\.after|afterAi/);
  assert.match(single, /t\(locale, "express\.card\.example"\)/);
  assert.match(card, /const IMAGE = "object-cover object-left-bottom";/);
});

test("D-1: bildene: kveldsparet fra forsiden, himmelen fra repoet, bare originalen for Skjul ansikter", () => {
  const src = withoutComments(read(IMAGES));
  assert.match(src, /skumring: \{ before: IMAGES\.pairEveningOriginal, after: IMAGES\.pairEveningResult \}/);
  assert.match(src, /klart_vaer: \{ before: skyBefore, after: skyAfter \}/);
  assert.match(src, /privacy_blur: \{ before: IMAGES\.pairEveningOriginal \}/);
  // Digital styling: bare originalen (Petter 25.10, valg b). Probe-resultatet
  // fjernet panelovnene og stikkontaktene og brukes ikke.
  assert.match(src, /digital_styling: \{ before: stylingBefore \}/);
  assert.match(src, /^import stylingBefore from "\.\/bilder\/styling-for\.jpg";$/m);
  assert.doesNotMatch(src, /styling-etter/);
  // Illustrasjonen (uskarpe plakater) og fotografens styling-bilder brukes ikke.
  assert.doesNotMatch(src, /skjul|pairStyling/i);
  for (const m of src.matchAll(/from "\.\/(bilder\/[\w-]+\.jpg)";/g)) {
    assert.ok(existsSync(join(APP_DIR, "(app)/tjenester", m[1])), m[1]);
  }
  // Hvert bestillbart kort har et bilde (Digital styling: stilproben, beslutning 4.6).
  for (const tool of orderableTools()) {
    assert.match(src, new RegExp(`^  ${tool.id}: \\{ before: `, "m"), tool.id);
  }
});

test("D-1: rekkefoelgen er kortene, saa opplastingen, saa «Kommer», og kortene staar i én kolonne under 1024 px", () => {
  const page = withoutComments(read(PAGE));
  const cards = page.indexOf("<ServiceCard");
  const upload = page.indexOf("<Card id={UPLOAD_CARD_ID}");
  const coming = page.indexOf("{COMING_TOOLS.map(");
  assert.ok(cards > 0 && cards < upload && upload < coming, `${cards} ${upload} ${coming}`);
  assert.match(page, /<div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-8">\s*\{ORDERABLE_TOOLS\.map/);
  // «Kommer» har en overskrift, og alle kortene som ikke kan bestilles staar der.
  assert.match(page, /t\(locale, "express\.comingTitle"\)/);
  const coming_ = visibleCategories().flatMap((c) => c.items).filter((t) => !t.orderable).map((t) => t.id);
  assert.deepEqual(coming_, ["magic_cleanup", "same_furniture_angles", "video", "copywriter"]);
});

test("D-1: et valgt kort ruller opplastingskortet inn, uten animasjon ved redusert bevegelse", () => {
  assert.equal(uploadScrollBehavior(true), "auto");
  assert.equal(uploadScrollBehavior(false), "smooth");
  assert.equal(UPLOAD_CARD_ID, "tjeneste-opplasting");
  const page = withoutComments(read(PAGE));
  // selectTool ber om rullingen; ?tjeneste= gjoer det ikke (startverdien 0).
  const select = page.slice(page.indexOf("const selectTool = "), page.indexOf("const handleFileChange"));
  assert.match(select, /setScrollRequest\(\(n\) => n \+ 1\);/);
  assert.match(page, /const \[scrollRequest, setScrollRequest\] = useState\(0\);/);
  const effect = page.slice(page.indexOf("if (scrollRequest === 0) return;"), page.indexOf("}, [scrollRequest]);"));
  assert.ok(effect.length > 0);
  assert.match(effect, /window\.matchMedia\("\(prefers-reduced-motion: reduce\)"\)\.matches/);
  assert.match(effect, /\.getElementById\(UPLOAD_CARD_ID\)/);
  assert.match(effect, /scrollIntoView\(\{ block: "start", behavior: uploadScrollBehavior\(reducedMotion\) \}\)/);
  // Kortet havner under den faste topplinja.
  assert.match(page, /<Card id=\{UPLOAD_CARD_ID\} padding="lg" className="scroll-mt-24 space-y-6">/);
});
