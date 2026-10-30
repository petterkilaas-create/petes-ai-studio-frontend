import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { startAutoRefresh } from "./autoRefresh.ts";
import { DocumentQueue, type UploadXhr } from "./documentUpload.ts";
import { DICTIONARIES, t, type UiKey } from "./i18n/index.ts";
import {
  getListingText,
  ListingTextError,
  orderCallSignature,
  orderListingText,
  parseListingText,
  type ListingText,
  type ListingTextOrder,
} from "./listingText.ts";
import { createListingTextMock, MOCK_MARKER, MockXhr } from "./listingTextMock.ts";
import {
  clockText,
  failedRunCode,
  LISTING_TEXT_POLL_MAX_MS,
  LISTING_TEXT_POLL_MS,
  listingTextView,
  orderBlock,
  orderErrorText,
  refetchAfter,
  stepStates,
} from "./listingTextOrder.ts";
import { CallKeys } from "./orderStart.ts";
import { literalTextsInFile, withoutComments } from "./testing/jsxText.ts";

/**
 * Annonsetekst, bestillingen (TG-NEW-281, T2): delen siden viser, «Bestill
 * tekstpakke» (aktiv eller graa, Idempotency-Key og feilkodene), hentingen
 * mens pakken behandles, mock-modusen og ordlista. Sidene leses som tekst.
 */

const APP_DIR = fileURLToPath(new URL("..", import.meta.url));
const ROOT = join(APP_DIR, "..");
const read = (rel: string) => readFileSync(join(APP_DIR, rel), "utf8");

const NEW_COMPONENTS = [
  "components/annonsetekst/ListingTextOrder.tsx",
  "components/annonsetekst/ListingTextOrderForm.tsx",
  "components/annonsetekst/DocumentUploadPanel.tsx",
  "components/annonsetekst/ListingTextSteps.tsx",
  "components/annonsetekst/ListingTextMock.tsx",
];
const NEW_MODULES = ["lib/documentUpload.ts", "lib/listingTextOrder.ts", "lib/listingTextMock.ts", "hooks/useListingText.ts"];
const PAGE = "(app)/annonsetekst/[ordreId]/page.tsx";

const pkg = (raw: Record<string, unknown>): ListingText => {
  const parsed = parseListingText({ assignment_id: "asg_1", display_status: "not_ordered", ...raw });
  assert.ok(parsed);
  return parsed;
};

// --- delen av siden ----------------------------------------------------------

test("visningen: bestilling, behandles, klar, slettet og ukjent", () => {
  assert.equal(listingTextView(pkg({})), "order");
  assert.equal(listingTextView(pkg({ display_status: "processing" })), "processing");
  assert.equal(listingTextView(pkg({ display_status: "to_review", version: 1 })), "ready");
  assert.equal(listingTextView(pkg({ display_status: "approved", version: 2 })), "ready");
  // Feilet uten versjon: bestillingen igjen, med feilen fra kjoeringen.
  const failed = pkg({ display_status: "failed", last_run: { id: "r", status: "failed", error_code: "document_unreadable" } });
  assert.equal(listingTextView(failed), "order");
  assert.equal(failedRunCode(failed), "document_unreadable");
  // Feilet «Lag paa nytt» med en versjon: pakken vises (T3).
  assert.equal(listingTextView(pkg({ display_status: "failed", version: 2 })), "ready");
  assert.equal(failedRunCode(pkg({ display_status: "failed", version: 2 })), null);
  assert.equal(failedRunCode(pkg({})), null);
  assert.equal(listingTextView(pkg({ display_status: "to_review", media_deleted_at: "2027-01-01T00:00:00Z" })), "deleted");
  assert.equal(listingTextView(pkg({ display_status: "nyere_status" })), "unknown");
});

test("trinnlista: ferdige, trinnet som pagaar og de som gjenstaar", () => {
  assert.deepEqual(
    stepStates("planning").map((s) => s.state),
    ["done", "done", "current", "todo", "todo"]
  );
  assert.deepEqual(
    stepStates(null).map((s) => s.state),
    ["todo", "todo", "todo", "todo", "todo"]
  );
  assert.deepEqual(
    stepStates("reading_documents").map((s) => s.step),
    ["reading_documents", "viewing_images", "planning", "writing", "checking"]
  );
});

