import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { SERVICE_CARD_TEXT, UPLOAD_CARD_ID, cardSize, splitBySize, uploadScrollBehavior } from "./serviceCards.ts";
import { isServiceEnabled, orderableTools, pageCards, visibleCategories } from "./services.ts";
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
  // T1: ogsaa lenkekortet til Annonsetekst (kind "page"), som vises naar flagget slipper brukeren inn.
  const ids = [...orderableTools(), ...pageCards(true)].map((t) => t.id);
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
    annonsetekst: "Velg bolig",
  });
  assert.deepEqual(cta("en"), {
    skumring: "Choose dusk image",
    klart_vaer: "Choose blue sky",
    aarstider: "Choose seasons",
    digital_styling: "Choose virtual staging",
    privacy_blur: "Choose Blur faces",
    annonsetekst: "Choose property",
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
  // T1: lenkekortet (kind "page") er én <Link> rundt samme innhold, i stedet for knappen.
  assert.equal(card.match(/<Link\b/g)?.length, 1);
  assert.equal(card.match(/href=/g)?.length, 1);
  assert.match(card, /<Link\s+href=\{href\}/);
  assert.doesNotMatch(card, /<a\b/);
  const body = card.slice(card.indexOf("function CardBody("));
  assert.doesNotMatch(body, /<button\b|<a\b|href=|<Link\b/);
  assert.equal(card.match(/<CardBody \{\.\.\.body\} \/>/g)?.length, 2);
  assert.equal(card.match(/aria-pressed=/g)?.length, 1);
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
  // Dag 58: det lille kortet har 24 px.
  assert.match(card, /font-display font-normal/);
  assert.match(card, /"text-\[30px\] xl:text-\[38px\]"/);
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
  // Digital styling (Dag 58): Japandi-paret fra STYLINGKORT A (rom 13849265_2),
  // med AI-merket fra backend i etter-bildet.
  assert.match(src, /digital_styling: \{ before: stylingBefore, after: stylingAfter \}/);
  assert.match(src, /^import stylingBefore from "\.\/bilder\/styling-for\.jpg";$/m);
  assert.match(src, /^import stylingAfter from "\.\/bilder\/styling-etter\.jpg";$/m);
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
  const coming = page.indexOf("{comingTools.map(");
  assert.ok(cards > 0 && cards < upload && upload < coming, `${cards} ${upload} ${coming}`);
  assert.match(page, /<div className="grid grid-cols-1 gap-6 lg:grid-cols-3">\s*\{LARGE_TOOLS\.map/);
  // «Kommer» har en overskrift, og alle kortene som ikke kan bestilles staar der.
  assert.match(page, /t\(locale, "express\.comingTitle"\)/);
  const coming_ = visibleCategories().flatMap((c) => c.items).filter((t) => !t.orderable).map((t) => t.id);
  assert.deepEqual(coming_, ["magic_cleanup", "same_furniture_angles", "video", "annonsetekst"]);
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

// ---------------------------------------------------------------------------
// Dag 58 del 4: store kort for de tre demotjenestene, små uten bilde under.
// ---------------------------------------------------------------------------

test("Dag 58: Kveldsbilde, Digital styling og Årstider er store; Blå himmel og Skjul ansikter er små", () => {
  const { large, small } = splitBySize(orderableTools());
  assert.deepEqual(large.map((t) => t.id).sort(), ["aarstider", "digital_styling", "skumring"]);
  assert.deepEqual(small.map((t) => t.id).sort(), ["klart_vaer", "privacy_blur"]);
  assert.equal(cardSize("skumring"), "large");
  assert.equal(cardSize("klart_vaer"), "small");
  assert.equal(cardSize("privacy_blur"), "small");
  // Ukjent id er lite, aldri stort med bilde.
  assert.equal(cardSize("ukjent"), "small");
});

test("Dag 58: ingen tjeneste forsvinner, rekkefoelgen er som foer, og ENABLED er urort", () => {
  const tools = orderableTools();
  const { large, small } = splitBySize(tools);
  assert.equal(large.length + small.length, tools.length);
  const order = tools.map((t) => t.id);
  const inOrder = (ids: string[]) => ids.every((id, i) => i === 0 || order.indexOf(ids[i - 1]) < order.indexOf(id));
  assert.ok(inOrder(large.map((t) => t.id)));
  assert.ok(inOrder(small.map((t) => t.id)));
  for (const id of ["skumring", "digital_styling", "aarstider", "klart_vaer", "privacy_blur"]) {
    assert.equal(isServiceEnabled(id), true, id);
  }
});

test("Dag 58: siden viser de små kortene uten bilde, med samme valg og bestilling", () => {
  const page = withoutComments(read(PAGE));
  assert.match(page, /splitBySize\(ORDERABLE_TOOLS\)/);
  assert.match(page, /LARGE_TOOLS\.map/);
  // De små vises naar det finnes noen, uten andre vilkaar.
  // T1: lenkekortet til Annonsetekst staar sist blant de små naar flagget slipper brukeren inn.
  assert.match(page, /\n\s*\{SMALL_TOOLS\.length \+ linkTools\.length > 0 && \(\s*<div[^>]*>\s*\{SMALL_TOOLS\.map/);
  assert.match(page, /images=\{undefined\}[\s\S]*?size="small"/);
  // Begge kortstoerrelsene velger med selectTool, som foer.
  assert.equal(page.match(/onSelect=\{\(\) => selectTool\(tool\.id\)\}/g)?.length, 2);
  assert.doesNotMatch(page, /ORDERABLE_TOOLS\.map/);
  const card = withoutComments(read(CARD));
  assert.match(card, /\{!small && \(/);
});

// ---------------------------------------------------------------------------
// Dag 58 (live-sjekken 28.10): tre store i én rad, og ingressen med Årstider.
// ---------------------------------------------------------------------------

test("Dag 58: de store kortene er Kveldsbilde, Årstider og Digital styling i den rekkefoelgen, saa Blå himmel og Skjul ansikter", () => {
  const { large, small } = splitBySize(orderableTools());
  assert.deepEqual(large.map((t) => t.id), ["skumring", "aarstider", "digital_styling"]);
  assert.deepEqual(small.map((t) => t.id), ["klart_vaer", "privacy_blur"]);
});

test("Dag 58: de tre store staar i én rad fra 1024 px, ikke 2 + 1", () => {
  const page = withoutComments(read(PAGE));
  const grid = page.match(/<div className="([^"]*)">\s*\{LARGE_TOOLS\.map/);
  assert.ok(grid);
  assert.match(grid[1], /\bgrid-cols-1\b/);
  assert.match(grid[1], /\blg:grid-cols-3\b/);
  assert.doesNotMatch(grid[1], /grid-cols-2/);
  // Bildet er hoeyst ca. 350 px bredt i raden, og sizes sier det.
  assert.match(withoutComments(read(CARD)), /const SIZES = "\(min-width: 1024px\) 360px, 100vw";/);
});

test("Dag 58: ingressen nevner tjenestene i samme rekkefoelge som kortene, og alle med AI foer «laget med AI»", () => {
  const nb = DICTIONARIES.nb.ui["express.subtitle"].toLowerCase();
  const names = ["kveldsbilde", "årstider", "digital styling", "blå himmel", "skjuling av ansikter"];
  const at = names.map((n) => nb.indexOf(n));
  for (const [i, pos] of at.entries()) assert.ok(pos >= 0, names[i]);
  assert.deepEqual([...at].sort((a, b) => a - b), at);
  // Blå himmel er laget med AI og skal ikke staa etter merket (Forbrukertilsynet).
  const ai = nb.indexOf("laget med ai");
  for (const n of names.slice(0, 4)) assert.ok(nb.indexOf(n) < ai, n);
  assert.ok(nb.indexOf("skjuling av ansikter") > ai);
  const en = DICTIONARIES.en.ui["express.subtitle"].toLowerCase();
  for (const n of ["dusk image", "seasons", "digital styling", "blue sky", "blurring of faces"]) assert.ok(en.includes(n), n);
});
