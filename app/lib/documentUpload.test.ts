import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checkDocument,
  classifyPut,
  COMPLETE_RETRY_MS,
  DocumentQueue,
  isPdfHead,
  putSignedUpload,
  type DocRow,
  type UploadXhr,
} from "./documentUpload.ts";
import { MAX_DOCUMENT_BYTES, MAX_DOCUMENTS, type ListingTextDocument } from "./listingText.ts";

/**
 * Opplastingen av PDF-er (TG-NEW-281, T2): koeen og PUT-kallet mot falsk
 * `request` og falsk XHR (kontrakten §2 og §9.4).
 */

const SECRET = "SECRET-TOKEN-abc123";
const SIGNED = (id: string) => `https://proj.supabase.co/storage/v1/object/upload/sign/listing-documents/asg_1/${id}.pdf?token=${SECRET}`;
const HOUR = 60 * 60_000;

// --- falsk XHR ---------------------------------------------------------------

class FakeXhr implements UploadXhr {
  status = 0;
  responseText = "";
  readonly upload: UploadXhr["upload"] = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  method = "";
  url = "";
  headers: Record<string, string> = {};
  body: Blob | null = null;
  aborted = false;
  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }
  send(body: Blob) {
    this.body = body;
  }
  abort() {
    this.aborted = true;
    this.onabort?.();
  }
  progress(loaded: number, total: number) {
    this.upload.onprogress?.({ loaded, total, lengthComputable: true });
  }
  respond(status: number, body: string) {
    this.status = status;
    this.responseText = body;
    this.onload?.();
  }
  networkError() {
    this.onerror?.();
  }
}

const OK_BODY = JSON.stringify({ Key: "listing-documents/asg_1/d1.pdf" });
const EXISTS_BODY = JSON.stringify({ statusCode: "409", error: "Duplicate", code: "KeyAlreadyExists", message: "The resource already exists" });
const MIME_BODY = JSON.stringify({ statusCode: "415", error: "invalid_mime_type", code: "InvalidMimeType", message: "mime type text/plain is not supported" });

// --- falsk backend -----------------------------------------------------------

interface Call {
  method: string;
  path: string;
  headers: Headers;
  body: Record<string, unknown> | null;
}

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
}

function wireDoc(id: string, status: string, extra: Record<string, unknown> = {}) {
  return { id, file_name: `${id}.pdf`, bytes: 10, status, kind: null, pages: null, created_at: "2026-10-30T10:00:00Z", ...extra };
}

/** Backend med standardsvar; `complete` og `start` kan overstyres per test. */
function fakeBackend(opts: {
  complete?: (documentId: string, n: number) => Response;
  start?: (key: string | null, n: number) => Response;
  remove?: (documentId: string) => Response;
} = {}) {
  const calls: Call[] = [];
  let starts = 0;
  let completes = 0;
  const keyToDoc = new Map<string, string>();
  const request = async (path: string, init: RequestInit): Promise<Response> => {
    const headers = new Headers(init.headers);
    const body = typeof init.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : null;
    const method = init.method ?? "GET";
    calls.push({ method, path, headers, body });
    if (method === "POST" && path.endsWith("/listing-text/documents")) {
      starts++;
      const key = headers.get("Idempotency-Key");
      if (opts.start) return opts.start(key, starts);
      let id = key === null ? undefined : keyToDoc.get(key);
      if (id === undefined) {
        id = `d${keyToDoc.size + 1}`;
        if (key !== null) keyToDoc.set(key, id);
      }
      return json(201, {
        document: wireDoc(id, "pending"),
        upload: { signed_url: SIGNED(id), token: SECRET, path: `asg_1/${id}.pdf`, expires_at: new Date(Date.parse("2026-10-30T10:00:00Z") + 2 * HOUR).toISOString() },
      });
    }
    const complete = path.match(/\/documents\/([^/]+)\/complete$/);
    if (method === "POST" && complete) {
      completes++;
      if (opts.complete) return opts.complete(complete[1], completes);
      return json(200, { document: wireDoc(complete[1], "ready") });
    }
    const del = path.match(/\/documents\/([^/]+)$/);
    if (method === "DELETE" && del) return opts.remove ? opts.remove(del[1]) : json(204, null);
    return json(404, { detail: "not found" });
  };
  return { calls, request, starts: () => starts, completes: () => completes };
}