// --- «Bestill tekstpakke» ----------------------------------------------------

test("bestill: aktiv med bilde, dokument som er klart eller notat; ellers no_material", () => {
  const base = { images: 0, readyDocuments: 0, note: "", uploading: false, sending: false };
  assert.equal(orderBlock(base), "no_material");
  assert.equal(orderBlock({ ...base, note: "   \n" }), "no_material");
  assert.equal(orderBlock({ ...base, images: 1 }), null);
  assert.equal(orderBlock({ ...base, readyDocuments: 1 }), null);
  assert.equal(orderBlock({ ...base, note: "Ny kjøkkeninnredning 2024" }), null);
});

test("bestill: graa mens et dokument lastes opp, mens bestillingen sendes, og med for langt notat", () => {
  const base = { images: 3, readyDocuments: 1, note: "", uploading: false, sending: false };
  assert.equal(orderBlock({ ...base, uploading: true }), "uploading");
  assert.equal(orderBlock({ ...base, sending: true }), "sending");
  assert.equal(orderBlock({ ...base, note: "x".repeat(1000) }), null);
  assert.equal(orderBlock({ ...base, note: "x".repeat(1001) }), "note_too_long");
  // Tegn etter NFC: «å» fra macOS (a + ring) er ett tegn.
  assert.equal(orderBlock({ ...base, note: "å".repeat(1000) }), null);
});

test("bestill: siden regner «laster opp» av alle radene i arbeid, og sender bare dokumentene som er klare", () => {
  const src = withoutComments(read("components/annonsetekst/ListingTextOrder.tsx"));
  assert.match(src, /uploading: rows\.some\(\(r\) => r\.state === "queued" \|\| r\.state === "starting" \|\| r\.state === "uploading" \|\| r\.state === "checking"\)/);
  assert.match(src, /documentIds: queue\.readyIds\.length > 0 \? queue\.readyIds : undefined/);
  assert.match(src, /block=\{block\}/);
  assert.match(withoutComments(read("components/annonsetekst/ListingTextOrderForm.tsx")), /disabled=\{block !== null\}/);
});

function orderBackend(responses: (() => Response)[]) {
  const keys: (string | null)[] = [];
  const bodies: unknown[] = [];
  let n = 0;
  const request = async (path: string, init: RequestInit) => {
    assert.equal(path, "/v1/assignments/asg_1/listing-text");
    assert.equal(init.method, "POST");
    keys.push(new Headers(init.headers).get("Idempotency-Key"));
    bodies.push(JSON.parse(String(init.body)));
    const respond = responses[n++];
    return respond();
  };
  return { request, keys, bodies };
}

const accepted = () =>
  new Response(JSON.stringify({ assignment_id: "asg_1", display_status: "processing", last_run: { id: "r1", status: "queued" } }), { status: 202 });

/** Som order() i ListingTextOrder: noekkelen fra CallKeys, glemt ved svar, beholdt ved nettfeil. */
async function send(keys: CallKeys, request: Parameters<typeof orderListingText>[0], order: ListingTextOrder) {
  const key = keys.keyFor(orderCallSignature("order", "asg_1", order));
  try {
    const result = await orderListingText(request, { id: "asg_1", order, idempotencyKey: key });
    keys.received();
    return result;
  } catch (err) {
    if (err instanceof ListingTextError) keys.received();
    return err;
  }
}

