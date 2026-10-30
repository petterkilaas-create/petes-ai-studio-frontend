import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { assignmentErrorCode, parseImage, type AssignmentImage, type AssignmentRequest } from "./assignments.ts";
import {
  deletedFileNames,
  deliveryCounts,
  deliveryExclude,
  deliveryFileCount,
  deliveryGroups,
  deliveryLinkText,
  deliverySummary,
  downloadZip,
  fileDetail,
  formatMegabytes,
  getDelivery,
  isIncluded,
  noteKey,
  noteLink,
  parseDelivery,
  zipButtonText,
} from "./delivery.ts";
import { downloadMarkedImage } from "./download.ts";
import { codeText, DICTIONARIES, t } from "./i18n/index.ts";
import { orderDeliveryHref } from "./ordrer.ts";
import { literalTextsInFile, withoutComments } from "./testing/jsxText.ts";

/**
 * FE-5 (TG-NEW-277): nedlastingen av ordren. Manifestet (K 2.8), `exclude`
 * fra av/paa, merknadene, ZIP-en (K 2.9) med feilkodene og filnavnet, og
 * sidene som tekst. Kallene gaar mot en falsk `request`; ingen backend.
 */

const APP_DIR = fileURLToPath(new URL("..", import.meta.url));
const read = (rel: string) => readFileSync(join(APP_DIR, rel), "utf8");

const PAGE = "(app)/ordrer/[id]/last-ned/page.tsx";
const COMPONENT = "components/ordre/OrderDelivery.tsx";

/** Som K 2.8: to bilder, ett med styling og skjul ansikter, ett med en merknad. */
const RAW = {
  zip_name: "storgata-12.zip",
  files: [
    { key: "img:i1", name: "storgata-12_01a_stue_original.jpg", kind: "original", image_id: "i1", marked: false, included: true, toggleable: false },
    {
      key: "res:r1",
      name: "storgata-12_01b_stue_styling-japandi_r01.jpg",
      kind: "result",
      image_id: "i1",
      result_id: "r1",
      version: 1,
      service_label: "Digital styling · Japandi",
      marked: true,
      included: true,
      toggleable: true,
    },
    {
      key: "res:r2",
      name: "storgata-12_01c_stue_skjul-ansikter_r01.jpg",
      kind: "result",
      image_id: "i1",
      result_id: "r2",
      version: 1,
      service_label: "Skjul ansikter",
      marked: false,
      included: true,
      toggleable: true,
    },
    { key: "img:i2", name: "storgata-12_02a_kjokken_original.jpg", kind: "original", image_id: "i2", marked: false, included: true, toggleable: false },
  ],
  notes: [{ image_id: "i2", code: "result_to_review", result_id: "r3" }],
  counts: { originals: 2, results: 2, total: 4 },
};

const MANIFEST = parseDelivery(RAW);

function image(id: string, position: number, room: string, results: unknown[] = []): AssignmentImage {
  const img = parseImage({ id, position, room, file_name: `${id}.jpg`, results });
  assert.ok(img);
  return img;
}

function respond(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** Et ZIP-svar i biter; `failAfter` bryter stroemmen etter saa mange biter. */
function zipResponse(chunks: number[], failAfter: number | null = null): Response {
  let i = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (failAfter !== null && i === failAfter) {
        controller.error(new TypeError("network error"));
        return;
      }
      if (i >= chunks.length) {
        controller.close();
        return;
      }
      controller.enqueue(new Uint8Array(chunks[i++]));
    },
  });
  return new Response(stream, { status: 200, headers: { "Content-Type": "application/zip" } });
}

function fakeRequest(res: Response | (() => Promise<Response>)) {
  const calls: { path: string; init: RequestInit }[] = [];
  const request: AssignmentRequest = async (path, init) => {
    calls.push({ path, init });
    return typeof res === "function" ? res() : res;
  };
  return { request, calls };
}

// --- manifestet --------------------------------------------------------------------

