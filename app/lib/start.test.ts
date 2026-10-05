import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { JobSummary, JobSummaryStatus } from "./api";
import {
  anyWorking,
  RECENT_FETCH,
  RECENT_LIMIT,
  startView,
  WAITING_FETCH,
  WAITING_HISTORY_HREF,
  WAITING_LIMIT,
  waitingFromParam,
} from "./start.ts";
import { ENABLED, orderableTools, SERVICE_PARAM, serviceHref, SERVICES_PATH, toolFromParam } from "./services.ts";
import { DICTIONARIES } from "./i18n/index.ts";

// TG-NEW-153 (dag 38), PR 2: startsiden /start, forhaandsvalg paa Tjenester
// og Historikk med «Venter paa meg» fra adressen.

const APP_DIR = fileURLToPath(new URL("..", import.meta.url));
const read = (rel: string) => readFileSync(join(APP_DIR, rel), "utf8");
const withoutComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

function job(id: string, status: JobSummaryStatus = "succeeded"): JobSummary {
  return {
    jobId: id,
    service: "scene_transform",
    status,
    createdAt: "2026-10-05T10:00:00Z",
    thumbUrl: null,
    originalThumbUrl: null,
    error: null,
    code: null,
    reason: null,
    isOwner: true,
    ownerShort: null,
  };
}
const many = (prefix: string, n: number, status?: JobSummaryStatus) =>
  Array.from({ length: n }, (_, i) => job(`${prefix}${i}`, status));

// ---------------------------------------------------------------------------
// startView: hvilken del siden viser
// ---------------------------------------------------------------------------

test("TG-153 start: uten jobber er brukeren ny (tjenestene foerst)", () => {
  assert.deepEqual(startView({ kind: "loaded", waiting: [], recent: [] }), { kind: "new" });
});

test("TG-153 start: feil og lasting er aldri «ny bruker»", () => {
  assert.deepEqual(startView({ kind: "error" }), { kind: "error" });
  assert.deepEqual(startView({ kind: "loading" }), { kind: "loading" });
});

test("TG-153 start: en jobb som venter, staar bare under «Venter paa deg»", () => {
  const w = job("w1", "awaiting_approval");
  const view = startView({ kind: "loaded", waiting: [w], recent: [w, job("r1"), job("r2")] });
  assert.equal(view.kind, "active");
  if (view.kind !== "active") return;
  assert.deepEqual(view.waiting.map((j) => j.jobId), ["w1"]);
  assert.deepEqual(view.recent.map((j) => j.jobId), ["r1", "r2"]);
  assert.equal(view.moreWaiting, false);
});

test("TG-153 start: grensene er 4 som venter og 6 siste, og «Se alle» bare naar det er flere", () => {
  assert.equal(WAITING_LIMIT, 4);
  assert.equal(RECENT_LIMIT, 6);
  assert.equal(WAITING_FETCH, WAITING_LIMIT + 1);
  assert.equal(RECENT_FETCH, RECENT_LIMIT + WAITING_LIMIT);

  const exact = startView({ kind: "loaded", waiting: many("w", 4, "awaiting_approval"), recent: [] });
  assert.ok(exact.kind === "active" && exact.waiting.length === 4 && !exact.moreWaiting);

  const waiting = many("w", 5, "needs_review");
  // De fire som vises, er de nyeste i siste jobber; resten fyller opp.
  const recent = [...waiting.slice(0, 4), ...many("r", 6)];
  const view = startView({ kind: "loaded", waiting, recent });
  assert.ok(view.kind === "active");
  if (view.kind !== "active") return;
  assert.equal(view.waiting.length, 4);
  assert.equal(view.moreWaiting, true);
  assert.deepEqual(view.recent.map((j) => j.jobId), ["r0", "r1", "r2", "r3", "r4", "r5"]);
});

test("TG-153 start: ingen jobber som venter gir en rolig linje, ikke ny bruker", () => {
  const view = startView({ kind: "loaded", waiting: [], recent: [job("r1")] });
  assert.ok(view.kind === "active" && view.waiting.length === 0 && view.recent.length === 1);
});

test("TG-153 start: den automatiske hentingen gaar bare mens en jobb lages", () => {
  assert.equal(anyWorking({ kind: "loading" }), false);
  assert.equal(anyWorking({ kind: "error" }), false);
  assert.equal(anyWorking({ kind: "loaded", waiting: [], recent: [job("a"), job("b", "failed")] }), false);
  assert.equal(anyWorking({ kind: "loaded", waiting: [], recent: [job("a", "running")] }), true);
  assert.equal(anyWorking({ kind: "loaded", waiting: [], recent: [job("a", "queued")] }), true);
});

// ---------------------------------------------------------------------------
// Adressene: /tjenester?tjeneste=<id> og /history?vis=venter
// ---------------------------------------------------------------------------

test("TG-153: snarveiene viser bare tjenester som kan bestilles i prod", () => {
  // Speiler services/enabled.py i backend (TG-NEW-138): privacy_blur og skumring.
  assert.deepEqual(orderableTools().map((t) => t.id), ["privacy_blur", "skumring"]);
  for (const tool of orderableTools()) assert.equal(ENABLED[tool.id as keyof typeof ENABLED], true, tool.id);
});