test("bestill: ny Idempotency-Key per bestilling, samme bare ved nytt forsoek med samme kropp", async () => {
  let k = 0;
  const keys = new CallKeys(() => `k${++k}`);
  const b = orderBackend([
    () => {
      throw new TypeError("Failed to fetch");
    },
    accepted,
    () => new Response(JSON.stringify({ detail: { code: "listing_text_busy" } }), { status: 409 }),
    accepted,
    accepted,
  ]);
  const order: ListingTextOrder = { note: "Fast p-plass", documentIds: ["d1"] };
  assert.ok((await send(keys, b.request, order)) instanceof TypeError);
  await send(keys, b.request, order); // nettfeil: samme kall paa nytt
  await send(keys, b.request, order); // ny bestilling etter svar: ny noekkel (409)
  await send(keys, b.request, order); // etter feilsvar: ny noekkel
  await send(keys, b.request, { ...order, note: "Annet notat" });
  assert.deepEqual(b.keys, ["k1", "k1", "k2", "k3", "k4"]);
  assert.deepEqual(b.bodies[0], { note: "Fast p-plass", document_ids: ["d1"] });
});

test("feilkodene: 429 med tidspunktet fra Retry-After, 409 opptatt og dokument ikke klart", () => {
  const now = new Date(2026, 9, 30, 13, 50);
  const limit = new ListingTextError(429, "listing_text_daily_limit", { limit: 10 }, 900);
  assert.equal(orderErrorText("nb", limit, now), "Du har brukt alle tekstpakkene for i dag. Prøv igjen kl. 14.05.");
  assert.equal(orderErrorText("en", limit, now), "You have used all text packages for today. Try again at 14:05.");
  const cap = new ListingTextError(429, "listing_text_daily_cap", {}, 3600);
  assert.equal(orderErrorText("nb", cap, now), "Tjenesten har nådd grensen for i dag. Prøv igjen kl. 14.50.");
  // Uten Retry-After: teksten uten tidspunkt.
  assert.equal(
    orderErrorText("nb", new ListingTextError(429, "listing_text_daily_limit"), now),
    DICTIONARIES.nb.codes.listingTextError.listing_text_daily_limit
  );
  const busy = new ListingTextError(409, "listing_text_busy");
  assert.equal(orderErrorText("nb", busy), DICTIONARIES.nb.codes.listingTextError.listing_text_busy);
  const notReady = new ListingTextError(409, "document_not_ready", { document_id: "d1" });
  assert.equal(orderErrorText("nb", notReady), DICTIONARIES.nb.codes.listingTextError.document_not_ready);
  assert.equal(orderErrorText("nb", new ListingTextError(400, "no_material")), DICTIONARIES.nb.codes.listingTextError.no_material);
  assert.equal(orderErrorText("nb", new TypeError("x")), DICTIONARIES.nb.codes.listingTextError.network);
  // Etter opptatt og dokument ikke klart hentes pakken paa nytt.
  assert.ok(refetchAfter(busy));
  assert.ok(refetchAfter(notReady));
  assert.ok(!refetchAfter(limit));
  assert.equal(clockText("nb", new Date(2026, 0, 1, 7, 5)), "07.05");
});

test("feilkodene: Retry-After leses fra headeren paa svaret", async () => {
  const request = async () =>
    new Response(JSON.stringify({ detail: { code: "listing_text_daily_limit", limit: 10 } }), { status: 429, headers: { "Retry-After": "600" } });
  const err = await orderListingText(request, { id: "asg_1", order: {}, idempotencyKey: "k" }).catch((e: unknown) => e);
  assert.ok(err instanceof ListingTextError);
  assert.equal(err.retryAfter, 600);
});

// --- hentingen ---------------------------------------------------------------

