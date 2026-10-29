import { test } from "node:test";
import assert from "node:assert/strict";
import { AssignmentError, type AssignmentImage } from "./assignments.ts";
import { codeText } from "./i18n/index.ts";
import {
  checkFile,
  checkHead,
  failureFrom,
  imageKind,
  MAX_UPLOAD_BYTES,
  retryable,
  UPLOAD_ACCEPT,
  UPLOAD_CONCURRENCY,
  UploadQueue,
  type UploadFailure,
} from "./uploadQueue.ts";

/**
 * Opplastingskoeen (FE-0, audit punkt 2): tre samtidige, status per fil,
 * «Last opp paa nytt» med samme noekkel, sjekk i nettleseren og taket paa 60.
 * `send` er falsk og styres av testen.
 */

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
function ftyp(brand: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array([0, 0, 0, 0x18, ..."ftyp".split("").map((c) => c.charCodeAt(0)), ...brand.split("").map((c) => c.charCodeAt(0))]);
}

test("imageKind: JPEG, PNG og HEIC fra de foerste bytene; AVIF, GIF og tomt er annet", () => {
  assert.equal(imageKind(JPEG), "jpeg");
  assert.equal(imageKind(PNG), "png");
  for (const brand of ["heic", "heix", "mif1", "msf1", "hevc"]) assert.equal(imageKind(ftyp(brand)), "heic", brand);
  assert.equal(imageKind(ftyp("avif")), "other");
  assert.equal(imageKind(new TextEncoder().encode("GIF89a......")), "other");
  assert.equal(imageKind(new Uint8Array()), "other");
});

test("checkHead: HEIC og ukjent format feiler foer stoerrelsen; over 25 MB feiler", () => {
  assert.deepEqual(checkHead(10, ftyp("heic")), { code: "unsupported_image", reason: "heic" });
  assert.deepEqual(checkHead(MAX_UPLOAD_BYTES + 1, ftyp("heic")), { code: "unsupported_image", reason: "heic" });
  assert.deepEqual(checkHead(10, new Uint8Array([1, 2, 3])), { code: "unsupported_image", reason: "format" });
  assert.deepEqual(checkHead(MAX_UPLOAD_BYTES + 1, JPEG), { code: "image_too_large", reason: null });
  assert.equal(checkHead(MAX_UPLOAD_BYTES, JPEG), null);
  assert.equal(checkHead(100, PNG), null);
  assert.equal(UPLOAD_ACCEPT, "image/jpeg,image/png");
});

test("checkFile leser de foerste bytene fra fila", async () => {
  assert.equal(await checkFile(new File([JPEG], "a.jpg")), null);
  assert.deepEqual(await checkFile(new File([ftyp("heic")], "a.heic")), { code: "unsupported_image", reason: "heic" });
});

test("failureFrom: koden fra backend, 413 uten kode, og nettfeil", () => {
  assert.deepEqual(failureFrom(new AssignmentError(400, "unsupported_image", { reason: "heic" })), {
    code: "unsupported_image",
    reason: "heic",
  });
  assert.deepEqual(failureFrom(new AssignmentError(413, null)), { code: "image_too_large", reason: null });
  assert.deepEqual(failureFrom(new AssignmentError(500, null)), { code: "http_500", reason: null });
  assert.deepEqual(failureFrom(new TypeError("Failed to fetch")), { code: "network", reason: null });
  assert.equal(retryable({ code: "network", reason: null }), true);
  assert.equal(retryable({ code: "unsupported_image", reason: "heic" }), false);
  assert.equal(retryable({ code: "image_too_large", reason: null }), false);
});

test("koden network har egen tekst", () => {
  assert.notEqual(codeText("nb", "uploadError", "network"), codeText("nb", "uploadError", "ukjent"));
});

// --- koeen -------------------------------------------------------------------

function image(id: string): AssignmentImage {
  return {
    id,
    position: 1,
    room: null,
    fileName: `${id}.jpg`,
    width: null,
    height: null,
    thumbUrl: null,
    originalUrl: null,
    displayStatus: null,
    results: [],
  };
}

/** Falsk send: hvert kall venter til testen svarer. */
function harness(opts: { capacity?: number; check?: (f: File) => Promise<UploadFailure | null> } = {}) {
  const pending: { file: File; key: string; resolve: (img: AssignmentImage) => void; reject: (e: unknown) => void }[] = [];
  const sent: { name: string; key: string }[] = [];
  let changes = 0;
  let n = 0;
  const queue = new UploadQueue({
    send: (file, key) =>
      new Promise((resolve, reject) => {
        sent.push({ name: file.name, key });
        pending.push({ file, key, resolve, reject });
      }),
    onChange: () => changes++,
    newKey: () => `key-${++n}`,
    capacity: opts.capacity,
    check: opts.check ?? (async () => null),
  });
  const files = (k: number, prefix = "f") => Array.from({ length: k }, (_, i) => new File([JPEG], `${prefix}${i + 1}.jpg`));
  const settle = () => new Promise((r) => setTimeout(r, 0));
  return { queue, pending, sent, files, settle, changes: () => changes };
}

