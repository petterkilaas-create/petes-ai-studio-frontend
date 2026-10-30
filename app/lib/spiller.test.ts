import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseAssignment, type AssignmentImage, type AssignmentSummary } from "./assignments.ts";
import type { DecisionOutcome, JobReviewDetail } from "./api";
import {
  imagePos,
  imageStep,
  IMAGE_PARAM,
  jumpsAfter,
  nextState,
  pageArrow,
  parsePlayerParam,
  playerHref,
  posLabel,
  progressText,
  assignmentProgress,
  resolvePos,
  RESULT_PARAM,
  stripStatus,
  UNDO_NOTICE_MS,
  undoKeys,
  undoNoticeKey,
} from "./player.ts";
import { buildDecision, canReopen, reopenKeys, reopenMessage } from "./review.ts";
import { orderHref } from "./ordrer.ts";
import { isNavActive } from "./nav.ts";
import { DICTIONARIES, messageText, t } from "./i18n/index.ts";
import { literalTexts, literalTextsInFile, withoutComments } from "./testing/jsxText.ts";

/**
 * FE-4 (Dag 59): ordresiden («spilleren») og «Angre godkjenning». Reglene
 * testes som rene funksjoner; sidene leses som tekst (node --test laster
 * ikke .tsx). Eksempelet er ordren med 8 bilder fra FE-0: til kontroll er
 * job_1a, job_4a (trenger svar), job_5a og job_7b; job_5b behandles.
 */

const APP_DIR = fileURLToPath(new URL("..", import.meta.url));
const read = (rel: string) => readFileSync(join(APP_DIR, rel), "utf8");

const SAMPLE = parseAssignment(
  JSON.parse(readFileSync(new URL("./testdata/assignment_v1.json", import.meta.url), "utf-8"))
);
const IMAGES: AssignmentImage[] = SAMPLE?.images ?? [];

const ORDER = "3f2a9c1e-7b4d-4e8a-9c0f-1a2b3c4d5e6f";

function withStatus(images: readonly AssignmentImage[], status: (id: string) => string | null): AssignmentImage[] {
  return images.map((img) => ({
    ...img,
    results: img.results.map((r) => {
      const s = status(r.resultId);
      return s === null ? r : { ...r, displayStatus: s as typeof r.displayStatus };
    }),
  }));
}

// --- neste til kontroll ------------------------------------------------------------------

test("neste til kontroll: etter godkjenning hopper siden til neste som venter, og rundt til starten", () => {
  // job_1a er godkjent: neste er job_4a.
  const after1 = withStatus(IMAGES, (id) => (id === "job_1a" ? "approved" : null));
  assert.deepEqual(nextState(after1, { imageId: "img_1", resultId: "job_1a" }), {
    kind: "next",
    pos: { imageId: "img_4", resultId: "job_4a" },
  });
  // Fra det siste (job_7b) gaar det rundt til job_1a.
  const after7 = withStatus(IMAGES, (id) => (id === "job_7b" ? "not_used" : null));
  assert.deepEqual(nextState(after7, { imageId: "img_7", resultId: "job_7b" }), {
    kind: "next",
    pos: { imageId: "img_1", resultId: "job_1a" },
  });
  assert.equal(jumpsAfter("approve"), true);
  assert.equal(jumpsAfter("reject"), true);
  for (const a of ["reopen", "correct", "continue"]) assert.equal(jumpsAfter(a), false, a);
});