test("manifestet: filene i rekkefoelgen fra backend, originalen foer resultatene, og merknadene", () => {
  assert.equal(MANIFEST.zipName, "storgata-12.zip");
  assert.deepEqual(
    MANIFEST.files.map((f) => [f.name, f.kind, f.toggleable, f.marked]),
    [
      ["storgata-12_01a_stue_original.jpg", "original", false, false],
      ["storgata-12_01b_stue_styling-japandi_r01.jpg", "result", true, true],
      ["storgata-12_01c_stue_skjul-ansikter_r01.jpg", "result", true, false],
      ["storgata-12_02a_kjokken_original.jpg", "original", false, false],
    ]
  );
  assert.equal(MANIFEST.files[1].version, 1);
  assert.equal(MANIFEST.files[1].resultId, "r1");
  assert.equal(MANIFEST.files[0].resultId, null);
  assert.deepEqual(MANIFEST.notes, [{ imageId: "i2", code: "result_to_review", resultId: "r3" }]);
});

test("manifestet: rader uten key, name eller image_id hoppes over, og en original kan aldri tas ut", () => {
  const m = parseDelivery({
    files: [
      { key: "img:x", name: "x.jpg", kind: "original", image_id: "x", toggleable: true },
      { name: "y.jpg", kind: "result", image_id: "x" },
      { key: "res:z", kind: "result", image_id: "x" },
      "tull",
    ],
    notes: [{ code: "result_failed" }, { image_id: "x", code: "result_failed" }],
  });
  assert.equal(m.files.length, 1);
  assert.equal(m.files[0].toggleable, false);
  assert.deepEqual(m.notes, [{ imageId: "x", code: "result_failed", resultId: null }]);
  assert.deepEqual(parseDelivery(null), { zipName: null, files: [], notes: [] });
});

test("getDelivery: GET mot /delivery, og 404 blir not_found", async () => {
  const ok = fakeRequest(respond(200, RAW));
  const m = await getDelivery(ok.request, "a b");
  assert.equal(ok.calls[0].path, "/v1/assignments/a%20b/delivery");
  assert.equal(ok.calls[0].init.method, "GET");
  assert.equal(m.files.length, 4);

  const missing = fakeRequest(respond(404, { detail: "not found" }));
  await assert.rejects(getDelivery(missing.request, "a"), (err) => assignmentErrorCode(err) === "not_found");
});

// --- av/paa og exclude ---------------------------------------------------------------

test("exclude: bare resultatene som er slaatt av, i rekkefoelgen fra fillista; originaler og ukjente noekler ignoreres", () => {
  assert.deepEqual(deliveryExclude(MANIFEST.files, new Set()), []);
  assert.deepEqual(deliveryExclude(MANIFEST.files, new Set(["res:r2", "res:r1"])), ["res:r1", "res:r2"]);
  assert.deepEqual(deliveryExclude(MANIFEST.files, new Set(["img:i1", "res:ukjent", "res:r2"])), ["res:r2"]);
  assert.equal(isIncluded(MANIFEST.files[0], new Set(["img:i1"])), true);
  assert.equal(isIncluded(MANIFEST.files[1], new Set(["res:r1"])), false);
});

test("antall filer oeverst og paa knappen foelger av/paa", () => {
  assert.deepEqual(deliveryCounts(MANIFEST.files, new Set()), { originals: 2, results: 2, total: 4 });
  const off = new Set(["res:r1"]);
  assert.deepEqual(deliveryCounts(MANIFEST.files, off), { originals: 2, results: 1, total: 3 });
  assert.equal(deliverySummary("nb", deliveryCounts(MANIFEST.files, off)), "3 filer: 1 bearbeidet bilde og 2 originaler.");
  assert.equal(deliverySummary("nb", { originals: 8, results: 6, total: 14 }), "14 filer: 6 bearbeidede bilder og 8 originaler.");
  assert.equal(deliverySummary("en", { originals: 1, results: 0, total: 1 }), "1 file: 0 edited images and 1 original.");
  assert.equal(zipButtonText("nb", 14), "Last ned ZIP (14 filer)");
  assert.equal(zipButtonText("nb", 1), "Last ned ZIP (1 fil)");
  assert.equal(zipButtonText("en", 3), "Download ZIP (3 files)");
});

