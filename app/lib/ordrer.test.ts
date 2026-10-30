import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AssignmentError,
  assignmentErrorCode,
  imageStatusKey,
  MAX_IMAGES_PER_ASSIGNMENT,
  parseAssignment,
  parseImage,
  type AssignmentImage,
  type AssignmentSummary,
} from "./assignments.ts";
import { codeText, DICTIONARIES, t, uploadErrorText } from "./i18n/index.ts";
import {
  ADDRESS_MAX,
  appendOrders,
  applyMove,
  applyRemove,
  applyRoom,
  ASSIGNMENT_NO_MAX,
  canRemove,
  checkNewOrder,
  imageCountText,
  mergeUploaded,
  moveTarget,
  NEW_ORDER_PATH,
  normalizeRoom,
  orderImagesHref,
  orderMeta,
  queueCapacity,
  ROOM_MAX,
  uploadCounts,
  uploadSummary,
} from "./ordrer.ts";
import { ENABLED, isPageEnabled, navLinks, ORDERS_PATH } from "./services.ts";
import { UploadQueue, type UploadRow } from "./uploadQueue.ts";
import { literalTextsInFile, withoutComments } from "./testing/jsxText.ts";

// api.ts kaster ved import uten NEXT_PUBLIC_API_BASE: dummy-verdi foer dynamisk
// import, og fetch er falsk. Ingen kall mot backend.
process.env.NEXT_PUBLIC_API_BASE = "http://api.test";
const api = await import("./api.ts");
const { createAssignment, listAssignments, uploadAssignmentImage, deleteAssignmentImage } = await import("./assignments.ts");

/**
 * Ordrene (TG-NEW-277, FE-2): reglene for /ordrer, /ordrer/ny og bildene
 * (lib/ordrer.ts), feltene fra backend #270 og koblingen av modulene til
 * authedFetch og API_BASE. Sidene leses som tekst (node --test laster ikke .tsx).
 */

const APP_DIR = fileURLToPath(new URL("..", import.meta.url));
const read = (rel: string) => readFileSync(join(APP_DIR, rel), "utf8");

const PAGES = ["(app)/ordrer/page.tsx", "(app)/ordrer/ny/page.tsx", "(app)/ordrer/[id]/bilder/page.tsx"];
const COMPONENTS = ["components/ordre/OrderImages.tsx", "components/ordre/UploadPanel.tsx", "components/ordre/ImageCard.tsx"];

function image(id: string, position: number, extra: Partial<AssignmentImage> = {}): AssignmentImage {
  return {
    id,
    position,
    room: null,
    fileName: `${id}.jpg`,
    width: 4000,
    height: 3000,
    thumbUrl: null,
    originalUrl: null,
    displayStatus: "original_only",
    results: [],
    ...extra,
  };
}

function row(id: string, state: UploadRow["state"], extra: Partial<UploadRow> = {}): UploadRow {
  return { id, file: new File([], `${id}.jpg`), key: `k-${id}`, state, failure: null, image: null, ...extra };
}

const ids = (images: readonly AssignmentImage[]) => images.map((i) => `${i.id}:${i.position}`);

// --- flagget og menyen -----------------------------------------------------------

test("FE-2: flagget er paa, /ordrer er aapen og staar i menyen ved siden av Historikk", () => {
  assert.equal(ENABLED.ordrer, true);
  assert.equal(ORDERS_PATH, "/ordrer");
  assert.equal(isPageEnabled(ORDERS_PATH), true);
  const hrefs = navLinks().map((l) => l.href);
  assert.equal(hrefs.indexOf("/ordrer") + 1, hrefs.indexOf("/history"));
  assert.equal(t("nb", "nav.orders"), "Ordrer");
  assert.equal(t("en", "nav.orders"), "Orders");
  const nav = withoutComments(read("components/AppNav.tsx"));
  assert.match(nav, /orders: FolderOpen,/);
});

