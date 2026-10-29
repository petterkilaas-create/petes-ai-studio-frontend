import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  AssignmentError,
  createAssignment,
  deleteAssignmentImage,
  getAssignment,
  imageStatusKey,
  listAssignments,
  MAX_IMAGES_PER_ASSIGNMENT,
  orderAssignmentJobs,
  parseAssignment,
  parseAssignmentList,
  parseOrderJobs,
  parseResult,
  patchAssignmentImage,
  RESULT_STATUSES,
  resultStatusKey,
  slugify,
  uploadAssignmentImage,
  zipFileName,
  type AssignmentRequest,
} from "./assignments.ts";
import { codeText, DICTIONARIES, t, uploadErrorText } from "./i18n/index.ts";

/**
 * Ordren (TG-NEW-277, FE-0): parsing og API-kall etter kontraktutkastet
 * (K). Eksempelet har 8 bilder som skissen. Kallene gaar mot en falsk
 * `request`, saa ingenting sendes til backend.
 */
const SAMPLE: unknown = JSON.parse(readFileSync(new URL("./testdata/assignment_v1.json", import.meta.url), "utf-8"));

test("K 2.3: eksempelet gir 8 bilder sortert etter position, med resultatene i rekkefoelge", () => {
  const a = parseAssignment(SAMPLE);
  assert.ok(a);
  assert.equal(a.id, "asg_1");
  assert.equal(a.slug, "storgata-12");
  assert.equal(a.assignmentNo, "2026-1234");
  assert.deepEqual(
    a.images.map((i) => i.position),
    [1, 2, 3, 4, 5, 6, 7, 8]
  );
  assert.deepEqual(
    a.images[0].results.map((r) => r.resultId),
    ["job_1a", "job_1b"]
  );
  assert.equal(a.images[0].room, "Stue");
  assert.equal(a.images[5].room, null);
  assert.equal(a.counts.toReview, 3);
  assert.equal(a.counts.needsAnswer, 1);
  assert.equal(a.images.flatMap((i) => i.results).length, a.counts.results);
});

test("K 2.3: versjonene sorteres uten dubletter, og forrige versjon leses", () => {
  const a = parseAssignment(SAMPLE);
  const r = a?.images[0].results[1];
  assert.deepEqual(r?.versions, [1, 2]);
  assert.equal(r?.previousVersion, 1);
  assert.equal(r?.approvedVersion, 2);
});

test("ugyldig form gir null eller tomme verdier, aldri krasj", () => {
  for (const raw of [null, undefined, 42, "x", [], {}, { id: "" }]) {
    assert.equal(parseAssignment(raw), null, JSON.stringify(raw));
  }
  assert.equal(parseResult({ display_status: "to_review" }), null);
  const r = parseResult({ result_id: "j", display_status: "brand_new", version: -1, versions: "1" });
  assert.equal(r?.displayStatus, null);
  assert.equal(r?.version, 1);
  assert.deepEqual(r?.versions, []);
  const a = parseAssignment({ id: "a", address: "Ålgårdsveien 3", images: [{ position: 1 }, "x", { id: "i" }] });
  assert.equal(a?.images.length, 1);
  assert.equal(a?.slug, "aalgaardsveien-3");
  assert.equal(a?.counts.images, 0);
});

test("K 2.2: ordrelista hopper over rader uten id", () => {
  const list = parseAssignmentList({
    items: [{ id: "a", address: "Storgata 12", counts: { images: 8, to_review: 4 } }, { address: "uten id" }],
    next_cursor: "c2",
  });
  assert.equal(list.items.length, 1);
  assert.equal(list.items[0].counts.images, 8);
  assert.equal(list.items[0].counts.toReview, 4);
  assert.equal(list.items[0].coverThumbUrl, null);
  assert.equal(list.nextCursor, "c2");
  assert.deepEqual(parseAssignmentList(null), { items: [], nextCursor: null });
});

test("K 2.7: svaret per element; not_started har aldri result_id", () => {
  const res = parseOrderJobs({
    assignment_id: "asg_1",
    duplicate: true,
    items: [
      { index: 0, image_id: "img_1", service: "skumring", result_id: "job_9", status: "queued" },
      { index: 1, image_id: "img_2", service: "styling", result_id: "job_x", status: "not_started", code: "free_quota_exhausted" },
      { image_id: "uten index" },
    ],
    quota: { limited: true, used: 3, limit: 3, remaining: 0 },
  });
  assert.equal(res.duplicate, true);
  assert.equal(res.items.length, 2);
  assert.equal(res.items[0].resultId, "job_9");
  assert.equal(res.items[1].resultId, null);
  assert.equal(res.items[1].code, "free_quota_exhausted");
  assert.deepEqual(res.quota, { limited: true, used: 3, limit: 3, remaining: 0 });
});

