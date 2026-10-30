import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ReviewOrder, ReviewOrderJob } from "./api";
import { t } from "./i18n/index.ts";
import {
  FRAMING_WARN_PCT,
  formatPct,
  framingText,
  framingWarning,
  orderStatusKey,
  orderTabs,
  reviewHref,
} from "./orderTabs.ts";
import { literalTexts, withoutComments } from "./testing/jsxText.ts";

// D-5c (Petter 25.10, TG-NEW-249 og TG-NEW-260): fanene per bestilling og
// rammevarselet. Reglene testes her; komponentene leses som tekst, fordi
// node --test ikke kan laste .tsx (som i d5a.test.ts).

const APP_DIR = fileURLToPath(new URL("..", import.meta.url));
const code = (rel: string) => withoutComments(readFileSync(join(APP_DIR, rel), "utf8"));

const page = code("components/godkjenning/ResultReview.tsx");
const card = code("components/godkjenning/DecisionCard.tsx");
const tabsSrc = code("components/godkjenning/OrderTabs.tsx");

const job = (jobId: string, extra: Partial<ReviewOrderJob> = {}): ReviewOrderJob => ({
  jobId,
  presetId: "styling_moderne_nordisk",
  status: "awaiting_approval",
  thumbUrl: null,
  code: null,
  ...extra,
});
const order = (...jobs: ReviewOrderJob[]): ReviewOrder => ({ orderId: "ord_x", jobs });

test("D-5c: fanene vises bare med minst to jobber i bestillingen", () => {
  assert.equal(orderTabs(null, "a", "nb"), null);
  assert.equal(orderTabs(order(), "a", "nb"), null);
  assert.equal(orderTabs(order(job("a")), "a", "nb"), null);
  assert.equal(orderTabs(order(job("a"), job("b")), "a", "nb")?.length, 2);
  assert.equal(orderTabs(order(job("a"), job("b"), job("c")), "c", "nb")?.length, 3);
});

test("D-5c: én fane per jobb i rekkefoelgen fra backend, med lenke, navn, miniatyr og den du er paa", () => {
  const tabs = orderTabs(
    order(
      job("a", { presetId: "styling_japandi", status: "succeeded", thumbUrl: "https://x/a_thumb.jpg" }),
      job("b", { presetId: "styling_moderne_nordisk" }),
      job("c", { presetId: "styling_funkis", status: "running" })
    ),
    "b",
    "nb"
  );
  assert.deepEqual(tabs, [
    {
      jobId: "a",
      href: "/godkjenning/a",
      label: "Japandi",
      statusKey: "status.approved",
      thumbUrl: "https://x/a_thumb.jpg",
      current: false,
    },
    {
      jobId: "b",
      href: "/godkjenning/b",
      label: "Moderne nordisk",
      statusKey: "status.awaitingApproval",
      thumbUrl: null,
      current: true,
    },
    {
      jobId: "c",
      href: "/godkjenning/c",
      label: t("nb", "styling.style.funkis"),
      statusKey: "status.running",
      thumbUrl: null,
      current: false,
    },
  ]);
  // Bare én fane er markert, og ingen naar jobben ikke er med.
  assert.equal(tabs?.filter((tab) => tab.current).length, 1);
  assert.ok(orderTabs(order(job("a"), job("b")), "z", "nb")?.every((tab) => !tab.current));
});

test("D-5c: lenken koder job-id-en, og en ukjent stil heter «Digital styling»", () => {
  assert.equal(reviewHref("a/b?c"), "/godkjenning/a%2Fb%3Fc");
  const tabs = orderTabs(order(job("a", { presetId: null }), job("b", { presetId: "skumring" })), "a", "nb");
  assert.deepEqual(tabs?.map((tab) => tab.label), ["Digital styling", "Digital styling"]);
  assert.equal(orderTabs(order(job("a", { presetId: null }), job("b")), "a", "en")?.[0].label, "Virtual staging");
  assert.equal(orderTabs(order(job("a", { presetId: "styling_japandi" }), job("b")), "a", "en")?.[0].label, "Japandi");
});