test("neste til kontroll: ingen igjen gir «Ingen flere nå, N behandles» eller «Alt er kontrollert»", () => {
  const waiting = new Set(["job_1a", "job_4a", "job_5a", "job_7b"]);
  // Alt avgjort, men job_5b behandles fortsatt.
  const busy = withStatus(IMAGES, (id) => (waiting.has(id) ? "approved" : null));
  assert.deepEqual(nextState(busy, { imageId: "img_7", resultId: "job_7b" }), { kind: "waiting", processing: 1 });
  assert.equal(t("nb", "player.waiting", { n: 1 }), "Ingen flere nå, 1 behandles");
  // Ingenting behandles heller.
  const done = withStatus(IMAGES, (id) => (waiting.has(id) || id === "job_5b" ? "approved" : null));
  assert.deepEqual(nextState(done, { imageId: "img_7", resultId: "job_7b" }), { kind: "all_reviewed" });
  assert.equal(t("nb", "player.allReviewedLink"), "Alt er kontrollert. Gå til nedlasting");
  // Bare gjeldende venter: ingen knapp (den peker ikke paa seg selv).
  const only = withStatus(IMAGES, (id) => (waiting.has(id) && id !== "job_5a" ? "approved" : id === "job_5b" ? "failed" : null));
  assert.deepEqual(nextState(only, { imageId: "img_5", resultId: "job_5a" }), { kind: "none" });
  // Feilede telles ikke (ingenting aa kontrollere): resten er kontrollert.
  const failed = withStatus(IMAGES, (id) => (waiting.has(id) ? "approved" : id === "job_5b" ? "failed" : null));
  assert.deepEqual(nextState(failed, { imageId: "img_1", resultId: "job_1a" }), { kind: "all_reviewed" });
  // Bare feilede: ingenting aa si.
  const allFailed = withStatus(IMAGES, () => "failed");
  assert.deepEqual(nextState(allFailed, { imageId: "img_1", resultId: "job_1a" }), { kind: "none" });
  assert.deepEqual(nextState([], null), { kind: "none" });
});

// --- URL-tilstanden -----------------------------------------------------------------------

test("URL-en: ?bilde=&resultat= bygges og leses, og bare id-er som ser riktige ut godtas", () => {
  assert.equal(IMAGE_PARAM, "bilde");
  assert.equal(RESULT_PARAM, "resultat");
  assert.equal(playerHref(ORDER), `/ordrer/${ORDER}`);
  assert.equal(playerHref(ORDER, { imageId: "img_1", resultId: "job_1a" }), `/ordrer/${ORDER}?bilde=img_1&resultat=job_1a`);
  assert.equal(playerHref(ORDER, { imageId: "img_3", resultId: null }), `/ordrer/${ORDER}?bilde=img_3`);
  assert.equal(playerHref("a/b"), "/ordrer/a%2Fb");
  assert.equal(parsePlayerParam("img_1"), "img_1");
  assert.equal(parsePlayerParam(ORDER), ORDER);
  assert.equal(parsePlayerParam(["job_1a", "x"]), "job_1a");
  for (const bad of [undefined, null, "", "a b", "../x", "<script>", "x".repeat(101)]) {
    assert.equal(parsePlayerParam(bad), null, String(bad));
  }
});

test("URL-en: plassen fra adressen, med reserve naar bildet eller resultatet er ukjent", () => {
  assert.deepEqual(resolvePos(IMAGES, "img_5", "job_5b"), { imageId: "img_5", resultId: "job_5b" });
  // Bare bildet: det som venter paa bildet, ellers det foerste resultatet, ellers bildet alene.
  assert.deepEqual(resolvePos(IMAGES, "img_7", null), { imageId: "img_7", resultId: "job_7b" });
  assert.deepEqual(resolvePos(IMAGES, "img_2", null), { imageId: "img_2", resultId: "job_2a" });
  assert.deepEqual(resolvePos(IMAGES, "img_3", null), { imageId: "img_3", resultId: null });
  // Resultatet hoerer ikke til bildet: bildet vinner.
  assert.deepEqual(resolvePos(IMAGES, "img_7", "job_1a"), { imageId: "img_7", resultId: "job_7b" });
  // Bare resultatet (f.eks. etter «Angre»): bildet finnes fra resultatet.
  assert.deepEqual(resolvePos(IMAGES, null, "job_6a"), { imageId: "img_6", resultId: "job_6a" });
  // Ukjent eller ingenting: der spilleren starter.
  assert.deepEqual(resolvePos(IMAGES, "borte", "borte"), { imageId: "img_1", resultId: "job_1a" });
  assert.deepEqual(resolvePos(IMAGES, null, null), { imageId: "img_1", resultId: "job_1a" });
  assert.equal(resolvePos([], "img_1", null), null);
  assert.deepEqual(imagePos(IMAGES[6]), { imageId: "img_7", resultId: "job_7b" });
});

// --- piltastene ---------------------------------------------------------------------------