const pdf = (name = "Salgsoppgave.pdf", type = "application/pdf") => new File([new TextEncoder().encode("%PDF-1.7\n...")], name, { type });

/** Venter til betingelsen holder (koeen gaar gjennom flere await). */
async function until(cond: () => boolean, what = "betingelsen"): Promise<void> {
  for (let i = 0; i < 200; i++) {
    if (cond()) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.fail(`ventet paa ${what}`);
}

function setup(opts: Parameters<typeof fakeBackend>[0] = {}, extra: { now?: () => number; sleeps?: number[] } = {}) {
  const backend = fakeBackend(opts);
  const xhrs: FakeXhr[] = [];
  let keyN = 0;
  let rows: readonly DocRow[] = [];
  const history: string[] = [];
  const queue = new DocumentQueue({
    request: backend.request,
    assignmentId: "asg_1",
    xhr: () => {
      const x = new FakeXhr();
      xhrs.push(x);
      return x;
    },
    onChange: (r) => {
      rows = r;
      if (r.length > 0 && history.at(-1) !== r[0].state) history.push(r[0].state);
    },
    newKey: () => `key-${++keyN}`,
    now: extra.now ?? (() => Date.parse("2026-10-30T10:00:00Z")),
    sleep: async (ms) => {
      extra.sleeps?.push(ms);
    },
  });
  return { queue, backend, xhrs, rows: () => rows, row: (i = 0) => rows[i], history };
}

// --- PUT-kallet --------------------------------------------------------------

test("PUT: metode, lenken som den er, Content-Type fast, ingen apikey/Authorization, raa fil som kropp", async () => {
  const xhr = new FakeXhr();
  // Nettleseren kan gi tom eller feil type; headeren skal likevel vaere application/pdf.
  const file = pdf("Tilstand.pdf", "text/plain");
  const handle = putSignedUpload(() => xhr, SIGNED("d1"), file, () => {});
  assert.equal(xhr.method, "PUT");
  assert.equal(xhr.url, SIGNED("d1"));
  assert.deepEqual(xhr.headers, { "Content-Type": "application/pdf" });
  const names = Object.keys(xhr.headers).map((h) => h.toLowerCase());
  assert.ok(!names.includes("apikey") && !names.includes("authorization") && !names.includes("x-upsert"));
  assert.equal(xhr.body, file, "fila selv, ikke FormData");
  xhr.respond(200, OK_BODY);
  assert.deepEqual(await handle.done, { kind: "stored" });
});

test("PUT: svarteksten avgjoer, ikke HTTP-statusen (Storage gir 400 for 409 og 415)", () => {
  assert.deepEqual(classifyPut(200, OK_BODY), { kind: "stored" });
  assert.deepEqual(classifyPut(400, EXISTS_BODY), { kind: "exists" });
  assert.deepEqual(classifyPut(400, "KeyAlreadyExists"), { kind: "exists" });
  assert.deepEqual(classifyPut(400, MIME_BODY), { kind: "invalid_mime_type" });
  assert.deepEqual(classifyPut(400, JSON.stringify({ statusCode: "403", error: "Unauthorized", message: "jwt expired" })), { kind: "failed" });
  assert.deepEqual(classifyPut(413, "Payload too large"), { kind: "failed" });
  assert.deepEqual(classifyPut(0, ""), { kind: "network" });
});

test("PUT: fremdrift i hele prosent, nettfeil og avbrudd", async () => {
  const seen: number[] = [];
  const xhr = new FakeXhr();
  const handle = putSignedUpload(() => xhr, SIGNED("d1"), pdf(), (p) => seen.push(p));
  xhr.progress(1, 3);
  xhr.progress(2, 3);
  xhr.progress(3, 3);
  assert.deepEqual(seen, [33, 66, 100]);
  xhr.networkError();
  assert.deepEqual(await handle.done, { kind: "network" });

  const xhr2 = new FakeXhr();
  const handle2 = putSignedUpload(() => xhr2, SIGNED("d2"), pdf(), () => {});
  handle2.abort();
  assert.ok(xhr2.aborted);
  assert.deepEqual(await handle2.done, { kind: "aborted" });
});

// --- grensene ----------------------------------------------------------------

test("grensene: bare .pdf, hoeyst 100 MB, ikke tom, og %PDF- i starten", () => {
  assert.equal(checkDocument("Salgsoppgave.pdf", 10), null);
  assert.equal(checkDocument("SALGSOPPGAVE.PDF", 10), null);
  assert.equal(checkDocument("bilde.jpg", 10), "invalid_document");
  assert.equal(checkDocument("salgsoppgave.pdf.exe", 10), "invalid_document");
  assert.equal(checkDocument("tom.pdf", 0), "invalid_document");
  assert.equal(checkDocument("stor.pdf", MAX_DOCUMENT_BYTES), null);
  assert.equal(checkDocument("stor.pdf", MAX_DOCUMENT_BYTES + 1), "document_too_large");
  assert.equal(MAX_DOCUMENT_BYTES, 100 * 1024 * 1024);
  assert.ok(isPdfHead(new TextEncoder().encode("%PDF-1.4")));
  assert.ok(!isPdfHead(new TextEncoder().encode("hello")));
  assert.ok(!isPdfHead(new TextEncoder().encode("%PD")));
});

test("grensene: feil type og for stor fil avvises i nettleseren uten kall", async () => {
  const s = setup();
  const big = pdf("stor.pdf");
  Object.defineProperty(big, "size", { value: MAX_DOCUMENT_BYTES + 1 });
  const fake = new File([new TextEncoder().encode("bare tekst")], "lure.pdf");
  s.queue.add([pdf("bilde.jpg", "image/jpeg"), big, fake]);
  await until(() => s.rows().every((r) => r.state === "failed"), "avvisningene");
  assert.deepEqual(
    s.rows().map((r) => [r.state, r.failure, r.canRetry]),
    [
      ["failed", "invalid_document", false],
      ["failed", "document_too_large", false],
      ["failed", "invalid_document", false],
    ]
  );
  assert.equal(s.backend.calls.length, 0);
  assert.equal(s.xhrs.length, 0);
});

test("grensene: hoeyst 10 per pakke, ogsaa med dokumenter fra foer", async () => {
  const s = setup();
  const existing: ListingTextDocument[] = Array.from({ length: 8 }, (_, i) => ({
    id: `old${i}`,
    fileName: `old${i}.pdf`,
    bytes: 10,
    status: "ready",
    kind: null,
    pages: null,
    rejectCode: null,
    usedInVersion: false,
    createdAt: "",
  }));
  s.queue.seed(existing);
  s.queue.seed(existing); // samme dokumenter igjen gir ingen nye rader
  assert.equal(s.rows().length, 8);
  assert.equal(s.queue.capacity, 2);
  s.queue.add([pdf("a.pdf"), pdf("b.pdf"), pdf("c.pdf")]);
  assert.deepEqual(
    s.rows().slice(8).map((r) => [r.state === "failed", r.failure]),
    [
      [false, null],
      [false, null],
      [true, "document_limit"],
    ]
  );
  assert.equal(MAX_DOCUMENTS, 10);
  assert.equal(s.queue.capacity, 0);
});

// --- koeen -------------------------------------------------------------------

test("koeen: én fil om gangen, start -> PUT -> complete -> Klar", async () => {
  const s = setup();
  s.queue.add([pdf("a.pdf"), pdf("b.pdf")]);
  await until(() => s.xhrs.length === 1, "foerste PUT");
  assert.equal(s.backend.starts(), 1, "andre fil starter ikke foer den foerste er ferdig");
  assert.deepEqual(
    s.rows().map((r) => r.state),
    ["uploading", "queued"]
  );
  assert.ok(s.queue.busy);

  const start = s.backend.calls[0];
  assert.equal(start.method, "POST");
  assert.equal(start.path, "/v1/assignments/asg_1/listing-text/documents");
  assert.deepEqual(start.body, { file_name: "a.pdf", bytes: pdf().size, content_type: "application/pdf" });
  assert.equal(start.headers.get("Idempotency-Key"), "key-1");

  s.xhrs[0].respond(200, OK_BODY);
  await until(() => s.xhrs.length === 2, "andre PUT");
  assert.equal(s.row(0).state, "ready");
  assert.equal(s.row(0).documentId, "d1");
  assert.equal(s.backend.calls.find((c) => c.path.endsWith("/complete"))?.path, "/v1/assignments/asg_1/listing-text/documents/d1/complete");
  s.xhrs[1].respond(200, OK_BODY);
  await until(() => !s.queue.busy, "ferdig");
  assert.deepEqual(s.queue.readyIds, ["d1", "d2"]);
});

test("koeen: fremdriften staar paa raden (Laster opp N %), saa Kontrolleres", async () => {
  const s = setup();
  s.queue.add([pdf()]);
  await until(() => s.xhrs.length === 1);
  s.xhrs[0].progress(25, 100);
  assert.equal(s.row().progress, 25);
  s.xhrs[0].progress(50, 100);
  assert.deepEqual([s.row().state, s.row().progress], ["uploading", 50]);
  s.xhrs[0].respond(200, OK_BODY);
  await until(() => s.row().state === "ready");
  assert.deepEqual(s.history, ["queued", "starting", "uploading", "checking", "ready"]);
});

test("koeen: 400 med KeyAlreadyExists gaar rett til complete", async () => {
  const s = setup();
  s.queue.add([pdf()]);
  await until(() => s.xhrs.length === 1);
  s.xhrs[0].respond(400, EXISTS_BODY);
  await until(() => s.row().state === "ready");
  assert.equal(s.backend.completes(), 1);
});

test("koeen: 400 med invalid_mime_type gir feil, uten complete", async () => {
  const s = setup();
  s.queue.add([pdf()]);
  await until(() => s.xhrs.length === 1);
  s.xhrs[0].respond(400, MIME_BODY);
  await until(() => s.row().state === "failed");
  assert.deepEqual([s.row().failure, s.row().canRetry], ["invalid_mime_type", true]);
  assert.equal(s.backend.completes(), 0);
  assert.ok(!s.queue.busy);
});

test("koeen: nettfeil foer svar, saa «Prøv igjen» med samme lenke innen 2 timer", async () => {
  const s = setup();
  s.queue.add([pdf()]);
  await until(() => s.xhrs.length === 1);
  s.xhrs[0].networkError();
  await until(() => s.row().state === "failed");
  assert.deepEqual([s.row().failure, s.row().canRetry, s.row().documentId], ["network", true, "d1"]);
  assert.ok(s.queue.retry(s.row().id));
  await until(() => s.xhrs.length === 2);
  assert.equal(s.backend.starts(), 1, "ingen ny start");
  assert.equal(s.xhrs[1].url, SIGNED("d1"));
  s.xhrs[1].respond(200, OK_BODY);
  await until(() => s.row().state === "ready");
});

test("koeen: nettfeil etter at lenken er utloept gir ny start med samme noekkel (samme dokument)", async () => {
  let now = Date.parse("2026-10-30T10:00:00Z");
  const s = setup({}, { now: () => now });
  s.queue.add([pdf()]);
  await until(() => s.xhrs.length === 1);
  s.xhrs[0].networkError();
  await until(() => s.row().state === "failed");
  now += 2 * HOUR;
  s.queue.retry(s.row().id);
  await until(() => s.xhrs.length === 2);
  assert.equal(s.backend.starts(), 2);
  const keys = s.backend.calls.filter((c) => c.path.endsWith("/documents")).map((c) => c.headers.get("Idempotency-Key"));
  assert.deepEqual(keys, ["key-1", "key-1"]);
  assert.equal(s.row().documentId, "d1");
});

test("koeen: annet feilsvar fra lageret gir ny start med samme noekkel", async () => {
  const s = setup();
  s.queue.add([pdf()]);
  await until(() => s.xhrs.length === 1);
  s.xhrs[0].respond(400, JSON.stringify({ statusCode: "403", error: "Unauthorized", message: "jwt expired" }));
  await until(() => s.row().state === "failed");
  assert.equal(s.row().failure, "upload_failed");
  s.queue.retry(s.row().id);
  await until(() => s.xhrs.length === 2);
  assert.equal(s.backend.starts(), 2);
  assert.equal(s.backend.calls.filter((c) => c.path.endsWith("/documents"))[1].headers.get("Idempotency-Key"), "key-1");
});

test("koeen: «Avbryt» stopper opplastingen og sletter dokumentet; nytt forsoek er ny start med ny noekkel", async () => {
  const s = setup();
  s.queue.add([pdf()]);
  await until(() => s.xhrs.length === 1);
  s.xhrs[0].progress(40, 100);
  assert.ok(s.queue.abort(s.row().id));
  assert.ok(s.xhrs[0].aborted);
  await until(() => s.row().state === "aborted");
  const del = s.backend.calls.find((c) => c.method === "DELETE");
  assert.equal(del?.path, "/v1/assignments/asg_1/listing-text/documents/d1");
  assert.deepEqual([s.row().documentId, s.row().progress, s.row().canRetry], [null, 0, true]);
  assert.equal(s.queue.capacity, MAX_DOCUMENTS, "teller ikke mot de 10");
  assert.equal(s.backend.completes(), 0);

  s.queue.retry(s.row().id);
  await until(() => s.xhrs.length === 2);
  const keys = s.backend.calls.filter((c) => c.path.endsWith("/documents")).map((c) => c.headers.get("Idempotency-Key"));
  assert.deepEqual(keys, ["key-1", "key-2"]);
  assert.equal(s.row().documentId, "d2");
});

test("koeen: «Avbryt» paa en fil som venter, uten kall", async () => {
  const s = setup();
  s.queue.add([pdf("a.pdf"), pdf("b.pdf")]);
  await until(() => s.xhrs.length === 1);
  assert.ok(s.queue.abort(s.row(1).id));
  await until(() => s.row(1).state === "aborted");
  s.xhrs[0].respond(200, OK_BODY);
  await until(() => !s.queue.busy);
  assert.equal(s.backend.starts(), 1);
  assert.equal(s.xhrs.length, 1);
});

test("koeen: rejected med grunnen fra complete", async () => {
  const s = setup({ complete: (id) => json(200, { document: wireDoc(id, "rejected", { reject_code: "size_mismatch" }) }) });
  s.queue.add([pdf()]);
  await until(() => s.xhrs.length === 1);
  s.xhrs[0].respond(200, OK_BODY);
  await until(() => s.row().state === "rejected");
  assert.deepEqual([s.row().rejectCode, s.row().canRetry], ["size_mismatch", false]);
  assert.deepEqual(s.queue.readyIds, []);
});

test("koeen: 409 document_not_uploaded fra complete proeves én gang til etter 2 s", async () => {
  const sleeps: number[] = [];
  const s = setup(
    {
      complete: (id, n) =>
        n === 1 ? json(409, { detail: { code: "document_not_uploaded" } }) : json(200, { document: wireDoc(id, "ready") }),
    },
    { sleeps }
  );
  s.queue.add([pdf()]);
  await until(() => s.xhrs.length === 1);
  s.xhrs[0].respond(200, OK_BODY);
  await until(() => s.row().state === "ready");
  assert.deepEqual(sleeps, [COMPLETE_RETRY_MS]);
  assert.equal(s.backend.completes(), 2);
});

test("koeen: feil ved start (409 document_limit fra backend) staar paa raden", async () => {
  const s = setup({ start: () => json(409, { detail: { code: "document_limit", limit: 10 } }) });
  s.queue.add([pdf()]);
  await until(() => s.row().state === "failed");
  assert.deepEqual([s.row().failure, s.row().canRetry], ["document_limit", false]);
  assert.equal(s.xhrs.length, 0);
});

test("«Fjern»: DELETE og raden tas bort; feiler slettingen, blir raden staaende med koden", async () => {
  const s = setup();
  s.queue.add([pdf()]);
  await until(() => s.xhrs.length === 1);
  assert.equal(await s.queue.remove(s.row().id), false, "ikke mens fila lastes opp");
  s.xhrs[0].respond(200, OK_BODY);
  await until(() => s.row().state === "ready");
  assert.equal(await s.queue.remove(s.row().id), true);
  assert.equal(s.rows().length, 0);
  assert.equal(s.backend.calls.at(-1)?.method, "DELETE");

  const f = setup({ remove: () => json(503, { detail: { code: "listing_text_unavailable" } }) });
  f.queue.seed([{ id: "old", fileName: "old.pdf", bytes: 1, status: "pending", kind: null, pages: null, rejectCode: null, usedInVersion: false, createdAt: "" }]);
  assert.deepEqual([f.row().state, f.row().failure, f.row().canRetry], ["failed", "not_uploaded", false]);
  assert.equal(await f.queue.remove(f.row().id), false);
  assert.equal(f.row().failure, "listing_text_unavailable");
});

// --- lenke og token ----------------------------------------------------------

test("lenke og token: aldri i console, i radene eller i feilene", async () => {
  const methods = ["log", "info", "warn", "error", "debug", "trace"] as const;
  const logged: unknown[][] = [];
  const original = methods.map((m) => console[m]);
  methods.forEach((m) => {
    console[m] = (...args: unknown[]) => {
      logged.push(args);
    };
  });
  try {
    const s = setup({ complete: (id, n) => (n === 1 ? json(500, { detail: SIGNED(id) }) : json(200, { document: wireDoc(id, "ready") })) });
    s.queue.add([pdf("a.pdf"), pdf("b.pdf"), pdf("c.pdf"), pdf("d.pdf")]);
    await until(() => s.xhrs.length === 1);
    s.xhrs[0].networkError();
    await until(() => s.xhrs.length === 2);
    s.xhrs[1].respond(400, MIME_BODY);
    await until(() => s.xhrs.length === 3);
    s.xhrs[2].respond(400, JSON.stringify({ error: "Unauthorized", message: `bad ${SECRET}` }));
    await until(() => s.xhrs.length === 4);
    s.xhrs[3].respond(200, OK_BODY);
    await until(() => !s.queue.busy);
    const rows = JSON.stringify(s.rows());
    assert.ok(!rows.includes(SECRET) && !rows.includes("supabase.co"), rows);
    for (const r of s.rows()) {
      assert.ok(r.failure === null || /^[a-z_0-9]+$/.test(r.failure), String(r.failure));
    }
  } finally {
    methods.forEach((m, i) => {
      console[m] = original[i];
    });
  }
  assert.deepEqual(logged, [], "ingenting til console");
});