test("D-5c og TG-NEW-262: statusen paa fanen kommer fra status, og «Avvist» fra koden", () => {
  const cases: [string, string, string][] = [
    ["queued", "Lages", "In progress"],
    ["running", "Lages", "In progress"],
    ["awaiting_approval", "Til godkjenning", "Awaiting approval"],
    ["needs_review", "Til godkjenning", "Awaiting approval"],
    ["succeeded", "Godkjent", "Approved"],
    ["rejected", "Avvist", "Rejected"],
    // `failed` uten koden er fortsatt «Feilet» (TG-NEW-262).
    ["failed", "Feilet", "Failed"],
    ["cancelled", "Ukjent status", "Unknown status"],
    ["unknown", "Ukjent status", "Unknown status"],
  ];
  for (const [status, nb, en] of cases) {
    assert.equal(t("nb", orderStatusKey(status)), nb, status);
    assert.equal(t("en", orderStatusKey(status)), en, status);
  }
  // Avvist av megleren: `failed` med rejected_by_reviewer (isRejectedByReviewer, som Historikken).
  assert.equal(t("nb", orderStatusKey("failed", "rejected_by_reviewer")), "Avvist");
  assert.equal(t("en", orderStatusKey("failed", "rejected_by_reviewer")), "Rejected");
  // Andre koder, og koden uten `failed`, endrer ingenting.
  assert.equal(t("nb", orderStatusKey("failed", "provider_error")), "Feilet");
  assert.equal(t("nb", orderStatusKey("failed", null)), "Feilet");
  assert.equal(t("nb", orderStatusKey("succeeded", "rejected_by_reviewer")), "Godkjent");
});

test("TG-NEW-262: fanen til en avvist jobb viser «Avvist»", () => {
  const order: ReviewOrder = {
    orderId: "ord_r",
    jobs: [
      job("a", { status: "failed", code: "rejected_by_reviewer" }),
      job("b", { status: "failed" }),
      job("c"),
    ],
  };
  const tabs = orderTabs(order, "c", "nb");
  assert.deepEqual(tabs?.map((tab) => t("nb", tab.statusKey)), ["Avvist", "Feilet", "Til godkjenning"]);
  assert.deepEqual(orderTabs(order, "c", "en")?.map((tab) => t("en", tab.statusKey)), ["Rejected", "Failed", "Awaiting approval"]);
});

test("D-5c: rammevarselet bare naar det er maalt og over grensen", () => {
  assert.equal(FRAMING_WARN_PCT, 5);
  assert.equal(framingWarning({ outsidePct: 8.3, measured: true }), 8.3);
  assert.equal(framingWarning({ outsidePct: 5.1, measured: true }), 5.1);
  assert.equal(framingWarning({ outsidePct: 41, measured: true }), 41);
  // Paa grensen og under: ingenting (live i dag: 1,8 % og 4,3 %).
  for (const pct of [5, 4.3, 1.8, 0]) {
    assert.equal(framingWarning({ outsidePct: pct, measured: true }), null, String(pct));
  }
  // Umaalt (kveldsbilder, inliers, time_left, eldre backend).
  assert.equal(framingWarning({ outsidePct: null, measured: false }), null);
  assert.equal(framingWarning({ outsidePct: 8.3, measured: false }), null);
  assert.equal(framingWarning({ outsidePct: null, measured: true }), null);
});

test("D-5c: teksten i rammevarselet paa nb og en, med tallet paa brukerens spraak", () => {
  assert.equal(formatPct("nb", 8.3), "8,3");
  assert.equal(formatPct("en", 8.3), "8.3");
  assert.equal(formatPct("nb", 22), "22");
  assert.equal(
    framingText("nb", 8.3),
    "Bildet kan vise mer av rommet enn originalen: ca. 8,3 % av bildet ligger utenfor originalfotoet. Sammenlign utsnittet før du godkjenner."
  );
  assert.equal(
    framingText("en", 8.3),
    "The image may show more of the room than the original: about 8.3% of the image lies outside the original photo. Compare the framing before you approve."
  );
  assert.equal(t("nb", "review.orderTabs.label"), "Stilene i bestillingen");
  assert.equal(t("en", "review.orderTabs.label"), "Styles in this order");
});

