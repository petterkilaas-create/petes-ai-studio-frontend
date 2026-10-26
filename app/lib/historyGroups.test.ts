import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { JobSummary } from "./api";
import { groupHistory, orderHeading, type HistoryEntry } from "./historyGroups.ts";
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

test("TG-NEW-262: overskriften er tjenesten, antall stiler og datoen, uten rom", () => {
  const jobs = [job("c1", "ord_c", "2026-10-26T08:00:00Z"), job("c2", "ord_c", "2026-10-26T08:00:01Z"), job("c3", "ord_c")];
  assert.equal(orderHeading("nb", jobs), "Digital styling · 3 stiler · 26. okt. 2026");
  assert.equal(orderHeading("en", jobs), "Virtual staging · 3 styles · 26 Oct 2026");
  assert.equal(orderHeading("nb", jobs.slice(0, 2)), "Digital styling · 2 stiler · 26. okt. 2026");
  assert.equal(orderHeading("nb", [job("a", "o", "ikke en dato"), job("b", "o")]), "Digital styling · 2 stiler · —");
});

test("TG-NEW-262: Historikken grupperer alt som er lastet, og kortene er de samme", () => {
  const page = read("(app)/history/page.tsx");
  assert.match(page, /\{groupHistory\(jobs\)\.map\(\(entry\) =>/);
  assert.match(page, /<h2 className="mb-3 text-sm font-medium text-ink">\{orderHeading\(locale, entry\.jobs\)\}<\/h2>/);
  assert.match(page, /<JobCard key=\{entry\.job\.jobId\} job=\{entry\.job\} thumb=\{thumbSrc\(entry\.job\)\} \/>/);
  // loadMore legger sidene sammen i `jobs` som foer (dedup paa jobId); ingen egen tilstand for gruppene.
  assert.match(page, /return \[\.\.\.prev, \.\.\.fresh\];/);
  assert.doesNotMatch(page, /useState<HistoryEntry/);
});
