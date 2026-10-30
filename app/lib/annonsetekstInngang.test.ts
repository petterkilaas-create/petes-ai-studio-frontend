import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AssignmentSummary } from "./assignments.ts";
import { DICTIONARIES, t } from "./i18n/index.ts";
import { listingTextHref, normalizeAddress, SAME_ADDRESS_PAGES, sameAddressOrders } from "./listingText.ts";
import {
  comingCards,
  ENABLED,
  LISTING_TEXT_PATH,
  LISTING_TEXT_UI,
  listingTextAccess,
  listingTextNeedsCapabilities,
  navLinks,
  orderableTools,
  pageCards,
  serviceHref,
  serviceShortcuts,
  toolFromParam,
} from "./services.ts";
import { literalTextsInFile, withoutComments } from "./testing/jsxText.ts";

/**
 * Annonsetekst, inngangen (TG-NEW-281, T1): flagget LISTING_TEXT_UI, kortet
 * paa Tjenester, snarveien paa /start, lenken paa bildesiden og sidene under
 * /annonsetekst. Sidene leses som tekst (node --test laster ikke .tsx).
 */

const APP_DIR = fileURLToPath(new URL("..", import.meta.url));
const read = (rel: string) => readFileSync(join(APP_DIR, rel), "utf8");

const PAGES = ["(app)/annonsetekst/page.tsx", "(app)/annonsetekst/[ordreId]/page.tsx"];
const COMPONENTS = ["components/annonsetekst/ListingTextGate.tsx", "components/annonsetekst/ListingTextOrder.tsx"];
const ENTRIES = ["(app)/tjenester/page.tsx", "(app)/start/page.tsx", "components/ordre/OrderImages.tsx", "components/ServiceCard.tsx"];

// --- flagget ---------------------------------------------------------------------

test("flagget: av i denne PR-en, og av gir nei uten kall til /me", () => {
  assert.equal(LISTING_TEXT_UI, "off");
  assert.equal(listingTextAccess(null), "no");
  assert.equal(listingTextAccess({ viewAll: true }), "no");
  assert.equal(listingTextAccess(null, "off"), "no");
  assert.equal(listingTextAccess({ viewAll: true }, "off"), "no");
  assert.equal(listingTextNeedsCapabilities(), false);
  assert.equal(listingTextNeedsCapabilities("off"), false);
});

test("flagget: admin slipper bare inn med view_all, og venter paa /me", () => {
  assert.equal(listingTextAccess(null, "admin"), "pending");
  assert.equal(listingTextAccess({ viewAll: true }, "admin"), "yes");
  assert.equal(listingTextAccess({ viewAll: false }, "admin"), "no");
  assert.equal(listingTextNeedsCapabilities("admin"), true);
});

test("flagget: on slipper inn alle, ogsaa uten svar fra /me, og sender ikke kallet", () => {
  assert.equal(listingTextAccess(null, "on"), "yes");
  assert.equal(listingTextAccess({ viewAll: false }, "on"), "yes");
  assert.equal(listingTextNeedsCapabilities("on"), false);
});

test("flagget: teksten gjelder en ordre, saa tilgangen sjekker ogsaa ordrene", () => {
  assert.equal(ENABLED.ordrer, true);
  const src = withoutComments(read("lib/services.ts"));
  assert.match(src, /if \(flag === "off" \|\| !isPageEnabled\(ORDERS_PATH\)\) return "no";/);
  assert.match(src, /return flag === "admin" && isPageEnabled\(ORDERS_PATH\);/);
  // Én linje aa endre i T6, og ikke en linje i ENABLED (som bare er av/paa).
  assert.match(src, /^export const LISTING_TEXT_UI: ListingTextUi = "off";$/m);
  assert.ok(!Object.keys(ENABLED).includes("annonsetekst"));
});

test("flagget: hooken spoer /me bare naar flagget er admin", () => {
  const src = withoutComments(read("hooks/useListingTextAccess.ts"));
  assert.match(src, /const ask = listingTextNeedsCapabilities\(\);/);
  assert.match(src, /if \(!ask\) return;\s*let cancelled = false;\s*void getCapabilities\(\{ getToken \}\)/);
  assert.match(src, /return listingTextAccess\(caps\);/);
});