test("hentingen: hvert 4. sekund uten basis, og stopper naar statusen ikke lenger er processing", async () => {
  assert.equal(LISTING_TEXT_POLL_MS, 4_000);
  assert.equal(LISTING_TEXT_POLL_MAX_MS, 15 * 60_000);
  const statuses = ["processing", "processing", "to_review"];
  const paths: string[] = [];
  const request = async (path: string) => {
    paths.push(path);
    return new Response(JSON.stringify({ assignment_id: "asg_1", display_status: statuses[paths.length - 1] }), { status: 200 });
  };
  const timers: { fn: () => void; ms: number }[] = [];
  let calls = 0;
  startAutoRefresh({
    // Som reload i useListingText: `working` er processing.
    refresh: async () => {
      calls++;
      const p = await getListingText(request, "asg_1");
      return { ok: true, working: p.displayStatus === "processing" };
    },
    hidden: () => false,
    now: () => 0,
    setTimer: (fn, ms) => {
      timers.push({ fn, ms });
      return timers.length;
    },
    clearTimer: () => {},
    maxMs: LISTING_TEXT_POLL_MAX_MS,
    intervalMs: LISTING_TEXT_POLL_MS,
  });
  for (let i = 0; i < 3; i++) {
    const timer = timers[i];
    assert.equal(timer.ms, 4_000);
    timer.fn();
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.equal(calls, 3);
  assert.equal(timers.length, 3, "ingen ny henting etter to_review");
  assert.deepEqual(paths, Array(3).fill("/v1/assignments/asg_1/listing-text"));
});

test("hentingen: siden henter bare mens processing, med 4 s og taket", () => {
  const src = withoutComments(read("components/annonsetekst/ListingTextOrder.tsx"));
  assert.match(src, /useAutoRefresh\(view === "processing", text\.reload, 0, LISTING_TEXT_POLL_MAX_MS, LISTING_TEXT_POLL_MS\)/);
  const hook = withoutComments(read("hooks/useListingText.ts"));
  assert.match(hook, /getListingText\(requestRef\.current, assignmentId\)/, "uten includeBasis");
  assert.match(hook, /working: pkg\.displayStatus === "processing"/);
});

// --- sidene ------------------------------------------------------------------

test("sidene: ingen synlig tekst skrevet rett inn, og ingen fetch eller API_BASE", () => {
  for (const rel of [PAGE, ...NEW_COMPONENTS]) {
    assert.deepEqual(literalTextsInFile(read(rel)), [], rel);
    assert.doesNotMatch(withoutComments(read(rel)), /\bfetch\(|API_BASE/, rel);
  }
});

test("sidene: ingen console, og lenken eller tokenet havner aldri i adressen", () => {
  for (const rel of [PAGE, ...NEW_COMPONENTS, ...NEW_MODULES]) {
    const src = withoutComments(read(rel));
    assert.doesNotMatch(src, /\bconsole\./, rel);
    assert.doesNotMatch(src, /router\.(push|replace)|history\.(push|replace)State|location\.(href|assign)/, rel);
  }
  // Lenken lagres bare privat i koeen, ikke i radene som gaar til React.
  const queue = withoutComments(read("lib/documentUpload.ts"));
  const row = queue.match(/export interface DocRow \{([\s\S]*?)\n\}/);
  assert.ok(row);
  assert.doesNotMatch(row[1], /url|token|link/i);
});

test("sidene: bildene i ordren som miniatyrer, notatet med teller, og dokumentene med slippfelt", () => {
  const form = withoutComments(read("components/annonsetekst/ListingTextOrderForm.tsx"));
  assert.match(form, /"listingText\.order\.imagesHint"/);
  assert.match(form, /<img src=\{image\.thumbUrl\} alt="" loading="lazy"/);
  assert.match(form, /maxLength=\{NOTE_MAX_CHARS\}/);
  assert.match(form, /"listingText\.order\.noteCount", \{ n: chars, max: NOTE_MAX_CHARS \}/);
  assert.match(form, /"listingText\.order\.noteHint"/);
  const panel = withoutComments(read("components/annonsetekst/DocumentUploadPanel.tsx"));
  assert.match(panel, /accept=\{DOCUMENT_ACCEPT\}/);
  assert.match(panel, /onDrop=\{onDrop\}/);
  assert.match(panel, /role="progressbar"/);
  for (const key of ["queued", "uploading", "checking", "ready", "rejected", "failed", "aborted", "abort", "retry", "remove"]) {
    assert.match(panel, new RegExp(`"listingText\\.docs\\.${key}"`), key);
  }
});

test("ordresiden: lenken i toppen av spilleren, med samme regel og hjelpefunksjon som bildesiden", () => {
  for (const rel of ["components/ordre/AssignmentPlayer.tsx", "components/ordre/OrderImages.tsx"]) {
    const src = withoutComments(read(rel));
    assert.match(src, /const listingText = useListingTextAccess\(\) === "yes";/, rel);
    assert.match(src, /<ButtonLink variant="secondary" href=\{listingTextHref\(assignmentId\)\}>\s*\{t\(locale, "listingText\.page\.fromOrder"\)\}/, rel);
  }
  const player = withoutComments(read("components/ordre/AssignmentPlayer.tsx"));
  const actions = player.match(/actions=\{([\s\S]*?)\n {10}\}/);
  assert.ok(actions, "actions i PageHeader");
  assert.match(actions[1], /"player\.orderMore"/);
  assert.match(actions[1], /listingTextHref\(assignmentId\)/);
});

// --- mock-modusen ------------------------------------------------------------

test("mock: bare med NODE_ENV development og ?mock=1, og lastet med import() inne i grenen", () => {
  const page = withoutComments(read(PAGE));
  assert.match(
    page,
    /const ListingTextMock =\s*process\.env\.NODE_ENV === "development"\s*\?\s*lazy\(\(\) => import\("@\/app\/components\/annonsetekst\/ListingTextMock"\)/
  );
  assert.match(page, /if \(process\.env\.NODE_ENV === "development" && ListingTextMock !== null && query\.mock === "1"\)/);
  // Ingen fil importerer mock-koden direkte (bare den ene import() over, og komponenten selv).
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".test.ts")) {
        const rel = relative(APP_DIR, full);
        const src = withoutComments(readFileSync(full, "utf8"));
        if (/^import [^;]*listingTextMock|^import [^;]*\/ListingTextMock"/m.test(src) && rel !== "components/annonsetekst/ListingTextMock.tsx") {
          offenders.push(rel);
        }
      }
    }
  };
  walk(APP_DIR);
  assert.deepEqual(offenders, []);
  // Markoeren staar bare i mock-modulen.
  assert.equal(MOCK_MARKER, "listing-text-mock-marker-v1");
});

