import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { JobSummary } from "./api";
import {
  groupHistory,
  orderDate,
  orderLines,
  orderNote,
  orderOpen,
  orderOwner,
  orderTiles,
  orderTitle,
  tileView,
  type HistoryEntry,
} from "./historyGroups.ts";
import { formatDate } from "./dates.ts";
import { startEntries } from "./start.ts";
import { literalTextsInFile } from "./testing/jsxText.ts";
import { withoutComments } from "./testing/jsxText.ts";

// TG-NEW-262: Historikken per bestilling. Lista er nyeste foerst, og
// grupperingen gjelder det som er lastet (ogsaa over flere sider).

const APP_DIR = fileURLToPath(new URL("..", import.meta.url));
const read = (rel: string) => withoutComments(readFileSync(join(APP_DIR, rel), "utf8"));

function job(jobId: string, orderId: string | null, createdAt = "2026-10-26T08:00:00Z"): JobSummary {
  return {
    jobId,
    service: "scene_transform",
    status: "awaiting_approval",
    createdAt,
    thumbUrl: null,
    originalThumbUrl: null,
    error: null,
    code: null,
    reason: null,
    isOwner: true,
    ownerShort: null,
    presetId: "styling_japandi",
    orderId,
  };
}

/** Oppfoeringene som korte strenger: «x» for en jobb, «[ord: a,b]» for en bestilling. */
const shape = (entries: HistoryEntry[]) =>
  entries.map((e) => (e.kind === "job" ? e.job.jobId : `[${e.orderId}: ${e.jobs.map((j) => j.jobId).join(",")}]`));

test("TG-NEW-262: jobber uten order_id vises som i dag", () => {
  const jobs = [job("a", null), job("b", null)];
  assert.deepEqual(shape(groupHistory(jobs)), ["a", "b"]);
  assert.deepEqual(groupHistory([]), []);
});

test("TG-NEW-262: en bestilling blir én gruppe der den nyeste jobben står, eldst først inni", () => {
  // Nyeste foerst: c3, c2, c1 er bestillingen (stilrekkefoelgen c1, c2, c3).
  const jobs = [job("x", null), job("c3", "ord_c"), job("c2", "ord_c"), job("c1", "ord_c"), job("y", null)];
  assert.deepEqual(shape(groupHistory(jobs)), ["x", "[ord_c: c1,c2,c3]", "y"]);
});

test("TG-NEW-262: to bestillinger og enkeltjobber blandet", () => {
  const jobs = [
    job("b2", "ord_b"),
    job("s1", null),
    job("b1", "ord_b"),
    job("a2", "ord_a"),
    job("a1", "ord_a"),
    job("s2", null),
  ];
  assert.deepEqual(shape(groupHistory(jobs)), ["[ord_b: b1,b2]", "s1", "[ord_a: a1,a2]", "s2"]);
});

test("TG-NEW-262: én lastet jobb i en bestilling er ikke en gruppe", () => {
  assert.deepEqual(shape(groupHistory([job("a", null), job("o1", "ord_o")])), ["a", "o1"]);
});

test("TG-NEW-262: kommer resten av bestillingen på neste side, havner den i samme gruppe", () => {
  // Side 1 slutter midt i bestillingen ord_p (tre stiler).
  const page1 = [job("x", null), job("p3", "ord_p")];
  assert.deepEqual(shape(groupHistory(page1)), ["x", "p3"]);
  // «Last inn flere» legger side 2 bak (som loadMore): gruppa samles der p3 sto.
  const page2 = [job("p2", "ord_p"), job("p1", "ord_p"), job("y", null)];
  assert.deepEqual(shape(groupHistory([...page1, ...page2])), ["x", "[ord_p: p1,p2,p3]", "y"]);
  // To av tre paa side 1: gruppe med to, og den tredje legges til.
  const a = [job("q3", "ord_q"), job("q2", "ord_q")];
  assert.deepEqual(shape(groupHistory(a)), ["[ord_q: q2,q3]"]);
  assert.deepEqual(shape(groupHistory([...a, job("q1", "ord_q"), job("z", null)])), ["[ord_q: q1,q2,q3]", "z"]);
});