test("piltastene: ←/→ til forrige og neste bilde uten aa gaa rundt", () => {
  assert.deepEqual(imageStep(IMAGES, { imageId: "img_2", resultId: "job_2a" }, 1), { imageId: "img_3", resultId: null });
  assert.deepEqual(imageStep(IMAGES, { imageId: "img_2", resultId: "job_2a" }, -1), { imageId: "img_1", resultId: "job_1a" });
  assert.equal(imageStep(IMAGES, { imageId: "img_1", resultId: "job_1a" }, -1), null);
  assert.equal(imageStep(IMAGES, { imageId: "img_8", resultId: null }, 1), null);
  assert.equal(imageStep(IMAGES, { imageId: "borte", resultId: null }, 1), null);
});

test("piltastene paa siden: ikke i felt, lerret, glider, faner, stripa eller lysboksen, og ikke med Ctrl/Alt/Cmd", () => {
  const plain = { tag: "BUTTON", role: null, editable: false, modal: false };
  const none = { alt: false, ctrl: false, meta: false };
  assert.equal(pageArrow("ArrowLeft", plain, none), -1);
  assert.equal(pageArrow("ArrowRight", { ...plain, tag: "BODY" }, none), 1);
  assert.equal(pageArrow("ArrowUp", plain, none), null);
  assert.equal(pageArrow(" ", plain, none), null);
  for (const tag of ["INPUT", "TEXTAREA", "SELECT", "input"]) assert.equal(pageArrow("ArrowRight", { ...plain, tag }, none), null, tag);
  assert.equal(pageArrow("ArrowRight", { ...plain, editable: true }, none), null);
  for (const role of ["application", "slider", "tab", "radio", "menuitem"]) {
    assert.equal(pageArrow("ArrowRight", { ...plain, role }, none), null, role);
  }
  assert.equal(pageArrow("ArrowRight", { ...plain, modal: true }, none), null);
  assert.equal(pageArrow("ArrowRight", plain, { ...none, alt: true }), null);
  assert.equal(pageArrow("ArrowRight", plain, { ...none, meta: true }), null);
});

// --- tekstene paa siden -------------------------------------------------------------------

test("teksten: rom og tjeneste, stripa og fremdriften", () => {
  assert.equal(posLabel("nb", IMAGES, { imageId: "img_1", resultId: "job_1a" }), "Stue · Kveldsbilde");
  assert.equal(posLabel("nb", IMAGES, { imageId: "img_3", resultId: null }), "Soverom");
  // Uten rom: «Bilde N».
  assert.match(posLabel("nb", IMAGES, { imageId: "img_6", resultId: "job_6a" }), /^Bilde 6 · /);
  assert.equal(posLabel("nb", IMAGES, { imageId: "borte", resultId: null }), "");
  assert.deepEqual(
    IMAGES.map((img) => stripStatus("nb", img)),
    [
      "1 av 2 kontrollert",
      "1 av 1 kontrollert",
      "Original",
      "0 av 1 kontrollert",
      "0 av 2 kontrollert",
      "1 av 1 kontrollert",
      "1 av 2 kontrollert",
      "Original",
    ]
  );
  assert.equal(progressText("nb", assignmentProgress(IMAGES)), "4 av 9 kontrollert · 1 behandles");
  const idle = withStatus(IMAGES, (id) => (id === "job_5b" ? "approved" : null));
  assert.equal(progressText("en", assignmentProgress(idle)), "5 of 9 reviewed");
});

// --- «Angre godkjenning» ------------------------------------------------------------------

const REVIEW = { allowedActions: [] } as Pick<JobReviewDetail, "allowedActions">;

test("«Angre godkjenning» vises bare naar backend gir reopen i allowed_actions", () => {
  assert.equal(canReopen({ allowedActions: ["reopen"] }), true);
  assert.equal(canReopen(REVIEW), false);
  // Til godkjenning: Godkjenn og Avvis, ikke Angre.
  assert.equal(canReopen({ allowedActions: ["approve", "reject", "correct"] }), false);
  assert.deepEqual(reopenKeys("succeeded"), { button: "reopen.approved", confirm: "reopen.confirmApproved" });
  assert.deepEqual(reopenKeys("failed"), { button: "reopen.rejected", confirm: "reopen.confirmRejected" });
  // Meldingen etter hoppet har samme knapp og spoersmaal som kortet.
  assert.deepEqual(undoKeys("approve"), reopenKeys("succeeded"));
  assert.deepEqual(undoKeys("reject"), reopenKeys("failed"));
  assert.equal(undoNoticeKey("approve"), "player.undo.approved");
  assert.equal(undoNoticeKey("reject"), "player.undo.rejected");
  assert.equal(UNDO_NOTICE_MS, 10_000);
});