test("K 1: hver display_status har egen tekst paa nb og en", () => {
  const nb = RESULT_STATUSES.map((s) => t("nb", resultStatusKey(s)));
  assert.equal(new Set(nb).size, RESULT_STATUSES.length);
  assert.deepEqual(nb, [
    "Behandles",
    "Til godkjenning",
    "Trenger svar",
    "Godkjent og brukes",
    "Ikke brukt",
    "Feilet",
    "Ikke startet",
  ]);
  for (const s of RESULT_STATUSES) assert.notEqual(t("en", resultStatusKey(s)), t("nb", resultStatusKey(s)));
  assert.equal(t("nb", resultStatusKey("processing", 1)), "Ny versjon behandles");
  assert.equal(t("nb", resultStatusKey(null)), "Ukjent status");
  assert.equal(t("nb", imageStatusKey("original_only")), "Leveres som original");
  assert.equal(t("nb", imageStatusKey("to_review")), "Til godkjenning");
});

test("Petter 29.10: opplastingen sier «JPG eller PNG», og HEIC har egen feil", () => {
  assert.match(t("nb", "upload.hint"), /^JPG eller PNG/);
  assert.ok(!/heic/i.test(t("nb", "upload.hint")));
  const heic = uploadErrorText("nb", "unsupported_image", "heic");
  assert.match(heic, /HEIC/);
  assert.notEqual(heic, uploadErrorText("nb", "unsupported_image", "format"));
  assert.equal(uploadErrorText("nb", "unsupported_image", "noe_nytt"), uploadErrorText("nb", "unsupported_image", "format"));
  assert.equal(uploadErrorText("en", "image_too_large", null), "The image is larger than 25 MB.");
  assert.equal(uploadErrorText("nb", "brand_new", null), "Bildet ble ikke lastet opp. Prøv igjen.");
  assert.equal(t("nb", "upload.limit", { max: MAX_IMAGES_PER_ASSIGNMENT }), "Ordren har plass til 60 bilder. Fjern bilder for å legge til flere.");
});

test("K 2.7: alle not_started-kodene har tekst", () => {
  for (const code of [
    "free_quota_exhausted",
    "daily_capacity_reached",
    "capacity",
    "job_create_failed",
    "submit_error",
    "service_already_on_image",
  ]) {
    for (const locale of ["nb", "en"] as const) {
      assert.ok(Object.hasOwn(DICTIONARIES[locale].codes.assignmentNotStarted, code), `${locale}/${code}`);
      assert.match(codeText(locale, "assignmentNotStarted", code), /\S/);
    }
  }
});

test("slugify: æ→ae, ø→o, å→aa (Petter 29.10), andre tegn blir -, hoeyst 40 tegn", () => {
  assert.equal(slugify("Storgata 12"), "storgata-12");
  assert.equal(slugify("Kjøkken"), "kjokken");
  assert.equal(slugify("Ærfuglveien 5, Bærum"), "aerfuglveien-5-baerum");
  assert.equal(slugify("Øvre Årstadvei 3B"), "ovre-aarstadvei-3b");
  assert.equal(slugify("Crème Brûlée"), "creme-brulee");
  assert.equal(slugify("  --  "), "");
  const long = slugify("a".repeat(30) + " " + "b".repeat(30));
  assert.ok(long.length <= 40);
  assert.ok(!long.endsWith("-"));
});

test("zipFileName: zip_name fra backend, ellers slugen av adressen", () => {
  assert.equal(zipFileName("storgata-12.zip", "x"), "storgata-12.zip");
  assert.equal(zipFileName("storgata-12", "x"), "storgata-12.zip");
  assert.equal(zipFileName("../a/b.zip", "x"), "..-a-b.zip");
  assert.equal(zipFileName(null, "Storgata 12"), "storgata-12.zip");
  assert.equal(zipFileName("", "æøå!!"), "aeoaa.zip");
  assert.equal(zipFileName(null, "!!!"), "ordre.zip");
});

// --- API-kallene mot en falsk request ----------------------------------------

function fake(status: number, body: unknown) {
  const calls: { path: string; init: RequestInit }[] = [];
  const request: AssignmentRequest = async (path, init) => {
    calls.push({ path, init });
    return new Response(body === undefined ? null : JSON.stringify(body), { status });
  };
  return { calls, request };
}

test("createAssignment: POST med address og assignment_no, 201 gir ordren", async () => {
  const { calls, request } = fake(201, { id: "asg_1", address: "Storgata 12" });
  const a = await createAssignment(request, { address: "Storgata 12", assignmentNo: "2026-1" });
  assert.equal(a.id, "asg_1");
  assert.equal(calls[0].path, "/v1/assignments");
  assert.equal(calls[0].init.method, "POST");
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), { address: "Storgata 12", assignment_no: "2026-1" });
  const { calls: c2, request: r2 } = fake(201, { id: "a" });
  await createAssignment(r2, { address: "X" });
  assert.deepEqual(JSON.parse(String(c2[0].init.body)), { address: "X" });
});