test("mock: utelatt i prod-bygget (sjekkes naar .next har et prod-bygg)", (t) => {
  const next = join(ROOT, ".next");
  if (!existsSync(join(next, "BUILD_ID"))) {
    t.skip("ingen prod-bygg i .next (kjoer npm run build)");
    return;
  }
  const hits: string[] = [];
  const walk = (dir: string) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".js") && statSync(full).size < 20_000_000 && readFileSync(full, "utf8").includes(MOCK_MARKER)) {
        hits.push(relative(next, full));
      }
    }
  };
  walk(join(next, "static"));
  walk(join(next, "server"));
  assert.deepEqual(hits, []);
});

test("mock: den falske backenden gaar fra bestilling gjennom trinnene til to_review", async () => {
  const mock = createListingTextMock("asg_mock", { latencyMs: 0 });
  const first = await getListingText(mock.request, "asg_mock");
  assert.equal(first.displayStatus, "not_ordered");
  const ordered = await orderListingText(mock.request, { id: "asg_mock", order: { note: "Hei" }, idempotencyKey: "k1" });
  assert.equal(ordered.displayStatus, "processing");
  assert.equal(ordered.lastRun?.step, "reading_documents");
  const steps: (string | null)[] = [];
  let p = ordered;
  while (p.displayStatus === "processing") {
    p = await getListingText(mock.request, "asg_mock");
    steps.push(p.lastRun?.step ?? null);
  }
  assert.deepEqual(steps, ["viewing_images", "planning", "writing", "checking", null]);
  assert.equal(p.displayStatus, "to_review");
});

test("mock: koeen med falsk XHR laster opp med fremdrift og blir Klar", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval", "setTimeout"] });
  const mock = createListingTextMock("asg_mock", { latencyMs: 0 });
  const progress: number[] = [];
  const queue = new DocumentQueue({
    request: mock.request,
    assignmentId: "asg_mock",
    xhr: mock.xhr,
    onChange: (rows) => {
      if (rows[0]?.state === "uploading" && progress.at(-1) !== rows[0].progress) progress.push(rows[0].progress);
    },
  });
  queue.add([new File([new TextEncoder().encode("%PDF-1.7")], "Salgsoppgave.pdf")]);
  for (let i = 0; i < 60 && queue.rows[0].state !== "ready"; i++) {
    t.mock.timers.tick(150);
    for (let j = 0; j < 10; j++) await new Promise((resolve) => setImmediate(resolve));
  }
  assert.equal(queue.rows[0].state, "ready");
  assert.ok(progress.length >= 10, String(progress));
  assert.equal(progress.at(-1), 100);
  const xhr: UploadXhr = new MockXhr();
  assert.equal(typeof xhr.abort, "function");
});