test("lenken fra bildesiden: alle originalene og de godkjente resultatene", () => {
  assert.equal(deliveryFileCount({ images: 8, approved: 6 }), 14);
  assert.equal(deliveryLinkText("nb", 14), "Last ned (14 filer)");
  assert.equal(deliveryLinkText("nb", 1), "Last ned (1 fil)");
  assert.equal(orderDeliveryHref("a/b"), "/ordrer/a%2Fb/last-ned");
});

// --- visningen --------------------------------------------------------------------------

test("visningen: gruppert per bilde i rekkefoelgen fra manifestet, med merknadene under bildet sitt", () => {
  const images = [
    image("i2", 2, "Kjøkken", [{ result_id: "r3", order_service: "skumring", display_status: "to_review" }]),
    image("i1", 1, "Stue"),
  ];
  const groups = deliveryGroups(MANIFEST, images);
  assert.deepEqual(
    groups.map((g) => [g.imageId, g.number, g.image?.room ?? null, g.files.map((f) => f.key), g.notes.map((n) => n.code)]),
    [
      ["i1", 1, "Stue", ["img:i1", "res:r1", "res:r2"], []],
      ["i2", 2, "Kjøkken", ["img:i2"], ["result_to_review"]],
    ]
  );
  // Uten ordren (kunne ikke hentes) vises fillista likevel.
  assert.equal(deliveryGroups(MANIFEST, [])[0].image, null);
});

test("linja under filnavnet: original, tjenesten med versjon, og merket eller uten merke", () => {
  const [original, styling, faces] = MANIFEST.files;
  assert.equal(fileDetail("nb", original, null), "Original");
  assert.equal(fileDetail("nb", styling, null), "Digital styling · Japandi · versjon 1 · merket");
  assert.equal(fileDetail("nb", faces, "Skjul ansikter"), "Skjul ansikter · versjon 1 · uten merke");
  assert.equal(fileDetail("en", styling, "Virtual staging · Japandi"), "Virtual staging · Japandi · version 1 · labelled");
});

test("merknadene: egen tekst for hver kode paa nb og en, og lenke dit megleren kan gjoere noe", () => {
  const codes = ["result_processing", "result_to_review", "result_needs_answer", "result_not_used", "result_failed"];
  for (const locale of ["nb", "en"] as const) {
    const texts = codes.map((c) => t(locale, noteKey(c), { label: "X" }));
    assert.equal(new Set(texts).size, codes.length, locale);
    for (const text of texts) {
      assert.ok(text.startsWith("X "), text);
      assert.notEqual(text, t(locale, "delivery.note.unknown", { label: "X" }));
    }
  }
  assert.equal(noteKey("result_ukjent"), "delivery.note.unknown");
  assert.equal(t("nb", noteKey("result_processing"), { label: "Kveldsbilde" }), "Kveldsbilde behandles og kommer med når den er godkjent.");

  const at = (code: string, resultId: string | null = "r9") => noteLink("a1", { imageId: "i", code, resultId });
  // FE-4: til ordresiden med bildet og resultatet valgt (playerHref), ikke til godkjenningssiden.
  assert.deepEqual(at("result_to_review"), { href: "/ordrer/a1?bilde=i&resultat=r9", key: "delivery.note.openReview" });
  assert.deepEqual(at("result_needs_answer"), { href: "/ordrer/a1?bilde=i&resultat=r9", key: "delivery.note.openReview" });
  for (const code of ["result_processing", "result_not_used", "result_failed"]) {
    assert.deepEqual(at(code), { href: "/ordrer/a1/bilder", key: "delivery.note.openImages" }, code);
  }
  assert.deepEqual(at("result_to_review", null), { href: "/ordrer/a1/bilder", key: "delivery.note.openImages" });
});

// --- ZIP-en ------------------------------------------------------------------------------