// --- kortet og snarveien -----------------------------------------------------------

test("kortet: copywriter heter annonsetekst, er en lenke til /annonsetekst og kan aldri bestilles", () => {
  assert.equal(LISTING_TEXT_PATH, "/annonsetekst");
  const card = pageCards(true);
  assert.deepEqual(card.map((tool) => tool.id), ["annonsetekst"]);
  assert.equal(card[0].kind, "page");
  assert.equal(card[0].href, "/annonsetekst");
  assert.equal(card[0].orderable, false);
  assert.equal(toolFromParam("annonsetekst"), null);
  assert.equal(toolFromParam("copywriter"), null);
  assert.ok(!orderableTools().some((tool) => tool.id === "annonsetekst" || tool.id === "copywriter"));
});

test("kortet: skjult som lenke og vist som «Kommer» naar flagget ikke slipper brukeren inn", () => {
  assert.deepEqual(pageCards(false), []);
  assert.deepEqual(comingCards(false).map((tool) => tool.id), ["magic_cleanup", "same_furniture_angles", "video", "annonsetekst"]);
});

test("kortet: vist som lenke, og ikke lenger under «Kommer», naar flagget slipper brukeren inn", () => {
  assert.deepEqual(comingCards(true).map((tool) => tool.id), ["magic_cleanup", "same_furniture_angles", "video"]);
  const page = withoutComments(read("(app)/tjenester/page.tsx"));
  assert.match(page, /const listingText = useListingTextAccess\(\) === "yes";/);
  assert.match(page, /const linkTools = pageCards\(listingText\);/);
  assert.match(page, /\{linkTools\.map\(\(tool\) => \(\s*<ServiceCard[^>]*href=\{tool\.href\}/);
  // Lenkekortet velger ikke noe paa Tjenester.
  const links = page.slice(page.indexOf("{linkTools.map("), page.indexOf("/>", page.indexOf("{linkTools.map(")));
  assert.doesNotMatch(links, /onSelect|selectTool|selected=/);
});

test("snarveien paa /start: skjult naar flagget er av, sist og til /annonsetekst naar det slipper brukeren inn", () => {
  const off = serviceShortcuts(false);
  assert.deepEqual(off.map((s) => s.tool.id), orderableTools().map((tool) => tool.id));
  for (const s of off) assert.equal(s.href, serviceHref(s.tool.id));
  const on = serviceShortcuts(true);
  assert.equal(on.length, off.length + 1);
  assert.deepEqual(on.at(-1)?.tool.id, "annonsetekst");
  assert.equal(on.at(-1)?.href, "/annonsetekst");
  const page = withoutComments(read("(app)/start/page.tsx"));
  assert.match(page, /const listingText = useListingTextAccess\(\) === "yes";/);
  assert.equal(page.match(/<ServiceShortcuts locale=\{locale\} listingText=\{listingText\}/g)?.length, 2);
});

test("bildesiden: «Lag annonsetekst for denne boligen» til /annonsetekst/[ordreId], bare naar flagget slipper brukeren inn", () => {
  const src = withoutComments(read("components/ordre/OrderImages.tsx"));
  assert.match(src, /const listingText = useListingTextAccess\(\) === "yes";/);
  assert.match(
    src,
    /\{listingText && \(\s*<ButtonLink variant="secondary" href=\{listingTextHref\(assignmentId\)\}>\s*\{t\(locale, "listingText\.page\.fromOrder"\)\}/
  );
  // «Last ned» staar som foer, bare med bilder.
  assert.match(src, /\{images\.length > 0 && \(\s*<ButtonLink variant="secondary" href=\{orderDeliveryHref\(assignmentId\)\}>/);
  assert.equal(t("nb", "listingText.page.fromOrder"), "Lag annonsetekst for denne boligen");
});

test("menyen: ingen ny lenke til /annonsetekst", () => {
  assert.ok(!navLinks().some((l) => l.href === LISTING_TEXT_PATH));
});

// --- sidene ----------------------------------------------------------------------

test("sidene: flagget av gir ServiceUnavailable foer hooks og kall, og vakten venter paa /me", () => {
  for (const rel of PAGES) {
    const src = withoutComments(read(rel));
    assert.match(src, /^"use client";/, rel);
    const start = src.indexOf("export default function");
    const body = src.slice(start, src.indexOf("\n}\n", start));
    assert.match(body, /if \(listingTextAccess\(null\) === "no"\) return <ServiceUnavailable \/>;/, rel);
    assert.match(body, /<ListingTextGate>/, rel);
    assert.doesNotMatch(body.replace("use(params)", ""), /\buse[A-Z]\w*\(/, rel);
  }
  const gate = withoutComments(read("components/annonsetekst/ListingTextGate.tsx"));
  assert.match(gate, /if \(access === "no"\) return <ServiceUnavailable \/>;/);
  assert.match(gate, /if \(access === "pending"\) \{/);
  assert.match(gate, /role="status"/);
  // Tekstsiden: params med use(), og ny tilstand per ordre.
  const order = withoutComments(read("(app)/annonsetekst/[ordreId]/page.tsx"));
  assert.match(order, /const \{ ordreId \} = use\(params\);/);
  assert.match(order, /<ListingTextOrder key=\{ordreId\} assignmentId=\{ordreId\} \/>/);
});

test("sidene: fanetittelen fra ordlista, og ingen synlig tekst skrevet rett inn", () => {
  const layout = withoutComments(read("(app)/annonsetekst/layout.tsx"));
  assert.match(layout, /title: t\(await requestLocale\(\), "title\.listingText"\)/);
  for (const rel of [...PAGES, ...COMPONENTS, ...ENTRIES]) {
    assert.deepEqual(literalTextsInFile(read(rel)), [], rel);
  }
});

test("sidene: kallene gaar via assignments.ts og assignmentRequest, ikke fetch direkte", () => {
  for (const rel of [...PAGES, ...COMPONENTS]) {
    assert.doesNotMatch(withoutComments(read(rel)), /\bfetch\(|API_BASE/, rel);
  }
  const picker = withoutComments(read("(app)/annonsetekst/page.tsx"));
  // Lista: samme kall som /ordrer, med «Vis flere».
  assert.match(picker, /listAssignments\(assignmentRequest\(getToken, onRetry\), \{ limit: ORDERS_PAGE_SIZE \}\)/);
  assert.match(picker, /listAssignments\(request, \{ limit: ORDERS_PAGE_SIZE, cursor \}\)/);
  assert.match(picker, /href=\{listingTextHref\(order\.id\)\}/);
  // Tekstsiden: ordren med useAssignment (T2: med kallet fra mock-modusen), og tilbake til Annonsetekst.
  const order = withoutComments(read("components/annonsetekst/ListingTextOrder.tsx"));
  assert.match(order, /const \{ load, reload, request \} = useAssignment\(assignmentId, undefined, deps\?\.request\);/);
  assert.match(order, /<LoadState load=\{load\} onRetry=\{\(\) => void reload\(\)\} back=\{BACK\} \/>/);
  assert.match(order, /title=\{t\(locale, "listingText\.page\.title"\)\}/);
  assert.match(order, /\{assignment\.address\}/);
});

// --- ny adresse --------------------------------------------------------------------

const summary = (id: string, address: string): AssignmentSummary => ({
  id,
  address,
  assignmentNo: null,
  createdAt: "2026-10-30T10:00:00+00:00",
  updatedAt: "2026-10-30T10:00:00+00:00",
  counts: { images: 0, results: 0, processing: 0, toReview: 0, needsAnswer: 0, approved: 0, notUsed: 0, failed: 0 },
  coverThumbUrl: null,
});

test("ny adresse: normaliseringen gir smaa bokstaver og fjerner ekstra mellomrom", () => {
  assert.equal(normalizeAddress("  Storgata   12,  0182 OSLO "), "storgata 12, 0182 oslo");
  assert.equal(normalizeAddress("Storgata\t12\n0182 Oslo"), "storgata 12 0182 oslo");
  assert.equal(normalizeAddress("ÆRFUGLVEIEN 3, TØNSBERG"), "ærfuglveien 3, tønsberg");
  assert.equal(normalizeAddress("   "), "");
});

test("ny adresse: like adresser foreslaas, i samme rekkefoelge; ulike og tom adresse gir ingen", () => {
  const orders = [
    summary("a", "Storgata 12, 0182 Oslo"),
    summary("b", "Storgata 14, 0182 Oslo"),
    summary("c", " storgata  12,  0182 OSLO"),
  ];
  assert.deepEqual(sameAddressOrders(orders, "STORGATA 12, 0182 oslo ").map((o) => o.id), ["a", "c"]);
  assert.deepEqual(sameAddressOrders(orders, "Storgata 1, 0182 Oslo"), []);
  // Uten mellomrom etter kommaet er det en annen adresse (ingen gjetting).
  assert.deepEqual(sameAddressOrders(orders, "Storgata 12,0182 Oslo"), []);
  assert.deepEqual(sameAddressOrders(orders, "  "), []);
  assert.equal(listingTextHref("a b/c"), "/annonsetekst/a%20b%2Fc");
});

test("ny adresse: de nyeste ordrene sjekkes foer en ny lages, med samme kall som «Ny ordre»", () => {
  assert.equal(SAME_ADDRESS_PAGES, 5);
  const src = withoutComments(read("(app)/annonsetekst/page.tsx"));
  assert.match(src, /for \(let page = 0; page < SAME_ADDRESS_PAGES; page\+\+\)/);
  assert.match(src, /const same = sameAddressOrders\(await recentOrders\(request\), check\.address\);/);
  assert.match(src, /if \(same\.length > 0\) \{\s*setMatches\(same\);/);
  assert.match(src, /createAssignment\(assignmentRequest\(getToken\), \{ address: newAddress, assignmentNo: null \}\)/);
  assert.match(src, /router\.push\(listingTextHref\(order\.id\)\);/);
  assert.match(src, /const check = checkNewOrder\(address, ""\);/);
  assert.match(src, /maxLength=\{ADDRESS_MAX\}/);
  // Dobbeltklikk gir ikke to ordrer, og en ny adresse fjerner forslagene.
  assert.equal(src.match(/if \(submitting\) return;/g)?.length, 2);
  assert.match(src, /setMatches\(null\);/);
  // «Lag ny ordre» og forslagene (lenker til tekstsiden).
  assert.match(src, /onClick=\{\(\) => void handleCreateAnyway\(\)\}/);
  assert.match(src, /\{matches\.map\(\(order\) => \(\s*<li key=\{order\.id\}>\s*<OrderRow order=\{order\} locale=\{locale\} \/>/);
});

// --- ordlista ----------------------------------------------------------------------

const NEW_KEYS = [
  "express.tool.annonsetekst.title",
  "express.tool.annonsetekst.desc",
  "express.card.annonsetekst.chip1",
  "express.card.annonsetekst.chip2",
  "express.card.annonsetekst.cta",
  "title.listingText",
  "listingText.page.title",
  "listingText.page.subtitle",
  "listingText.page.loading",
  "listingText.page.newAddress",
  "listingText.page.continue",
  "listingText.page.checking",
  "listingText.page.sameAddressOne",
  "listingText.page.sameAddressMany",
  "listingText.page.createAnyway",
  "listingText.page.ordersTitle",
  "listingText.page.empty",
  "listingText.page.back",
  "listingText.page.fromOrder",
] as const;

test("ordlista: de nye tekstene finnes paa nb og en, og copywriter-noeklene er borte", () => {
  for (const locale of ["nb", "en"] as const) {
    const ui = DICTIONARIES[locale].ui as Record<string, string>;
    for (const key of NEW_KEYS) assert.ok(typeof ui[key] === "string" && ui[key].trim().length > 0, `${locale} ${key}`);
    for (const key of Object.keys(ui)) assert.ok(!key.includes("copywriter"), `${locale} ${key}`);
  }
  const nb = DICTIONARIES.nb.ui;
  // Kortet har samme tekst som «Kommer»-kortet hadde, saa ingenting endres med flagget av.
  assert.equal(nb["express.tool.annonsetekst.title"], "Annonsetekst");
  assert.equal(nb["express.tool.annonsetekst.desc"], "Skriver et utkast til annonsetekst for boligen.");
  assert.equal(nb["listingText.page.newAddress"], "Ny adresse");
  assert.equal(t("nb", "listingText.page.sameAddressMany", { n: 2 }), "Du har 2 ordrer med samme adresse. Bruk en av dem, eller lag en ny.");
});