test("FE-2: alle tre sidene sjekker flagget paa /ordrer og viser ServiceUnavailable naar det er av", () => {
  for (const rel of PAGES) {
    const src = withoutComments(read(rel));
    assert.match(src, /^"use client";/, rel);
    assert.match(src, /if \(!isPageEnabled\(ORDERS_PATH\)\) return <ServiceUnavailable \/>;/, rel);
  }
  // Bildene: params med use(), og ny tilstand (og ny koe) per ordre. FE-3: `?startet=` fra oppsummeringen.
  const images = withoutComments(read("(app)/ordrer/[id]/bilder/page.tsx"));
  assert.match(images, /const \{ id \} = use\(params\);/);
  assert.match(images, /<OrderImages key=\{id\} assignmentId=\{id\} started=\{started\} \/>/);
});

test("FE-2: ingen synlig tekst skrevet rett inn i sidene og komponentene", () => {
  for (const rel of [...PAGES, ...COMPONENTS]) {
    assert.deepEqual(literalTextsInFile(read(rel)), [], rel);
  }
});

// --- lista -----------------------------------------------------------------------

const summary = (id: string, extra: Partial<AssignmentSummary> = {}): AssignmentSummary => ({
  id,
  address: "Storgata 12",
  assignmentNo: null,
  createdAt: "2026-10-30T10:00:00+00:00",
  updatedAt: "2026-10-30T10:00:00+00:00",
  counts: { images: 0, results: 0, processing: 0, toReview: 0, needsAnswer: 0, approved: 0, notUsed: 0, failed: 0 },
  coverThumbUrl: null,
  ...extra,
});

test("lista: stiene, og linja under adressen med oppdragsnummer og antall bilder", () => {
  assert.equal(NEW_ORDER_PATH, "/ordrer/ny");
  assert.equal(orderImagesHref("a b/c"), "/ordrer/a%20b%2Fc/bilder");
  assert.equal(imageCountText("nb", 1), "1 bilde");
  assert.equal(imageCountText("nb", 8), "8 bilder");
  assert.equal(imageCountText("en", 0), "0 images");
  const counts = { ...summary("x").counts, images: 8 };
  assert.equal(orderMeta("nb", summary("x", { assignmentNo: "1234-56", counts })), "Oppdrag 1234-56 · 8 bilder");
  assert.equal(orderMeta("nb", summary("x")), "0 bilder");
});

test("lista: «Vis flere» legger neste side bak, uten dubletter", () => {
  const merged = appendOrders([summary("a"), summary("b")], [summary("b"), summary("c")]);
  assert.deepEqual(merged.map((o) => o.id), ["a", "b", "c"]);
});