test("TG-153: forhaandsvalget godtar bare tjenester som er slaatt paa", () => {
  assert.equal(SERVICE_PARAM, "tjeneste");
  assert.equal(serviceHref("skumring"), "/tjenester?tjeneste=skumring");
  assert.ok(serviceHref("x").startsWith(`${SERVICES_PATH}?`));
  assert.deepEqual(toolFromParam("skumring"), { categoryId: "timetraveler", toolId: "skumring" });
  assert.deepEqual(toolFromParam("privacy_blur"), { categoryId: "fixit", toolId: "privacy_blur" });
  for (const hidden of ["klart_vaer", "magic_cleanup", "virtual_stage", "express_v2", "video", "", "SKUMRING"]) {
    assert.equal(toolFromParam(hidden), null, hidden);
  }
  assert.equal(toolFromParam(null), null);
});

test("TG-153: Historikk aapner med «Venter paa meg» bare fra ?vis=venter", () => {
  assert.equal(WAITING_HISTORY_HREF, "/history?vis=venter");
  assert.equal(waitingFromParam("venter"), true);
  for (const v of [null, "", "alle", "Venter", "waiting"]) assert.equal(waitingFromParam(v), false, String(v));
});

// ---------------------------------------------------------------------------
// Sidene (kildesjekk)
// ---------------------------------------------------------------------------

test("TG-153: /start bruker bare kallene som finnes, egne jobber, og nye forsoek ved kaldstart", () => {
  const page = withoutComments(read("(app)/start/page.tsx"));
  assert.match(page, /listJobs\(\{ limit: WAITING_FETCH, statuses: WAITING_FOR_ME_STATUSES, getToken, onRetry \}\)/);
  assert.match(page, /listJobs\(\{ limit: RECENT_FETCH, getToken, onRetry \}\)/);
  assert.match(page, /t\(locale, waking \? "net\.waking" : "start\.loading"\)/);
  assert.match(page, /useQuota\(\)/);
  assert.match(page, /<QuotaNotice view=\{quotaView\(quota\.quota\)\}/);
  // Aldri alle brukeres jobber, ogsaa for admin.
  assert.doesNotMatch(page, /scope|getCapabilities|fetch\(|supabase/);
  // Den automatiske hentingen er den fra Historikk, uendret.
  assert.match(page, /useAutoRefresh\(anyWorking\(jobs\), silentRefresh, refreshEpoch\);/);
  assert.match(page, /mergeRefresh\(prev\.waiting, waiting, WAITING_FETCH\)/);
  assert.match(page, /mergeRefresh\(prev\.recent, recent, RECENT_FETCH\)/);
});

test("TG-153: /start viser det merkede bildet, og tjenestene kommer fra orderableTools", () => {
  const page = withoutComments(read("(app)/start/page.tsx"));
  assert.equal((page.match(/<JobCard key=\{job\.jobId\} job=\{job\} thumb=\{thumbSrc\(job\)\} \/>/g) ?? []).length, 2);
  assert.match(page, /orderableTools\(\)\.map/);
  assert.match(page, /href=\{serviceHref\(tool\.id\)\}/);
  assert.match(page, /<ButtonLink href=\{SERVICES_PATH\}>/);
  assert.match(page, /href=\{WAITING_HISTORY_HREF\}/);
  // Ingen tjeneste eller side skrevet rett inn: alt gaar via ENABLED.
  assert.doesNotMatch(page, /["'`](skumring|privacy_blur|klart_vaer|magic_cleanup|virtual_stage)["'`]/);
  assert.doesNotMatch(page, /STAGING_PATH|VIDEO_PATH|ENABLED/);
});

test("TG-153: Tjenester og Historikk leser adressen i en Suspense-grense", () => {
  const services = withoutComments(read("(app)/tjenester/page.tsx"));
  assert.match(services, /export default function ExpressPage\(\) \{\s*return \(\s*<Suspense fallback=\{null\}>\s*<ExpressContent \/>/);
  assert.match(services, /useState\(\(\) => toolFromParam\(searchParams\.get\(SERVICE_PARAM\)\)\)/);
  const history = withoutComments(read("(app)/history/page.tsx"));
  assert.match(history, /export default function HistoryPage\(\) \{\s*return \(\s*<Suspense fallback=\{null\}>\s*<HistoryContent \/>/);
  assert.match(history, /useState\(\(\) => waitingFromParam\(searchParams\.get\(HISTORY_VIEW_PARAM\)\)\)/);
});

test("TG-153: tekstene paa /start lover ikke oppdrag", () => {
  for (const locale of ["nb", "en"] as const) {
    for (const [key, text] of Object.entries(DICTIONARIES[locale].ui)) {
      if (!key.startsWith("start.") && !key.startsWith("home.")) continue;
      assert.doesNotMatch(text, /oppdrag|assignment|project/i, `${locale} ${key}`);
    }
  }
  assert.equal(DICTIONARIES.nb.ui["start.newOrder"], "Ny bestilling");
  assert.equal(DICTIONARIES.en.ui["start.newOrder"], "New order");
  // AVVIK 4: samme ord som ordlista, og engelsk sier det samme som norsk.
  assert.doesNotMatch(DICTIONARIES.nb.ui["home.intro"], /sladding/);
  assert.doesNotMatch(DICTIONARIES.en.ui["home.intro"], /product/i);
});