test("hoeyst tre samtidige; neste starter naar en er ferdig", async () => {
  const h = harness();
  assert.equal(UPLOAD_CONCURRENCY, 3);
  h.queue.add(h.files(5));
  await h.settle();
  assert.equal(h.sent.length, 3);
  assert.deepEqual(
    h.queue.rows.map((r) => r.state),
    ["uploading", "uploading", "uploading", "queued", "queued"]
  );
  h.pending[0].resolve(image("img_1"));
  await h.settle();
  assert.equal(h.sent.length, 4);
  assert.equal(h.queue.rows[0].state, "done");
  assert.equal(h.queue.rows[0].image?.id, "img_1");
  assert.ok(h.changes() > 0);
  assert.equal(h.queue.busy, true);
});

test("hver fil har sin egen noekkel, og «Last opp paa nytt» bruker samme noekkel", async () => {
  const h = harness();
  h.queue.add(h.files(2));
  await h.settle();
  assert.deepEqual(
    h.sent.map((s) => s.key),
    ["key-1", "key-2"]
  );
  h.pending[0].reject(new TypeError("Failed to fetch"));
  h.pending[1].resolve(image("img_2"));
  await h.queue.idle();
  assert.equal(h.queue.rows[0].state, "failed");
  assert.deepEqual(h.queue.rows[0].failure, { code: "network", reason: null });
  assert.equal(h.queue.busy, false);
  assert.equal(h.queue.retryFailed(), 1);
  await h.settle();
  assert.equal(h.sent.length, 3);
  assert.equal(h.sent[2].key, "key-1");
  assert.equal(h.sent[2].name, "f1.jpg");
  h.pending[2].resolve(image("img_1"));
  await h.queue.idle();
  assert.deepEqual(
    h.queue.rows.map((r) => r.state),
    ["done", "done"]
  );
});

test("HEIC og for store filer feiler paa raden uten kall, og proeves ikke paa nytt", async () => {
  const h = harness({ check: checkFile });
  h.queue.add([new File([ftyp("heic")], "IMG.HEIC"), new File([JPEG], "ok.jpg")]);
  await h.settle();
  assert.deepEqual(
    h.sent.map((s) => s.name),
    ["ok.jpg"]
  );
  assert.deepEqual(h.queue.rows[0].failure, { code: "unsupported_image", reason: "heic" });
  h.pending[0].resolve(image("img_1"));
  await h.queue.idle();
  assert.equal(h.queue.retryFailed(), 0);
  assert.equal(h.sent.length, 1);
});

test("taket i nettleseren: filer over plassen feiler med assignment_image_limit uten kall", async () => {
  const h = harness({ capacity: 2 });
  h.queue.add(h.files(4));
  await h.settle();
  assert.equal(h.sent.length, 2);
  assert.deepEqual(
    h.queue.rows.map((r) => r.state),
    ["uploading", "uploading", "failed", "failed"]
  );
  assert.equal(h.queue.rows[2].failure?.code, "assignment_image_limit");
  assert.equal(h.queue.limitReached, true);
  h.pending[0].resolve(image("a"));
  h.pending[1].resolve(image("b"));
  await h.queue.idle();
  // Et bilde er fjernet i ordren: plass til ett til.
  h.queue.setCapacity(3);
  assert.equal(h.queue.retryFailed(), 2);
  await h.settle();
  assert.equal(h.sent.length, 3);
  assert.equal(h.queue.rows[3].failure?.code, "assignment_image_limit");
});

test("409 assignment_image_limit fra backend stopper resten av koeen", async () => {
  const h = harness();
  h.queue.add(h.files(5));
  await h.settle();
  h.pending[0].reject(new AssignmentError(409, "assignment_image_limit"));
  await h.settle();
  assert.equal(h.sent.length, 3);
  assert.deepEqual(
    h.queue.rows.map((r) => r.state),
    ["failed", "uploading", "uploading", "failed", "failed"]
  );
  h.pending[1].resolve(image("b"));
  h.pending[2].resolve(image("c"));
  await h.queue.idle();
  assert.equal(h.sent.length, 3);
});

test("remove: ventende og feilede rader kan fjernes, ikke en som lastes opp", async () => {
  const h = harness();
  const ids = h.queue.add(h.files(4));
  await h.settle();
  assert.equal(h.queue.remove(ids[0]), false);
  assert.equal(h.queue.remove(ids[3]), true);
  assert.equal(h.queue.rows.length, 3);
  for (const p of h.pending) p.resolve(image(p.key));
  await h.queue.idle();
  assert.equal(h.sent.length, 3);
});

test("idle loeses med en gang naar koeen er tom", async () => {
  const h = harness();
  await h.queue.idle();
  assert.equal(h.queue.busy, false);
});