// --- ordlista ----------------------------------------------------------------

const NEW_UI: UiKey[] = [
  "listingText.order.imagesTitle",
  "listingText.order.imagesHint",
  "listingText.order.noImages",
  "listingText.order.noteLabel",
  "listingText.order.noteHint",
  "listingText.order.noteCount",
  "listingText.order.submit",
  "listingText.order.sending",
  "listingText.order.blockUploading",
  "listingText.order.blockNoMaterial",
  "listingText.order.blockNoteTooLong",
  "listingText.order.limitAt",
  "listingText.order.capAt",
  "listingText.order.failedTitle",
  "listingText.docs.title",
  "listingText.docs.hint",
  "listingText.docs.noDocsHint",
  "listingText.docs.dropTitle",
  "listingText.docs.dropActive",
  "listingText.docs.choose",
  "listingText.docs.queued",
  "listingText.docs.uploading",
  "listingText.docs.uploadingSr",
  "listingText.docs.progressLabel",
  "listingText.docs.checking",
  "listingText.docs.ready",
  "listingText.docs.rejected",
  "listingText.docs.failed",
  "listingText.docs.aborted",
  "listingText.docs.abort",
  "listingText.docs.retry",
  "listingText.docs.remove",
  "listingText.processing.hint",
  "listingText.processing.steps",
  "listingText.ready.title",
  "listingText.ready.placeholder",
  "listingText.load.error",
  "listingText.mock.banner",
];

test("ordlista: de nye noeklene paa nb og en, med samme plassholdere", () => {
  for (const key of NEW_UI) {
    const nb = DICTIONARIES.nb.ui[key];
    const en = DICTIONARIES.en.ui[key];
    assert.ok(nb && en, key);
    assert.notEqual(nb, en, key);
    const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    assert.deepEqual(vars(nb), vars(en), key);
  }
  assert.equal(t("nb", "listingText.docs.uploading", { n: 42 }), "Laster opp 42 %");
  assert.equal(t("nb", "listingText.docs.rejected", { reason: DICTIONARIES.nb.codes.listingTextDocumentReject.not_pdf }), "Avvist: Ikke en PDF.");
  assert.equal(t("nb", "listingText.docs.checking"), "Kontrolleres");
  assert.equal(t("nb", "listingText.docs.ready"), "Klar");
  assert.equal(t("nb", "listingText.order.noteLabel"), "Noe vi bør vite?");
  assert.equal(t("nb", "listingText.order.submit"), "Bestill tekstpakke");
  assert.equal(t("nb", "listingText.order.imagesHint"), "Bildene i ordren brukes automatisk.");
  assert.equal(t("nb", "listingText.ready.title"), "Tekstpakken er klar");
  assert.match(t("nb", "listingText.order.noteHint"), /«oppgitt av megler»/);
});

test("ordlista: feilkodene for opplastingen og avvisningene paa nb og en", () => {
  for (const locale of ["nb", "en"] as const) {
    const errors = DICTIONARIES[locale].codes.listingTextError;
    for (const code of [
      "invalid_mime_type",
      "upload_failed",
      "not_uploaded",
      "network",
      "invalid_document",
      "document_too_large",
      "document_limit",
      "listing_text_busy",
      "document_not_ready",
      "listing_text_daily_limit",
      "listing_text_daily_cap",
      "no_material",
    ]) {
      assert.ok(Object.hasOwn(errors, code), `${locale} ${code}`);
    }
    const reject = DICTIONARIES[locale].codes.listingTextDocumentReject;
    for (const code of ["not_pdf", "size_mismatch", "too_large"]) assert.ok(Object.hasOwn(reject, code), `${locale} ${code}`);
  }
});