test("«Angre godkjenning»: body er reopen med expected_version, og svaret blir tekst", () => {
  assert.deepEqual(buildDecision("reopen", "grunn", "yes", { version: 7 }), { action: "reopen", expected_version: 7 });
  assert.deepEqual(buildDecision("reopen", "", null, { version: null }), { action: "reopen" });
  const out = (o: DecisionOutcome) => reopenMessage(o);
  assert.equal(out({ kind: "updated", status: "awaiting_approval" }), null);
  const blocked = out({ kind: "blocked", code: "action_not_allowed", fields: [], overrideCode: null });
  assert.deepEqual(blocked, { group: "decisionError", code: "action_not_allowed" });
  assert.equal(messageText("nb", blocked!), "Denne handlingen er ikke tillatt for jobben nå.");
  assert.deepEqual(out({ kind: "status_changed", status: "succeeded" }), { group: "decisionError", code: "status_changed" });
  assert.deepEqual(out({ kind: "not_found" }), { key: "decision.error" });
  assert.deepEqual(out({ kind: "error", httpStatus: 500 }), { key: "decision.error" });
});

test("api: reopen er en kjent handling (filtreres ikke bort fra allowed_actions)", () => {
  const src = withoutComments(read("lib/api.ts"));
  assert.match(src, /export type DecisionAction = "approve" \| "reject" \| "continue" \| "correct" \| "reopen";/);
  assert.match(src, /const DECISION_ACTIONS: ReadonlySet<string> = new Set\(\["approve", "reject", "continue", "correct", "reopen"\]\);/);
});