test("ZIP: POST med exclude, svaret leses bit for bit og lagres med navnet fra zip_name", async () => {
  const { request, calls } = fakeRequest(zipResponse([300_000, 300_000, 400_000]));
  const progress: number[] = [];
  const saved: { size: number; type: string; name: string }[] = [];
  const result = await downloadZip({
    request,
    id: "a1",
    exclude: deliveryExclude(MANIFEST.files, new Set(["res:r2"])),
    zipName: MANIFEST.zipName,
    address: "Storgata 12",
    save: (blob, name) => saved.push({ size: blob.size, type: blob.type, name }),
    onProgress: (b) => progress.push(b),
  });
  assert.deepEqual(result, { kind: "ok", fileName: "storgata-12.zip", bytes: 1_000_000 });
  assert.equal(calls[0].path, "/v1/assignments/a1/delivery.zip");
  assert.equal(calls[0].init.method, "POST");
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), { exclude: ["res:r2"] });
  assert.deepEqual(progress, [300_000, 600_000, 1_000_000]);
  assert.deepEqual(saved, [{ size: 1_000_000, type: "application/zip", name: "storgata-12.zip" }]);
});

test("ZIP-navnet: zip_name fra backend, ellers slugen av adressen", async () => {
  const run = (zipName: string | null, address: string) =>
    downloadZip({ request: fakeRequest(zipResponse([10])).request, id: "a", exclude: [], zipName, address, save: () => {} });
  assert.deepEqual(await run("storgata-12", "x"), { kind: "ok", fileName: "storgata-12.zip", bytes: 10 });
  assert.deepEqual(await run(null, "Kåre Ødegårds vei 3"), { kind: "ok", fileName: "kaare-odegaards-vei-3.zip", bytes: 10 });
  assert.deepEqual(await run(null, ""), { kind: "ok", fileName: "ordre.zip", bytes: 10 });
});

test("ZIP-feil foer stroemmen: koden fra backend, 404 uten kode, og de slettede filene", async () => {
  const run = async (res: Response) =>
    downloadZip({ request: fakeRequest(res).request, id: "a", exclude: [], zipName: null, address: "x", save: () => assert.fail("lagret") });
  assert.deepEqual(await run(respond(400, { detail: { code: "invalid_exclude", key: "img:i1" } })), {
    kind: "error",
    code: "invalid_exclude",
    files: [],
  });
  assert.deepEqual(await run(respond(409, { detail: { code: "nothing_to_deliver" } })), { kind: "error", code: "nothing_to_deliver", files: [] });
  assert.deepEqual(await run(respond(409, { detail: { code: "action_not_allowed" } })), { kind: "error", code: "action_not_allowed", files: [] });
  assert.deepEqual(await run(respond(404, { detail: "not found" })), { kind: "error", code: "not_found", files: [] });
  assert.deepEqual(await run(respond(500, null)), { kind: "error", code: "http_500", files: [] });
  const gone = await run(respond(410, { detail: { code: "media_deleted", files: ["res:r1", 7] } }));
  assert.deepEqual(gone, { kind: "error", code: "media_deleted", files: ["res:r1"] });
  assert.deepEqual(deletedFileNames(MANIFEST.files, ["res:r1", "res:borte"]), ["storgata-12_01b_stue_styling-japandi_r01.jpg", "res:borte"]);
});

test("ZIP brutt midt i gir «aborted»; nettfeil foer svar gir «network»; avbrutt av siden gir «cancelled»", async () => {
  const base = { id: "a", exclude: [], zipName: null, address: "x", save: () => assert.fail("lagret") };
  assert.deepEqual(await downloadZip({ ...base, request: fakeRequest(zipResponse([100, 100, 100], 2)).request }), {
    kind: "error",
    code: "aborted",
    files: [],
  });
  assert.deepEqual(await downloadZip({ ...base, request: fakeRequest(zipResponse([])).request }), {
    kind: "error",
    code: "aborted",
    files: [],
  });
  const offline = fakeRequest(() => Promise.reject(new TypeError("Failed to fetch")));
  assert.deepEqual(await downloadZip({ ...base, request: offline.request }), { kind: "error", code: "network", files: [] });
  const controller = new AbortController();
  controller.abort();
  const aborted = fakeRequest(() => Promise.reject(new DOMException("aborted", "AbortError")));
  assert.deepEqual(await downloadZip({ ...base, request: aborted.request, signal: controller.signal }), { kind: "cancelled" });
});