test("lista: siden bruker listAssignments med cursor, nyeste foerst fra backend, og lenker til ordren (FE-4: orderHref)", () => {
  const src = withoutComments(read("(app)/ordrer/page.tsx"));
  assert.match(src, /listAssignments\(request, \{ limit: ORDERS_PAGE_SIZE \}\)/);
  assert.match(src, /listAssignments\(request, \{ limit: ORDERS_PAGE_SIZE, cursor \}\)/);
  assert.match(src, /\{cursor !== null && \(/);
  assert.match(src, /href=\{orderHref\(order\)\}/);
  assert.match(src, /<ButtonLink href=\{NEW_ORDER_PATH\}>\{t\(locale, "orders\.new"\)\}<\/ButtonLink>/);
  assert.match(src, /t\(locale, "orders\.emptyTitle"\)/);
  assert.match(src, /t\(locale, "orders\.emptyBody"\)/);
});

// --- ny ordre --------------------------------------------------------------------

test("ny ordre: adressen er paakrevd og trimmes; tomt oppdragsnummer sendes ikke", () => {
  assert.deepEqual(checkNewOrder("   ", "123"), { ok: false, key: "orders.addressRequired" });
  assert.deepEqual(checkNewOrder(" Storgata 12 ", "  "), { ok: true, address: "Storgata 12", assignmentNo: null });
  assert.deepEqual(checkNewOrder("Storgata 12", " 1234-56 "), { ok: true, address: "Storgata 12", assignmentNo: "1234-56" });
  assert.equal(ADDRESS_MAX, 200);
  assert.equal(ASSIGNMENT_NO_MAX, 40);
});

test("ny ordre: skjemaet sender til createAssignment og gaar videre til bildene med replace", () => {
  const src = withoutComments(read("(app)/ordrer/ny/page.tsx"));
  assert.match(src, /createAssignment\(assignmentRequest\(getToken\), \{/);
  assert.match(src, /router\.replace\(orderImagesHref\(order\.id\)\);/);
  assert.match(src, /maxLength=\{ADDRESS_MAX\}/);
  assert.match(src, /maxLength=\{ASSIGNMENT_NO_MAX\}/);
  assert.match(src, /htmlFor="order-address"/);
  assert.match(src, /htmlFor="order-no"/);
  // Dobbeltklikk gir ikke to ordrer.
  assert.match(src, /if \(submitting\) return;/);
});

// --- backend #270: feltene og feilkodene -----------------------------------------

test("#270: bildet kan ha display_status failed (ingen godkjent, noe feilet), med egen tekst", () => {
  const img = parseImage({ id: "i1", position: 1, display_status: "failed", results: [] });
  assert.equal(img?.displayStatus, "failed");
  assert.equal(t("nb", imageStatusKey("failed")), "Feilet");
  assert.equal(t("en", imageStatusKey("failed")), "Failed");
});

test("#270: svaret paa POST /v1/assignments har counts, men ikke slug eller images", () => {
  const a = parseAssignment({
    id: "a1",
    address: "Storgata 12, 0182 Oslo",
    assignment_no: null,
    created_at: "2026-10-30T10:00:00+00:00",
    updated_at: "2026-10-30T10:00:00+00:00",
    counts: { images: 0, results: 0, processing: 0, to_review: 0, needs_answer: 0, approved: 0, not_used: 0, failed: 0 },
  });
  assert.ok(a);
  assert.equal(a.slug, "storgata-12-0182-oslo");
  assert.deepEqual(a.images, []);
});

test("#270: svaret paa opplastingen og PATCH har ingen results; parsingen gir tom liste", () => {
  const img = parseImage({
    id: "i1",
    position: 3,
    room: null,
    file_name: null,
    width: 4000,
    height: 3000,
    thumb_url: "https://x/t.jpg",
    original_url: "https://x/o.jpg",
    display_status: "original_only",
  });
  assert.ok(img);
  assert.deepEqual(img.results, []);
  assert.equal(img.fileName, "");
  assert.equal(canRemove(img), true);
});

test("assignmentErrorCode: koden fra backend, 404 og 503 uten kode, annen status og nettfeil", () => {
  assert.equal(assignmentErrorCode(new AssignmentError(409, "image_has_results")), "image_has_results");
  assert.equal(assignmentErrorCode(new AssignmentError(400, "invalid_assignment", { field: "address" })), "invalid_assignment");
  assert.equal(assignmentErrorCode(new AssignmentError(404, null)), "not_found");
  assert.equal(assignmentErrorCode(new AssignmentError(503, null)), "assignments_unavailable");
  assert.equal(assignmentErrorCode(new AssignmentError(500, null)), "http_500");
  assert.equal(assignmentErrorCode(new Error("Not authenticated")), "network");
  assert.equal(assignmentErrorCode(new TypeError("Failed to fetch")), "network");
});

test("feilkodene fra #270 har egen tekst paa nb og en; ukjent gir den generelle", () => {
  for (const code of [
    "invalid_assignment",
    "invalid_image_patch",
    "image_has_results",
    "assignment_image_limit",
    "assignments_unavailable",
    "invalid_cursor",
    "not_found",
    "network",
  ]) {
    for (const locale of ["nb", "en"] as const) {
      assert.notEqual(codeText(locale, "assignmentError", code), DICTIONARIES[locale].generic.assignmentError, `${locale} ${code}`);
    }
  }
  assert.equal(codeText("nb", "assignmentError", "http_500"), "Noe gikk galt. Prøv igjen.");
  assert.match(codeText("nb", "assignmentError", "image_has_results"), /resultater/);
});

test("opplastingen: grunnen unreadable og 503 fra #270 har egen tekst; HEIC som foer", () => {
  assert.equal(uploadErrorText("nb", "unsupported_image", "unreadable"), "Bildet kunne ikke leses. Lagre det på nytt som JPG eller PNG.");
  assert.notEqual(uploadErrorText("en", "unsupported_image", "unreadable"), uploadErrorText("en", "unsupported_image", "format"));
  assert.match(uploadErrorText("nb", "unsupported_image", "heic"), /^HEIC kan ikke brukes/);
  assert.equal(uploadErrorText("nb", "unsupported_image", "clap"), uploadErrorText("nb", "unsupported_image", "format"));
  assert.match(uploadErrorText("nb", "assignments_unavailable", null), /ikke svarer/);
  assert.equal(t("nb", "upload.hint"), "JPG eller PNG, høyst 25 MB per bilde.");
});

// --- koblingen: assignmentRequest i api.ts ----------------------------------------

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

function fakeFetch(responses: Response[]): Call[] {
  const calls: Call[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: String(input),
      method: init?.method ?? "GET",
      headers: { ...(init?.headers as Record<string, string>) },
      body: init?.body,
    });
    const res = responses.shift();
    assert.ok(res, "flere kall enn ventet");
    return res;
  }) as typeof fetch;
  return calls;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

test("kobling: kallet gaar til API_BASE + stien med Bearer-token, og ordren parses", async () => {
  const calls = fakeFetch([json(201, { id: "a1", address: "Storgata 12", counts: {} })]);
  const request = api.assignmentRequest(async () => "tok");
  const order = await createAssignment(request, { address: "Storgata 12", assignmentNo: "1234" });
  assert.equal(order.id, "a1");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://api.test/v1/assignments");
  assert.equal(calls[0].method, "POST");
  assert.equal(calls[0].headers.Authorization, "Bearer tok");
  assert.equal(calls[0].headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(String(calls[0].body)), { address: "Storgata 12", assignment_no: "1234" });
});

test("kobling: 401 gir ett nytt forsoek med ferskt token (skipCache), som resten av appen", async () => {
  const calls = fakeFetch([json(401, { detail: "expired" }), json(200, { items: [], next_cursor: null })]);
  const asked: (boolean | undefined)[] = [];
  const request = api.assignmentRequest(async (o) => {
    asked.push(o?.skipCache);
    return o?.skipCache ? "fresh" : "old";
  });
  const page = await listAssignments(request, { limit: 20, cursor: "abc" });
  assert.deepEqual(page, { items: [], nextCursor: null });
  assert.equal(calls[0].url, "http://api.test/v1/assignments?limit=20&cursor=abc");
  assert.deepEqual(asked, [undefined, true]);
  assert.equal(calls[1].headers.Authorization, "Bearer fresh");
});

test("kobling: opplastingen sender multipart med Idempotency-Key og token; 409 gir koden", async () => {
  const calls = fakeFetch([
    json(201, { id: "i1", position: 1, display_status: "original_only" }),
    json(409, { detail: { code: "assignment_image_limit", limit: 60 } }),
  ]);
  const request = api.assignmentRequest(async () => "tok");
  const file = new File([new Uint8Array([0xff, 0xd8, 0xff])], "IMG_1.jpg", { type: "image/jpeg" });
  const img = await uploadAssignmentImage(request, { id: "a1", file, idempotencyKey: "key-1" });
  assert.equal(img.id, "i1");
  assert.equal(calls[0].url, "http://api.test/v1/assignments/a1/images");
  assert.equal(calls[0].headers["Idempotency-Key"], "key-1");
  assert.equal(calls[0].headers.Authorization, "Bearer tok");
  assert.ok(calls[0].body instanceof FormData);
  assert.equal(calls[0].headers["Content-Type"], undefined, "nettleseren setter multipart-grensen selv");
  await assert.rejects(
    uploadAssignmentImage(request, { id: "a1", file, idempotencyKey: "key-2" }),
    (err: unknown) => err instanceof AssignmentError && err.code === "assignment_image_limit" && err.detail.limit === 60
  );
});

test("kobling: DELETE med 409 image_has_results og 404 uten kode", async () => {
  fakeFetch([json(409, { detail: { code: "image_has_results" } }), json(404, { detail: "not found" })]);
  const request = api.assignmentRequest(async () => "tok");
  await assert.rejects(deleteAssignmentImage(request, { id: "a1", imageId: "i1" }), (err: unknown) => {
    return assignmentErrorCode(err) === "image_has_results";
  });
  await assert.rejects(deleteAssignmentImage(request, { id: "a1", imageId: "i1" }), (err: unknown) => {
    return assignmentErrorCode(err) === "not_found";
  });
});

test("kobling: api.ts lager kallet med authedFetch og API_BASE; sidene bruker det, ikke fetch direkte", () => {
  const src = withoutComments(read("lib/api.ts"));
  assert.match(
    src,
    /export function assignmentRequest\(getToken: GetToken, onRetry\?: \(\) => void\): AssignmentRequest \{\s*return \(path, init\) => authedFetch\(`\$\{API_BASE\}\$\{path\}`, init, getToken, onRetry\);/
  );
  for (const rel of [...PAGES, ...COMPONENTS]) {
    assert.doesNotMatch(withoutComments(read(rel)), /\bfetch\(|API_BASE/, rel);
  }
  const images = withoutComments(read("components/ordre/OrderImages.tsx"));
  assert.match(images, /const request = useMemo\(\(\) => assignmentRequest\(getToken\), \[getToken\]\);/);
  assert.match(images, /uploadAssignmentImage\(requestRef\.current, \{ id: assignmentId, file, idempotencyKey: key \}\)/);
  assert.match(images, /new UploadQueue\(\{/);
});

// --- opplastingen -----------------------------------------------------------------

test("opplastingen: tellingen og oppsummeringen; taket vises én gang", () => {
  const rows = [
    row("u1", "done"),
    row("u2", "uploading"),
    row("u3", "queued"),
    row("u4", "failed", { failure: { code: "network", reason: null } }),
    row("u5", "failed", { failure: { code: "unsupported_image", reason: "heic" } }),
  ];
  const c = uploadCounts(rows);
  assert.deepEqual(c, { done: 1, active: 2, failed: 2, retryable: 1, limit: false });
  assert.equal(uploadSummary("nb", c), "1 lastet opp · 2 lastes opp eller venter · 2 ikke lastet opp");
  assert.equal(uploadSummary("nb", uploadCounts([])), "");
  assert.equal(uploadCounts([row("u6", "failed", { failure: { code: "assignment_image_limit", reason: null } })]).limit, true);
});

test("opplastingen: ferdige bilder legges inn etter position, uten dubletter, og samme array uten nye", () => {
  const images = [image("a", 1), image("b", 2)];
  assert.equal(mergeUploaded(images, [row("u1", "uploading")]), images);
  const done = row("u1", "done", { image: image("c", 3) });
  const same = row("u2", "done", { image: image("c", 3) });
  const merged = mergeUploaded(images, [same, done]);
  assert.deepEqual(ids(merged), ["a:1", "b:2", "c:3"]);
  // Svar i en annen rekkefoelge enn plassene: position avgjoer.
  const out = mergeUploaded([image("a", 1)], [row("u3", "done", { image: image("e", 3) }), row("u4", "done", { image: image("d", 2) })]);
  assert.deepEqual(ids(out), ["a:1", "d:2", "e:3"]);
});

test("opplastingen: tallet til setCapacity regner de ferdige radene inn igjen", () => {
  assert.equal(queueCapacity(0, []), 60);
  assert.equal(queueCapacity(10, [row("u1", "done"), row("u2", "uploading")]), 51);
  assert.equal(queueCapacity(80, []), 0);
});

test("opplastingen: med 59 bilder kommer ett til; etter at ett er fjernet, gir «Last opp paa nytt» plass til ett til", async () => {
  let next = 60;
  const queue = new UploadQueue({
    send: async () => image(`n${next}`, next++),
    capacity: MAX_IMAGES_PER_ASSIGNMENT,
    newKey: (() => {
      let k = 0;
      return () => `key-${++k}`;
    })(),
    check: async () => null,
  });
  queue.setCapacity(queueCapacity(59, queue.rows));
  queue.add([new File([], "a.jpg"), new File([], "b.jpg")]);
  await queue.idle();
  assert.deepEqual(queue.rows.map((r) => r.state), ["done", "failed"]);
  assert.equal(uploadCounts(queue.rows).limit, true);
  // Siden fjerner et bilde (60 → 59) og gir koeen det nye tallet.
  queue.setCapacity(queueCapacity(59, queue.rows));
  assert.equal(queue.retryFailed(), 1);
  await queue.idle();
  assert.deepEqual(queue.rows.map((r) => r.state), ["done", "done"]);
  // Samme noekkel ved nytt forsoek (Idempotency-Key).
  assert.deepEqual(queue.rows.map((r) => r.key), ["key-1", "key-2"]);
});

test("opplastingen: filvelgeren tar mange filer, JPG og PNG, og dra og slipp; status per fil for skjermleser", () => {
  const src = withoutComments(read("components/ordre/UploadPanel.tsx"));
  assert.match(src, /type="file"\s+multiple\s+accept=\{UPLOAD_ACCEPT\}/);
  assert.match(src, /onDrop=\{onDrop\}/);
  assert.match(src, /e\.preventDefault\(\);\s*setDragging\(false\);\s*const files = Array\.from\(e\.dataTransfer\.files\);/);
  assert.match(src, /<ul aria-live="polite" aria-relevant="text"/);
  assert.match(src, /<li key=\{row\.id\} aria-atomic="true"/);
  assert.match(src, /uploadErrorText\(locale, row\.failure\.code, row\.failure\.reason\)/);
  assert.match(src, /t\(locale, "upload\.hint"\)/);
  assert.match(src, /<Button variant="secondary" onClick=\{onRetry\}>/);
  const images = withoutComments(read("components/ordre/OrderImages.tsx"));
  assert.match(images, /onRetry=\{\(\) => void queue\.retryFailed\(\)\}/);
});

// --- rom, flytt og fjern ----------------------------------------------------------

test("rom: trimmet, tomt fjerner rommet; bare rommet byttes (PATCH-svaret har ikke results)", () => {
  assert.equal(normalizeRoom("  Stue "), "Stue");
  assert.equal(normalizeRoom("   "), null);
  assert.equal(ROOM_MAX, 40);
  const withResult = image("a", 1, { results: [{ resultId: "r1" } as AssignmentImage["results"][number]] });
  const images = [withResult, image("b", 2)];
  const out = applyRoom(images, "a", "Kjøkken");
  assert.equal(out[0].room, "Kjøkken");
  assert.equal(out[0].results.length, 1);
  assert.equal(out[1], images[1]);
});

test("flytt: plassen regnes fra rekkefoelgen, null ytterst; listen nummereres 1..n", () => {
  const images = [image("a", 1), image("b", 2), image("c", 4)];
  assert.equal(moveTarget(images, "a", "up"), null);
  assert.equal(moveTarget(images, "c", "down"), null);
  assert.equal(moveTarget(images, "c", "up"), 2);
  assert.equal(moveTarget(images, "a", "down"), 2);
  assert.equal(moveTarget(images, "x", "up"), null);
  assert.deepEqual(ids(applyMove(images, "c", 2)), ["a:1", "c:2", "b:3"]);
  assert.deepEqual(ids(applyMove(images, "a", 3)), ["b:1", "c:2", "a:3"]);
});

test("fjern: bare uten resultater; de etter rykker opp", () => {
  assert.equal(canRemove(image("a", 1)), true);
  assert.equal(canRemove(image("a", 1, { results: [{ resultId: "r1" } as AssignmentImage["results"][number]] })), false);
  assert.deepEqual(ids(applyRemove([image("a", 1), image("b", 2), image("c", 3)], "b")), ["a:1", "c:2"]);
});

test("bildene: rom, flytt og fjern gaar til PATCH og DELETE; 409 image_has_results henter ordren paa nytt", () => {
  const src = withoutComments(read("components/ordre/OrderImages.tsx"));
  assert.match(src, /patchAssignmentImage\(requestRef\.current, \{ id: assignmentId, imageId: image\.id, room \}\)/);
  assert.match(src, /patchAssignmentImage\(requestRef\.current, \{ id: assignmentId, imageId: image\.id, position \}\)/);
  assert.match(src, /deleteAssignmentImage\(requestRef\.current, \{ id: assignmentId, imageId: image\.id \}\)/);
  assert.match(src, /if \(code === "image_has_results"\) void fetchAssignment\(\);/);
  // Et fjernet bilde tas ut av koeen, ellers kommer det tilbake med mergeUploaded.
  assert.match(src, /if \(row !== undefined\) queue\.remove\(row\.id\);/);
  assert.match(src, /queue\.setCapacity\(queueCapacity\(next\.length, queue\.rows\)\);/);
  // FE-3: «Videre til tjenester» (i fremdriftslinja, Dag 59) og «Bestill flere tjenester» gaar til brettet.
  assert.match(src, /<ButtonLink href=\{orderServicesHref\(assignmentId\)\}>\{t\(locale, "orders\.next"\)\}<\/ButtonLink>/);
  assert.match(src, /<ButtonLink variant="secondary" href=\{orderServicesHref\(assignmentId\)\}>\s*\{t\(locale, "orders\.orderMore"\)\}/);
  assert.equal(t("nb", "orders.next"), "Videre til tjenester");
  assert.equal(t("nb", "orders.orderMore"), "Bestill flere tjenester");
});

test("bildekortet: haandtaket og menyen har navn og er 44 px; «Fjern» bare uten resultater, med spoersmaal foerst", () => {
  const src = withoutComments(read("components/ordre/ImageCard.tsx"));
  assert.match(src, /const ICON_BUTTON = `inline-flex size-11 /);
  // FE-3 tillegg: pilknappene er borte; haandtaket og menyen «⋯» har navn.
  assert.doesNotMatch(src, /<Arrow(Up|Down)\b/);
  assert.match(src, /aria-label=\{t\(locale, "orders\.dragHandle", \{ n: number \}\)\}/);
  assert.match(src, /aria-label=\{t\(locale, "orders\.moveMenu", \{ n: number \}\)\}/);
  assert.match(src, /\) : removable \? \(/);
  assert.match(src, /t\(locale, "orders\.removeAsk"\)/);
  assert.match(src, /<label htmlFor=\{roomId\} className="sr-only">/);
  assert.match(src, /maxLength=\{ROOM_MAX\}/);
  assert.equal(t("nb", "orders.dragHandle", { n: 3 }), "Flytt bilde 3");
});