test("ResultReview: «Angre» i kortet etter avgjoerelsen, bare med canReopen og ikke for andres jobb", () => {
  const src = withoutComments(read("components/godkjenning/ResultReview.tsx"));
  assert.match(src, /\{canReopen\(review\) && !readOnly && \(\s*<ReopenConfirm\s+keys=\{reopenKeys\(review\.status\)\}\s+onConfirm=\{\(\) => decide\("reopen", null\)\}/);
  // Etterpaa: melding om «Til godkjenning», og ordresiden faar handlingen.
  assert.match(src, /if \(action === "reopen"\) setMessage\(\{ key: "reopen\.done" \}\);/);
  // Innebygd: uten tilbake-lenken og overskriften.
  assert.match(src, /if \(embedded\) \{\s*return \(\s*<div className="flex min-w-0 flex-col gap-6">/);
  // Kroppen er flyttet til `body`; ingen tekst skrevet rett inn der heller.
  const body = src.slice(src.indexOf("const body = ("), src.indexOf("// FE-4: inne i ordresiden"));
  assert.ok(body.length > 1000);
  assert.deepEqual(literalTexts(`${body}<`), []);
});

test("ReopenConfirm og meldingen: bekreftelse med «Ja, angre» og «Avbryt», meldingen staar ikke mens den brukes", () => {
  const confirm = withoutComments(read("components/godkjenning/ReopenConfirm.tsx"));
  assert.match(confirm, /t\(locale, working \? "reopen\.working" : "reopen\.confirm"\)/);
  assert.match(confirm, /t\(locale, "action\.cancel"\)/);
  assert.match(confirm, /if \(open\) confirmRef\.current\?\.focus\(\);/);
  const notice = withoutComments(read("components/ordre/UndoNotice.tsx"));
  assert.match(notice, /const paused = confirmOpen \|\| working \|\| hover \|\| focusWithin \|\| error !== null;/);
  assert.match(notice, /window\.setTimeout\(onClose, UNDO_NOTICE_MS\)/);
  // Henter review foer reopen: versjonen, og at det fortsatt er lov.
  assert.match(notice, /if \(review\.kind !== "ok" \|\| !canReopen\(review\.review\)\) \{/);
  assert.match(notice, /decision: buildDecision\("reopen", "", null, review\.review\),/);
  const player = withoutComments(read("components/ordre/AssignmentPlayer.tsx"));
  assert.match(player, /<div aria-live="polite" className="mb-4 empty:hidden">/);
});

// --- spilleren ----------------------------------------------------------------------------

test("siden: tynt skall med key={id}, flagget og ?bilde=&resultat= lest med parsePlayerParam", () => {
  const page = withoutComments(read("(app)/ordrer/[id]/page.tsx"));
  assert.match(page, /const imageId = parsePlayerParam\(query\[IMAGE_PARAM\]\);/);
  assert.match(page, /const resultId = parsePlayerParam\(query\[RESULT_PARAM\]\);/);
  assert.match(page, /if \(!isPageEnabled\(ORDERS_PATH\)\) return <ServiceUnavailable \/>;/);
  assert.match(page, /return <AssignmentPlayer key=\{id\} assignmentId=\{id\} imageId=\{imageId\} resultId=\{resultId\} \/>;/);
});

test("spilleren: ResultReview innebygd med key={resultId}, valget i URL-en med router.replace, og hoppet", () => {
  const src = withoutComments(read("components/ordre/AssignmentPlayer.tsx"));
  assert.match(src, /<ResultReview key=\{resultId\} jobId=\{resultId\} from=\{assignmentId\} onChanged=\{onChanged\} embedded \/>/);
  assert.match(src, /router\.replace\(playerHref\(assignmentId, next\), \{ scroll: false \}\);/);
  assert.doesNotMatch(src, /router\.push/);
  assert.match(src, /if \(action === undefined \|\| !jumpsAfter\(action\) \|\| from === null \|\| from\.resultId === null\) return;/);
  assert.match(src, /const state = nextState\(imagesRef\.current, from\);/);
  assert.match(src, /t\(locale, "assignment\.status\.originalOnly"\)/);
  assert.match(src, /useAutoRefresh\(processing, reload, refreshKey, ORDER_REFRESH_MAX_MS\);/);
  assert.match(src, /href=\{orderServicesHref\(assignmentId\)\}/);
  assert.match(src, /t\(locale, "player\.orderMore"\)/);
});

test("tastaturet: stripa og fanene har én tabstopp, piltaster og riktig rolle", () => {
  const strip = withoutComments(read("components/ordre/ImageStrip.tsx"));
  assert.match(strip, /tabIndex=\{selected \? 0 : -1\}/);
  assert.match(strip, /aria-current=\{selected \? "true" : undefined\}/);
  assert.match(strip, /const j = stripKey\(e\.key, current, images\.length\);/);
  const tabs = withoutComments(read("components/ordre/ResultTabs.tsx"));
  assert.match(tabs, /role="tablist"/);
  assert.match(tabs, /role="tab"/);
  assert.match(tabs, /aria-selected=\{selected\}/);
  assert.match(tabs, /tabIndex=\{selected \? 0 : -1\}/);
  assert.match(tabs, /const j = stripKey\(e\.key, current, results\.length\);/);
});

test("mobil: stripa ruller vannrett, fanene brytes, og knappene er minst 44 px", () => {
  const strip = withoutComments(read("components/ordre/ImageStrip.tsx"));
  assert.match(strip, /<nav aria-label=\{t\(locale, "player\.stripLabel"\)\} className="min-w-0">/);
  assert.match(strip, /<ul className="flex gap-2 overflow-x-auto pb-2"/);
  const tabs = withoutComments(read("components/ordre/ResultTabs.tsx"));
  assert.match(tabs, /className="flex flex-wrap gap-2"/);
  assert.match(tabs, /inline-flex min-h-11 max-w-full/);
  const player = withoutComments(read("components/ordre/AssignmentPlayer.tsx"));
  assert.match(player, /<main className="mx-auto w-full max-w-\[1360px\] min-w-0 px-4 /);
  assert.match(withoutComments(read("components/ordre/UndoNotice.tsx")), /inline-flex size-11 shrink-0/);
});

test("ingen synlig tekst skrevet rett inn i filene FE-4 lager", () => {
  for (const rel of [
    "(app)/ordrer/[id]/page.tsx",
    "components/ordre/AssignmentPlayer.tsx",
    "components/ordre/ImageStrip.tsx",
    "components/ordre/ResultTabs.tsx",
    "components/ordre/UndoNotice.tsx",
    "components/godkjenning/ReopenConfirm.tsx",
    "components/godkjenning/ResultReview.tsx",
  ]) {
    assert.deepEqual(literalTextsInFile(read(rel)), [], rel);
  }
});

// --- lenkene og menyen --------------------------------------------------------------------

test("lenkene: ordrelista til ordresiden naar ordren har resultater, ellers til bildene", () => {
  const counts = { images: 2, results: 0, processing: 0, toReview: 0, needsAnswer: 0, approved: 0, notUsed: 0, failed: 0 };
  const order = (results: number): Pick<AssignmentSummary, "id" | "counts"> => ({ id: ORDER, counts: { ...counts, results } });
  assert.equal(orderHref(order(0)), `/ordrer/${ORDER}/bilder`);
  assert.equal(orderHref(order(3)), `/ordrer/${ORDER}`);
});

test("menyen: godkjenningssiden med gyldig ?fra= markerer Ordrer, ellers Historikk", () => {
  const path = "/godkjenning/job_1";
  assert.equal(isNavActive("/history", path, null), true);
  assert.equal(isNavActive("/ordrer", path, null), false);
  assert.equal(isNavActive("/ordrer", path, ORDER), true);
  assert.equal(isNavActive("/history", path, ORDER), false);
  // Ugyldig fra: som foer.
  assert.equal(isNavActive("/history", path, "https://evil.example"), true);
  assert.equal(isNavActive("/ordrer", path, "https://evil.example"), false);
  // Vanlige sider som foer.
  assert.equal(isNavActive("/ordrer", `/ordrer/${ORDER}`, null), true);
  assert.equal(isNavActive("/history", "/history", ORDER), true);
  assert.equal(isNavActive("/start", "/ordrer", null), false);
  const nav = withoutComments(read("components/AppNav.tsx"));
  assert.match(nav, /const from = useSearchParams\(\)\?\.get\(FROM_PARAM\) \?\? null;/);
  assert.match(nav, /const active = isNavActive\(l\.href, pathname, from\);/);
});

// --- ordlista -------------------------------------------------------------------------------

test("ordlista: nb og en for spilleren, meldingen og «Angre godkjenning»", () => {
  const nb = DICTIONARIES.nb.ui;
  const en = DICTIONARIES.en.ui;
  assert.equal(nb["reopen.approved"], "Angre godkjenning");
  assert.equal(en["reopen.approved"], "Undo approval");
  assert.equal(nb["reopen.rejected"], "Angre");
  assert.equal(nb["reopen.confirm"], "Ja, angre");
  assert.equal(t("nb", "player.undo.approved", { label: "Stue · Kveldsbilde" }), "Godkjent: Stue · Kveldsbilde");
  assert.equal(t("nb", "player.undo.rejected", { label: "Bad" }), "Avvist: Bad");
  assert.equal(t("en", "player.undo.approved", { label: "Bad" }), "Approved: Bad");
  assert.equal(t("nb", "player.next", { label: "Bad" }), "Neste til kontroll: Bad");
  assert.equal(nb["player.orderMore"], "Bestill mer for boligen");
  // Alle de nye noeklene har tekst paa begge spraak, og de engelske er ikke norske.
  const keys = Object.keys(nb).filter((k) => k.startsWith("reopen.") || /^player\.(undo|next$|waiting|allReviewedLink|orderMore|images|noImages|keysHint|imageN|original|position|stripLabel|tabsLabel)/.test(k));
  assert.ok(keys.length >= 24, String(keys.length));
  for (const k of keys) {
    assert.ok(nb[k as keyof typeof nb].trim().length > 0, k);
    assert.ok(en[k as keyof typeof en].trim().length > 0, k);
    assert.doesNotMatch(en[k as keyof typeof en], /[æøå]|Angre|Godkjent|behandles/, k);
  }
});

// --- veiledningen ----------------------------------------------------------------------------

test("veiledningen: del 6 har «Angre godkjenning», og del 5 sier at «Åpne» gaar til ordresiden", async () => {
  const { guidePage } = await import("../../content/marketing/nb/guide.ts");
  const text = (id: string) => {
    const s = guidePage.sections.find((x) => x.id === id);
    return s === undefined ? "" : [...s.steps, ...(s.notes ?? [])].join("\n");
  };
  assert.match(text("godkjenn"), /«Angre godkjenning»/);
  assert.match(text("godkjenn"), /«Neste til kontroll»/);
  assert.match(text("resultater"), /«Åpne» på et resultat\. Da åpnes ordresiden/);
  assert.match(text("resultater"), /«Bestill mer for boligen»/);
  // «Angre godkjenning» staar ikke lenger som noe som mangler.
  assert.doesNotMatch(read("../content/marketing/nb/guide.ts"), /ikke i appen ennaa/);
});