test("feil fra backend blir AssignmentError med code og detail", async () => {
  const { request } = fake(400, { detail: { code: "invalid_assignment", field: "address" } });
  await assert.rejects(createAssignment(request, { address: "" }), (err: unknown) => {
    assert.ok(err instanceof AssignmentError);
    assert.equal(err.httpStatus, 400);
    assert.equal(err.code, "invalid_assignment");
    assert.equal(err.detail.field, "address");
    return true;
  });
  const { request: r404 } = fake(404, { detail: "not found" });
  await assert.rejects(getAssignment(r404, "x"), (err: unknown) => err instanceof AssignmentError && err.code === null);
  const { request: rBad } = fake(200, { address: "uten id" });
  await assert.rejects(getAssignment(rBad, "x"), (err: unknown) => err instanceof AssignmentError && err.code === "invalid_response");
});

test("listAssignments og getAssignment: stiene og spoerringen", async () => {
  const list = fake(200, { items: [], next_cursor: null });
  await listAssignments(list.request, { limit: 50, cursor: "c 1" });
  assert.equal(list.calls[0].path, "/v1/assignments?limit=50&cursor=c+1");
  const bare = fake(200, { items: [] });
  await listAssignments(bare.request);
  assert.equal(bare.calls[0].path, "/v1/assignments");
  const one = fake(200, SAMPLE);
  const a = await getAssignment(one.request, "asg/1");
  assert.equal(one.calls[0].path, "/v1/assignments/asg%2F1");
  assert.equal(a.images.length, 8);
});

test("uploadAssignmentImage: multipart med image og room, Idempotency-Key i headeren", async () => {
  const { calls, request } = fake(201, { id: "img_9", position: 9, file_name: "a.jpg" });
  const file = new File([new Uint8Array([0xff, 0xd8, 0xff])], "a.jpg", { type: "image/jpeg" });
  const img = await uploadAssignmentImage(request, { id: "asg_1", file, room: "Stue", idempotencyKey: "k1" });
  assert.equal(img.id, "img_9");
  assert.equal(calls[0].path, "/v1/assignments/asg_1/images");
  assert.equal(new Headers(calls[0].init.headers).get("Idempotency-Key"), "k1");
  const form = calls[0].init.body as FormData;
  assert.equal(form.get("room"), "Stue");
  assert.equal((form.get("image") as File).name, "a.jpg");
  const { request: r413 } = fake(413, { detail: { code: "image_too_large" } });
  await assert.rejects(
    uploadAssignmentImage(r413, { id: "a", file, idempotencyKey: "k" }),
    (err: unknown) => err instanceof AssignmentError && err.code === "image_too_large"
  );
});

test("patch og delete: stiene, body og 204", async () => {
  const p = fake(200, { id: "img_1", room: "Kjøkken", position: 3 });
  await patchAssignmentImage(p.request, { id: "a", imageId: "img_1", room: "Kjøkken", position: 3 });
  assert.equal(p.calls[0].path, "/v1/assignments/a/images/img_1");
  assert.equal(p.calls[0].init.method, "PATCH");
  assert.deepEqual(JSON.parse(String(p.calls[0].init.body)), { room: "Kjøkken", position: 3 });
  const d = fake(204, undefined);
  await deleteAssignmentImage(d.request, { id: "a", imageId: "img_1" });
  assert.equal(d.calls[0].init.method, "DELETE");
  const d409 = fake(409, { detail: { code: "image_has_results" } });
  await assert.rejects(
    deleteAssignmentImage(d409.request, { id: "a", imageId: "img_1" }),
    (err: unknown) => err instanceof AssignmentError && err.code === "image_has_results"
  );
});

test("orderAssignmentJobs: items og Idempotency-Key, 202 gir svaret", async () => {
  const { calls, request } = fake(202, {
    assignment_id: "a",
    items: [{ index: 0, image_id: "img_1", service: "skumring", result_id: "j", status: "queued" }],
  });
  const res = await orderAssignmentJobs(request, {
    id: "a",
    items: [{ image_id: "img_1", service: "skumring" }],
    idempotencyKey: "k-bit-1",
  });
  assert.equal(res.items[0].resultId, "j");
  assert.equal(calls[0].path, "/v1/assignments/a/jobs");
  assert.equal(new Headers(calls[0].init.headers).get("Idempotency-Key"), "k-bit-1");
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), { items: [{ image_id: "img_1", service: "skumring" }] });
});
