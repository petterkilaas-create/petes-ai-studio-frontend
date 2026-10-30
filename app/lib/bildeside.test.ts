import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseResult, type AssignmentResult } from "./assignments.ts";
import type { ReviewOrder } from "./api";
import { FROM_PARAM, orderTabs, parseFrom, reviewHref } from "./orderTabs.ts";
import { resultOpenHref, reviewBackLink, showStartedBanner } from "./ordrer.ts";
import { DICTIONARIES } from "./i18n/index.ts";
import { literalTextsInFile, withoutComments } from "./testing/jsxText.ts";

/**
 * FE-3c (Dag 59): bildesiden. Resultatradene i hele kortets bredde, banneret
 * etter start (vises, ryddes fra adressen, skjules og lukkes), og veien
 * tilbake fra godkjenningssiden med `?fra=`. Reglene testes som rene
 * funksjoner; sidene leses som tekst (node --test laster ikke .tsx).
 */

const APP_DIR = fileURLToPath(new URL("..", import.meta.url));
const read = (rel: string) => readFileSync(join(APP_DIR, rel), "utf8");

const ORDER = "3f2a9c1e-7b4d-4e8a-9c0f-1a2b3c4d5e6f";

function result(extra: Record<string, unknown> = {}): AssignmentResult {
  const r = parseResult({
    result_id: "r1",
    service: "scene_transform",
    preset_id: "skumring",
    order_service: "skumring",
    option: null,
    service_label: "Kveldsbilde",
    status: "awaiting_approval",
    display_status: "to_review",
    version: 1,
    ...extra,
  });
  assert.ok(r);
  return r;
}

// --- fra ------------------------------------------------------------------------------

test("fra: bare en uuid godtas (smaa bokstaver), alt annet gir null", () => {
  assert.equal(FROM_PARAM, "fra");
  assert.equal(parseFrom(ORDER), ORDER);
  assert.equal(parseFrom(ORDER.toUpperCase()), ORDER);
  assert.equal(parseFrom([ORDER, "x"]), ORDER);
  for (const bad of [
    undefined,
    null,
    "",
    "abc",
    "123",
    `${ORDER}x`,
    ` ${ORDER}`,
    `${ORDER}/../../history`,
    "../../admin",
    "https://evil.example/ordrer",
    "//evil.example",
    "javascript:alert(1)",
    "3f2a9c1e7b4d4e8a9c0f1a2b3c4d5e6f",
  ]) {
    assert.equal(parseFrom(bad), null, String(bad));
  }
  assert.equal(parseFrom(["nei", ORDER]), null);
});

test("fra: lenken til godkjenningssiden har ordren med, og uten gyldig ordre som foer", () => {
  assert.equal(reviewHref("j1"), "/godkjenning/j1");
  assert.equal(reviewHref("j1", ORDER), `/godkjenning/j1?fra=${ORDER}`);
  assert.equal(reviewHref("j1", "https://evil.example"), "/godkjenning/j1");
});

test("FE-4: «Åpne» gaar til ordresiden med bildet og resultatet, for alt som ble startet", () => {
  const href = `/ordrer/${ORDER}?bilde=img_1&resultat=r1`;
  assert.equal(resultOpenHref(ORDER, "img_1", result()), href);
  for (const s of ["needs_answer", "approved", "processing", "not_used", "failed"]) {
    assert.equal(resultOpenHref(ORDER, "img_1", result({ display_status: s })), href, s);
  }
  assert.equal(resultOpenHref(ORDER, "img_1", result({ display_status: "not_started" })), null);
});

test("fra: tilbake-lenken bygges i koden: «Til ordren» til ordresiden (FE-4), ellers Historikk", () => {
  assert.deepEqual(reviewBackLink(ORDER), { href: `/ordrer/${ORDER}`, key: "review.backToOrder" });
  assert.deepEqual(reviewBackLink(null), { href: "/history", key: "review.back" });
  for (const bad of ["https://evil.example", "//evil.example", "../../x", ""]) {
    assert.deepEqual(reviewBackLink(bad), { href: "/history", key: "review.back" }, bad);
  }
});

test("fra: fanene paa godkjenningssiden tar ordren med, saa lenken staar etter bytte", () => {
  const order: ReviewOrder = {
    orderId: "ord_x",
    jobs: [
      { jobId: "a", presetId: "styling_japandi", status: "awaiting_approval", thumbUrl: null, code: null },
      { jobId: "b", presetId: "styling_funkis", status: "succeeded", thumbUrl: null, code: null },
    ],
  };
  assert.deepEqual(
    orderTabs(order, "a", "nb", ORDER)?.map((tab) => tab.href),
    [`/godkjenning/a?fra=${ORDER}`, `/godkjenning/b?fra=${ORDER}`]
  );
  assert.deepEqual(orderTabs(order, "a", "nb")?.map((tab) => tab.href), ["/godkjenning/a", "/godkjenning/b"]);
});