test("dag 55: tittelen er tjenesten og antall stiler, datoen fra den eldste jobben, uten rom", () => {
  const jobs = [job("c1", "ord_c", "2026-10-26T08:00:00Z"), job("c2", "ord_c", "2026-10-26T08:00:01Z"), job("c3", "ord_c")];
  assert.equal(orderTitle("nb", jobs), "Digital styling · 3 stiler");
  assert.equal(orderTitle("en", jobs), "Virtual staging · 3 styles");
  assert.equal(orderTitle("nb", jobs.slice(0, 2)), "Digital styling · 2 stiler");
  assert.equal(orderTitle("en", jobs.slice(0, 2)), "Virtual staging · 2 styles");
  // Dato og klokkeslett som paa JobCard (formatDate), fra den eldste (foerste) jobben.
  assert.equal(orderDate("nb", jobs), formatDate("2026-10-26T08:00:00Z", "nb"));
  assert.match(orderDate("nb", jobs), /^26\. okt\. 2026, \d\d:00$/);
  assert.equal(orderDate("nb", [job("a", "o", "ikke en dato"), job("b", "o")]), "—");
});

/** Bestillingen fra live-sjekken 26.10: Funkis avvist av megleren, Kyst og sommerhus venter. */
function liveOrder(): JobSummary[] {
  return [
    {
      ...job("funkis", "ord_live", "2026-10-26T08:00:00Z"),
      presetId: "styling_funkis",
      status: "failed",
      code: "rejected_by_reviewer",
      reason: "For mørkt",
      error: "{\"raw\": \"teknisk\"}",
    },
    { ...job("kyst", "ord_live", "2026-10-26T08:00:01Z"), presetId: "styling_nordisk_kyst" },
  ];
}

test("dag 55: knappen åpner jobben som venter, ellers den første", () => {
  // Avvist + venter: den som venter, «Åpne godkjenning».
  assert.deepEqual(orderOpen(liveOrder()), { jobId: "kyst", labelKey: "history.openReview" });
  // To som venter: den foerste i stilrekkefoelgen; needs_review venter ogsaa.
  const two = [job("a", "o"), { ...job("b", "o"), status: "needs_review" as const }];
  assert.deepEqual(orderOpen(two), { jobId: "a", labelKey: "history.openReview" });
  assert.deepEqual(orderOpen([{ ...job("a", "o"), status: "succeeded" }, two[1]]), {
    jobId: "b",
    labelKey: "history.openReview",
  });
  // Ingen venter: den foerste jobben, «Åpne».
  const done = [
    { ...job("a", "o"), status: "succeeded" as const },
    { ...job("b", "o"), status: "failed" as const, code: "rejected_by_reviewer" },
  ];
  assert.deepEqual(orderOpen(done), { jobId: "a", labelKey: "history.open" });
  assert.equal(orderOpen([]), null);
});

test("dag 55: én linje per stil med stilnavnet og merket som på JobCard", () => {
  const lines = orderLines("nb", liveOrder());
  assert.deepEqual(lines.map((l) => l.label), ["Funkis", "Kyst og sommerhus"]);
  assert.deepEqual(lines.map((l) => l.job.jobId), ["funkis", "kyst"]);
  // Avvist av megleren: «Avvist av deg» i stedet for statusen; den andre viser statusen (rejectedKey null).
  assert.deepEqual(lines.map((l) => l.rejectedKey), ["history.rejectedByYou", null]);
  // Admin ser en annen brukers bestilling: «Avvist av eieren».
  const others = liveOrder().map((j) => ({ ...j, isOwner: false }));
  assert.equal(orderLines("nb", others)[0].rejectedKey, "history.rejectedByOwner");
  // Ukjent stil heter «Digital styling».
  assert.equal(orderLines("nb", [{ ...job("x", "o"), presetId: "styling_ukjent" }])[0].label, "Digital styling");
  assert.equal(orderLines("en", liveOrder())[1].label, "Coast and summer house");
});