test("D-5c: fanene er lenker i en nav, den du er paa har aria-current, og raden kan sveipes", () => {
  assert.match(tabsSrc, /<nav aria-label=\{t\(locale, "review\.orderTabs\.label"\)\}>/);
  assert.match(tabsSrc, /<Link\s+href=\{tab\.href\}\s+aria-current=\{tab\.current \? "page" : undefined\}/);
  assert.match(tabsSrc, /<ul className="flex gap-3 overflow-x-auto snap-x snap-mandatory /);
  assert.match(tabsSrc, /<li key=\{tab\.jobId\} className="snap-start shrink-0">/);
  assert.match(tabsSrc, /min-h-11/);
  // Miniatyren eller plassholderen; navnet staar ved siden av, saa bildet har tom alt.
  assert.match(tabsSrc, /tab\.thumbUrl !== null \?[\s\S]*?<img src=\{tab\.thumbUrl\} alt="" loading="lazy"[\s\S]*?<ImageIcon aria-hidden="true"/);
  assert.match(tabsSrc, /\{tab\.label\}/);
  assert.match(tabsSrc, /\{t\(locale, tab\.statusKey\)\}/);
  assert.deepEqual(literalTexts(tabsSrc), []);
});

test("D-5c: siden viser fanene over bildet og gir kortet rammen", () => {
  // FE-3c: `from` foelger med fanene, saa «← Til ordren» staar etter bytte.
  assert.match(page, /const tabs = orderTabs\(review\.order, jobId, locale, from\);/);
  const tabsAt = page.indexOf("{tabs !== null && <OrderTabs tabs={tabs} locale={locale} />}");
  assert.ok(tabsAt > 0);
  assert.ok(tabsAt > page.indexOf("{deleted && ("), "under bannerne");
  assert.ok(tabsAt < page.indexOf('<div className="grid grid-cols-1 lg:grid-cols-'), "over bildet");
  assert.match(page, /framingPct=\{framingWarning\(review\.framing\)\}/);
  // Ingen egen state for fanene: siden monteres paa nytt ved bytte (lenker), og krysset nullstilles som foer.
  assert.doesNotMatch(page, /useRouter|router\.push/);
});

test("D-5c: rammevarselet staar over sjekklista i stilen til merknaden (gult, AVVIK 2)", () => {
  const block = card.slice(card.indexOf("{controls.approve && ("), card.indexOf("{controls.none ?"));
  const framingAt = block.indexOf("{framingPct !== null && (");
  assert.ok(framingAt > block.indexOf('view.notice === "unchecked"'), "etter kontrollen");
  assert.ok(framingAt < block.indexOf("{checklist !== null && ("), "over sjekklista");
  assert.match(
    block,
    /\{framingPct !== null && \(\s*<p className="text-sm text-amber-fg bg-amber-bg rounded-button p-3 break-words" role="status">\s*\{framingText\(locale, framingPct\)\}/
  );
  // Advarselen fra kontrollen er fortsatt roed; rammevarselet endrer ikke «Godkjenn».
  assert.match(block, /text-red-fg bg-red-bg rounded-button p-3 break-words" role="alert"/);
  assert.match(card, /disabled=\{locked \|\| approveLock \|\| !approveEnabled\(additions\.level, compared, acknowledged\)\}/);
});

test("D-5c: tom alt er ikke tekst i literalTexts, men alt med tekst er det fortsatt", () => {
  assert.deepEqual(literalTexts('<img alt="" />'), []);
  assert.deepEqual(literalTexts('<img alt="miniatyr" />'), ["miniatyr"]);
});