test("fra: siden leser ?fra= med parseFrom, og ResultReview har ingen fast lenke til /history", () => {
  const page = withoutComments(read("(app)/godkjenning/[jobId]/page.tsx"));
  assert.match(page, /const from = parseFrom\(use\(searchParams\)\[FROM_PARAM\]\);/);
  assert.match(page, /<ResultReview key=\{jobId\} jobId=\{jobId\} from=\{from\} \/>/);
  const review = withoutComments(read("components/godkjenning/ResultReview.tsx"));
  assert.match(review, /const back = reviewBackLink\(from\);/);
  assert.match(review, /href=\{back\.href\}/);
  assert.match(review, /← \{t\(locale, back\.key\)\}/);
  assert.match(review, /orderTabs\(review\.order, jobId, locale, from\)/);
  assert.doesNotMatch(review, /href="\/history"/);
  // «Åpne» paa bildesiden har ordren med.
  const list = withoutComments(read("components/ordre/ResultList.tsx"));
  assert.match(list, /resultOpenHref\(assignmentId, imageId, result\)/);
  assert.match(withoutComments(read("components/ordre/ImageCard.tsx")), /assignmentId=\{assignmentId\}/);
  assert.match(withoutComments(read("components/ordre/OrderImages.tsx")), /assignmentId=\{assignmentId\}/);
});

// --- banneret ---------------------------------------------------------------------------

test("banneret: vises rett etter start mens noe behandles, ellers ikke", () => {
  assert.equal(showStartedBanner(3, false, true), true);
  assert.equal(showStartedBanner(1, false, true), true);
  // Ingenting behandles lenger (alt er til godkjenning eller ferdig).
  assert.equal(showStartedBanner(3, false, false), false);
  // Lukket med ×.
  assert.equal(showStartedBanner(3, true, true), false);
  // Uten ?startet= (ny lasting) eller med 0.
  assert.equal(showStartedBanner(null, false, true), false);
  assert.equal(showStartedBanner(0, false, true), false);
});

test("banneret: tallet holdes i tilstanden, startet tas ut av adressen, og × lukker", () => {
  const src = withoutComments(read("components/ordre/OrderImages.tsx"));
  assert.match(src, /const \[startedCount\] = useState\(started\);/);
  assert.match(src, /if \(started !== null\) router\.replace\(orderImagesHref\(assignmentId\), \{ scroll: false \}\);/);
  assert.match(src, /showStartedBanner\(startedCount, bannerClosed, processing\) && \(/);
  assert.match(src, /setBannerClosed\(true\);/);
  assert.match(src, /aria-label=\{t\(locale, "orders\.startedClose"\)\}/);
  assert.match(src, /className=\{`inline-flex size-11 shrink-0 /);
  // Den gamle visningen rett fra adressen er borte.
  assert.doesNotMatch(src, /started !== null && started > 0 &&/);
});

// --- resultatradene og kortene ------------------------------------------------------

test("resultatradene: navnet paa egen linje, saa status, versjon og «Åpne» i én rad som brytes", () => {
  const list = withoutComments(read("components/ordre/ResultList.tsx"));
  assert.match(list, /<p className="break-words text-ink">\{label\}<\/p>/);
  assert.match(list, /<div className="flex flex-wrap items-center gap-x-3 gap-y-2">/);
  assert.doesNotMatch(list, /flex-1/);
  for (const rel of ["components/ordre/ResultList.tsx", "components/ordre/ImageCard.tsx"]) {
    const src = withoutComments(read(rel));
    // Ingen negative marger eller absolutt plassering rundt resultatene (menyen «⋯» er absolutt, men ikke her).
    assert.doesNotMatch(src.slice(src.indexOf("<ResultList")), /\babsolute\b|\s-m[trblxy]?-/, rel);
  }
});

test("kortene: resultatene i hele kortets bredde, og to kort i bredden fra 1024 px", () => {
  const card = withoutComments(read("components/ordre/ImageCard.tsx"));
  assert.match(card, /`relative flex min-w-0 flex-col gap-3 p-3 /);
  assert.match(card, /<\/div>\n {6}<\/div>\n\n {6}<ResultList results=\{image\.results\} number=\{number\} assignmentId=\{assignmentId\} imageId=\{image\.id\} \/>\n {4}<\/li>/);
  const page = withoutComments(read("components/ordre/OrderImages.tsx"));
  assert.match(page, /<ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">/);
  assert.doesNotMatch(page, /xl:grid-cols-3/);
});

// --- ordlista og tekst ----------------------------------------------------------------------

test("ordlista: «Til ordren» og lukk-knappen paa banneret finnes paa nb og en", () => {
  assert.equal(DICTIONARIES.nb.ui["review.backToOrder"], "Til ordren");
  assert.equal(DICTIONARIES.en.ui["review.backToOrder"], "Back to the order");
  assert.equal(DICTIONARIES.nb.ui["orders.startedClose"], "Lukk meldingen");
  assert.equal(DICTIONARIES.en.ui["orders.startedClose"], "Close the message");
});

test("ingen synlig tekst skrevet rett inn i filene FE-3c endrer", () => {
  for (const rel of [
    "(app)/godkjenning/[jobId]/page.tsx",
    "components/ordre/ResultList.tsx",
    "components/ordre/ImageCard.tsx",
    "components/ordre/OrderImages.tsx",
  ]) {
    assert.deepEqual(literalTextsInFile(read(rel)), [], rel);
  }
});