test("dag 55: avvist viser begrunnelsen, feilet den korte meldingen, aldri rå error", () => {
  const [funkis, kyst] = orderLines("nb", liveOrder());
  assert.equal(funkis.reason, "For mørkt");
  assert.equal(funkis.message, null);
  assert.equal(kyst.reason, null);
  assert.equal(kyst.message, null);
  // Avvist uten begrunnelse: ingen tekst under linja.
  const noReason = orderLines("nb", [{ ...liveOrder()[0], reason: null }])[0];
  assert.equal(noReason.reason, null);
  assert.equal(noReason.message, null);
  // Feilet: den korte meldingen (jobMessage), ikke error-teksten.
  const failed = orderLines("nb", [{ ...job("f", "o"), status: "failed", error: "fal 500 https://x" }])[0];
  assert.deepEqual(failed.message, { key: "job.failed" });
  assert.equal(failed.reason, null);
  assert.equal(failed.rejectedKey, null);
  // Tekstene som vises (navnet, begrunnelsen, meldingen) har aldri error-teksten; kortet leser ikke .error.
  for (const l of [...orderLines("nb", liveOrder()), failed]) {
    assert.ok(!JSON.stringify([l.label, l.reason, l.message]).match(/teknisk|fal 500/));
  }
});

test("dag 55: «Annen bruker» og merknaden om slettede bilder én gang per kort", () => {
  assert.equal(orderOwner(liveOrder()), null);
  const others = liveOrder().map((j) => ({ ...j, isOwner: false, ownerShort: "abc123" }));
  assert.deepEqual(orderOwner(others), { ownerShort: "abc123" });
  // Merknaden naar den gjelder minst én jobb (miniatyren finnes, full stoerrelse slettet).
  const jobs = liveOrder();
  assert.equal(orderNote(jobs, [null, "t2"]), null);
  const deleted = [jobs[0], { ...jobs[1], mediaDeletedAt: "2026-10-27T00:00:00Z" }];
  assert.equal(orderNote(deleted, [null, "t2"]), "media.fullSizeDeleted");
  assert.equal(orderNote(deleted, [null, null]), null);
  // Komponenten viser dem én gang, utenfor linjene per stil.
  const card = read("components/OrderCard.tsx");
  assert.equal(card.match(/t\(locale, "history\.notYours"\)/g)?.length, 1);
  assert.equal(card.match(/t\(locale, note\)/g)?.length, 1);
  const list = card.slice(card.indexOf("<ul"), card.indexOf("</ul>"));
  assert.doesNotMatch(list, /history\.notYours|note/);
});

test("dag 55: rutene i bildet er stilene uten tekst over, høyst tre", () => {
  assert.deepEqual(orderTiles([1, 2]), [1, 2]);
  assert.deepEqual(orderTiles([1, 2, 3, 4]), [1, 2, 3]);
  assert.deepEqual(tileView({ kind: "result", url: "u" }), { kind: "result", url: "u" });
  assert.deepEqual(tileView({ kind: "original", url: "o", overlay: { key: "media.fireplaceQuestion", working: false } }), {
    kind: "original",
    url: "o",
    overlay: null,
  });
  assert.deepEqual(tileView({ kind: "placeholder", overlay: { key: "media.fireplaceQuestion", working: true } }), {
    kind: "placeholder",
    overlay: null,
  });
  assert.deepEqual(tileView({ kind: "deleted", overlay: null }), { kind: "placeholder", overlay: null });
});

test("dag 55: OrderCard har ingen tekst skrevet rett inn, og bildet kommer fra siden", () => {
  const src = readFileSync(join(APP_DIR, "components/OrderCard.tsx"), "utf8");
  assert.deepEqual(literalTextsInFile(src), []);
  const card = read("components/OrderCard.tsx");
  assert.doesNotMatch(card, /thumbSrc|\.thumbUrl|\.originalThumbUrl|\.error\b|<img/);
  assert.match(card, /view=\{tileView\(mediaView\(line\.job, thumbs\[i\] \?\? null\)\)\}/);
  // P3b: koden gir «Ikke laget» for en jobb vi ikke laget.
  assert.match(
    card,
    /<StatusPill\s+status=\{line\.job\.status\}\s+service=\{line\.job\.service\}\s+code=\{line\.job\.code\}\s+rejectedKey=\{line\.rejectedKey\}\s*\/>/
  );
  assert.match(card, /<OpenReviewLink jobId=\{open\.jobId\} labelKey=\{open\.labelKey\} \/>/);
  // Samme bredde som JobCard: ingen col-span, og bildeflaten 3:2 med en tynn skillelinje.
  assert.doesNotMatch(card, /col-span/);
  assert.match(card, /grid aspect-\[3\/2\] gap-px bg-line/);
});