test("ordlista: hver feil i K 2.9 og bruddet har egen tekst paa nb og en", () => {
  const codes = ["invalid_exclude", "nothing_to_deliver", "media_deleted", "action_not_allowed", "aborted", "not_found", "network"];
  for (const locale of ["nb", "en"] as const) {
    const generic = DICTIONARIES[locale].generic.deliveryError;
    for (const code of codes) assert.notEqual(codeText(locale, "deliveryError", code), generic, `${locale} ${code}`);
  }
  assert.equal(codeText("nb", "deliveryError", "aborted"), "Nedlastingen ble avbrutt, prøv igjen.");
});

test("MB mottatt: én desimal, norsk komma", () => {
  assert.equal(formatMegabytes("nb", 12_345_678), "12,3 MB");
  assert.equal(formatMegabytes("en", 12_345_678), "12.3 MB");
  assert.equal(formatMegabytes("nb", 0), "0,0 MB");
});

test("enkeltfil: filnavnet fra manifestet brukes naar det er gitt", async () => {
  const saved: string[] = [];
  const result = await downloadMarkedImage({
    jobId: "250dccaf-1111",
    presetId: null,
    fileName: "storgata-12_01b_stue_styling-japandi_r01.jpg",
    fetchFile: async () => new Response(new Uint8Array([1, 2]), { status: 200 }),
    save: (_b, name) => saved.push(name),
  });
  assert.deepEqual(result, { kind: "ok", fileName: "storgata-12_01b_stue_styling-japandi_r01.jpg" });
  assert.deepEqual(saved, ["storgata-12_01b_stue_styling-japandi_r01.jpg"]);
});

// --- sidene som tekst --------------------------------------------------------------------

test("siden sjekker flagget paa /ordrer, og siden og komponenten har ingen synlig tekst skrevet rett inn", () => {
  const page = withoutComments(read(PAGE));
  assert.match(page, /^"use client";/);
  assert.match(page, /if \(!isPageEnabled\(ORDERS_PATH\)\) return <ServiceUnavailable \/>;/);
  assert.match(page, /<OrderDelivery key=\{id\} assignmentId=\{id\} \/>/);
  for (const rel of [PAGE, COMPONENT, "(app)/ordrer/page.tsx", "components/ordre/OrderImages.tsx"]) {
    assert.deepEqual(literalTextsInFile(read(rel)), [], rel);
  }
});

test("komponenten: av/paa som bryter, ZIP med saveBlob og laast knapp, mobilmerknad og enkeltfil for merkede resultater", () => {
  const src = withoutComments(read(COMPONENT));
  assert.match(src, /type="checkbox"\s+role="switch"/);
  assert.match(src, /disabled=\{locked\}/);
  assert.match(src, /save: saveBlob/);
  assert.match(src, /exclude: deliveryExclude\(manifest\.files, off\)/);
  assert.match(src, /disabled=\{running \|\| counts\.total === 0\}/);
  assert.match(src, /md:hidden">\{t\(locale, "delivery\.mobile"\)\}/);
  assert.match(src, /isResult && file\.marked && file\.resultId !== null && included && \(\s*<DownloadButton/);
  assert.match(src, /fileName=\{file\.name\}/);
  assert.match(src, /role="status" aria-live="polite"/);
  // Lange filnavn brytes, saa 375 px ikke faar vannrett rulling.
  assert.match(src, /break-all text-sm text-ink">\{file\.name\}/);
});

test("lenkene: «Last ned» fra bildesiden og fra lista under Ordrer", () => {
  const images = withoutComments(read("components/ordre/OrderImages.tsx"));
  assert.match(images, /href=\{orderDeliveryHref\(assignmentId\)\}/);
  const list = withoutComments(read("(app)/ordrer/page.tsx"));
  assert.match(list, /href=\{orderDeliveryHref\(order\.id\)\}/);
  assert.match(list, /t\(locale, "delivery\.linkLabel", \{ address: order\.address \}\)/);
});