test("dag 55: Historikken viser en bestilling som ett OrderCard i det vanlige rutenettet", () => {
  const page = read("(app)/history/page.tsx");
  assert.match(page, /\{groupHistory\(jobs\)\.map\(\(entry\) =>/);
  assert.match(page, /<JobCard key=\{entry\.job\.jobId\} job=\{entry\.job\} thumb=\{thumbSrc\(entry\.job\)\} \/>/);
  assert.match(
    page,
    /<OrderCard key=\{`order-\$\{entry\.orderId\}`\} jobs=\{entry\.jobs\} thumbs=\{entry\.jobs\.map\(\(job\) => thumbSrc\(job\)\)\} \/>/
  );
  // Ingen egen overskrift eller seksjon over gruppa.
  assert.doesNotMatch(page, /col-span-full|orderHeading|<h2/);
  // loadMore legger sidene sammen i `jobs` som foer (dedup paa jobId); ingen egen tilstand for gruppene.
  assert.match(page, /return \[\.\.\.prev, \.\.\.fresh\];/);
  assert.doesNotMatch(page, /useState<HistoryEntry/);
});

test("dag 55: /start bruker OrderCard for en bestilling i begge delene, og kaller thumbSrc(job)", () => {
  const page = read("(app)/start/page.tsx");
  assert.match(page, /const entries = view\.kind === "active" \? startEntries\(view\.waiting, view\.recent\) : null;/);
  assert.match(page, /\{entries\.waiting\.map\(entryCard\)\}/);
  assert.match(page, /\{entries\.recent\.map\(entryCard\)\}/);
  assert.match(page, /<JobCard key=\{entry\.job\.jobId\} job=\{entry\.job\} thumb=\{thumbSrc\(entry\.job\)\} \/>/);
  assert.match(
    page,
    /<OrderCard key=\{`order-\$\{entry\.orderId\}`\} jobs=\{entry\.jobs\} thumbs=\{entry\.jobs\.map\(\(job\) => thumbSrc\(job\)\)\} \/>/
  );
  assert.doesNotMatch(page, /view\.(waiting|recent)\.map/);
});

test("dag 55: på /start står en bestilling med en jobb som venter, samlet under «Venter på deg»", () => {
  // Som startView gir det: kyst venter; funkis (avvist) er under siste jobber.
  const [funkis, kyst] = liveOrder();
  const entries = startEntries([kyst], [job("s1", null, "2026-10-26T09:00:00Z"), funkis, job("s0", null, "2026-10-25T08:00:00Z")]);
  assert.deepEqual(shape(entries.waiting), ["[ord_live: funkis,kyst]"]);
  assert.deepEqual(shape(entries.recent), ["s1", "s0"]);
  // Uten bestilling som venter: «Siste jobber» grupperes som i Historikken.
  const plain = startEntries([], [kyst, funkis, job("s0", null)]);
  assert.deepEqual(shape(plain.waiting), []);
  assert.deepEqual(shape(plain.recent), ["[ord_live: funkis,kyst]", "s0"]);
  // Jobbene er de samme; bare kortene endres.
  const all = (e: HistoryEntry[]) => e.flatMap((x) => (x.kind === "job" ? [x.job.jobId] : x.jobs.map((j) => j.jobId)));
  assert.deepEqual([...all(entries.waiting), ...all(entries.recent)].sort(), ["funkis", "kyst", "s0", "s1"]);
  // To jobber i samme bestilling venter: ett kort, eldst foerst.
  const both = startEntries([{ ...kyst }, { ...funkis, status: "awaiting_approval", code: null }], []);
  assert.deepEqual(shape(both.waiting), ["[ord_live: funkis,kyst]"]);
});
