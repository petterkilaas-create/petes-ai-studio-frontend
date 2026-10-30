import type { AssignmentRequest } from "./assignments.ts";
import type { UploadXhr, XhrFactory } from "./documentUpload.ts";
import { RUN_STEPS } from "./listingText.ts";

/**
 * Mock-modusen for annonseteksten (TG-NEW-281, T2; K §9.3 punkt 10, valg b):
 * en falsk backend og en falsk XHR, saa siden kan sees lokalt foer backend 1b
 * er i drift. Bare i `next dev` med `?mock=1`: modulen lastes med `import()`
 * inne i `process.env.NODE_ENV === "development"`, saa prod-bygget tar den
 * ikke med (testen ser etter MOCK_MARKER i bygget).
 *
 * Ingen kall gaar ut: ordren, bildene, pakken og opplastingen er falske, og
 * ingenting sendes til backend eller Supabase.
 */

/** Staar bare i denne modulen. Testen sjekker at strengen ikke finnes i prod-bygget. */
export const MOCK_MARKER = "listing-text-mock-marker-v1";

const LATENCY_MS = 300;
/** Opplastingen: 5 % hvert 150. millisekund (3 s per fil). */
const PROGRESS_STEP = 5;
const PROGRESS_MS = 150;

const ROOMS = ["Stue", "Kjøkken", "Soverom", "Bad", "Uteplass", "Gang"];
const COLORS = ["#c9b79c", "#9fb4c7", "#b9c9a3", "#d6c2d9", "#a7c4bc", "#e0c9a6"];

function thumb(i: number): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="107"><rect width="160" height="107" fill="${COLORS[i % COLORS.length]}"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface MockDoc {
  id: string;
  file_name: string;
  bytes: number;
  status: "pending" | "ready" | "rejected";
  reject_code: string | null;
  key: string | null;
}

export interface ListingTextMock {
  request: AssignmentRequest;
  xhr: XhrFactory;
}

/**
 * En ny falsk backend for én ordre. Pakken gaar gjennom de fem trinnene, ett
 * trinn per henting etter bestillingen, og blir saa `to_review`. En fil med
 * «avvist» i navnet blir `rejected` (`not_pdf`) ved `complete`.
 */
export function createListingTextMock(assignmentId: string, opts: { latencyMs?: number } = {}): ListingTextMock {
  const latency = opts.latencyMs ?? LATENCY_MS;
  const now = new Date().toISOString();
  const docs: MockDoc[] = [];
  let nextDoc = 1;
  let status: "not_ordered" | "processing" | "to_review" = "not_ordered";
  let stepIndex = 0;
  let note: string | null = null;
  const orderKeys = new Set<string>();

  const assignment = {
    id: assignmentId,
    address: "Mockveien 1, 0150 Oslo",
    assignment_no: "MOCK-1",
    created_at: now,
    updated_at: now,
    counts: { images: ROOMS.length, results: 0 },
    images: ROOMS.map((room, i) => ({
      id: `mock_img_${i + 1}`,
      position: i + 1,
      room,
      file_name: `IMG_${4810 + i}.jpg`,
      width: 1500,
      height: 1000,
      thumb_url: thumb(i),
      original_url: thumb(i),
      display_status: null,
      results: [],
    })),
  };

  const wireDoc = (d: MockDoc) => ({
    id: d.id,
    file_name: d.file_name,
    bytes: d.bytes,
    status: d.status,
    kind: null,
    pages: null,
    reject_code: d.reject_code,
    used_in_version: false,
    created_at: now,
  });

  const pkg = () => {
    const processing = status === "processing";
    return {
      assignment_id: assignmentId,
      display_status: status,
      version: status === "to_review" ? 1 : null,
      versions: status === "to_review" ? [{ version: 1, source: "generated", created_at: now }] : [],
      last_run: status === "not_ordered"
        ? null
        : {
            id: "mock_run_1",
            kind: "order",
            status: processing ? "running" : "succeeded",
            step: processing ? RUN_STEPS[stepIndex] : null,
            error_code: null,
            created_at: now,
            updated_at: new Date().toISOString(),
          },
      documents: docs.map(wireDoc),
      note,
      channels: null,
      basis: null,
      limits: { daily_runs: 10, runs_left_today: 9 },
      media_deleted_at: null,
      created_at: now,
      updated_at: new Date().toISOString(),
    };
  };

  const base = `/v1/assignments/${encodeURIComponent(assignmentId)}`;
  const text = `${base}/listing-text`;

  const request: AssignmentRequest = async (path, init) => {
    await wait(latency);
    const method = init.method ?? "GET";
    const url = path.split("?")[0];
    const body = typeof init.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : {};
    const headers = new Headers(init.headers);

    if (method === "GET" && url === base) return json(200, assignment);
    if (method === "GET" && url === text) {
      if (status === "processing") {
        if (stepIndex < RUN_STEPS.length - 1) stepIndex++;
        else status = "to_review";
      }
      return json(200, pkg());
    }
    if (method === "POST" && url === `${text}/documents`) {
      const live = docs.length;
      if (live >= 10) return json(409, { detail: { code: "document_limit", limit: 10 } });
      const key = headers.get("Idempotency-Key");
      let doc = key === null ? undefined : docs.find((d) => d.key === key);
      if (doc === undefined) {
        doc = {
          id: `mock_doc_${nextDoc++}`,
          file_name: String(body.file_name ?? ""),
          bytes: Number(body.bytes ?? 0),
          status: "pending",
          reject_code: null,
          key,
        };
        docs.push(doc);
      }
      return json(201, {
        document: wireDoc(doc),
        upload: {
          signed_url: `mock://upload/${doc.id}?token=mock`,
          token: "mock",
          path: `${assignmentId}/${doc.id}.pdf`,
          expires_at: new Date(Date.now() + 2 * 60 * 60_000).toISOString(),
        },
      });
    }
    const complete = url.match(/\/documents\/([^/]+)\/complete$/);
    if (method === "POST" && complete !== null) {
      const doc = docs.find((d) => d.id === decodeURIComponent(complete[1]));
      if (doc === undefined) return json(404, { detail: "not found" });
      if (doc.file_name.toLowerCase().includes("avvist")) {
        doc.status = "rejected";
        doc.reject_code = "not_pdf";
      } else {
        doc.status = "ready";
      }
      return json(200, { document: wireDoc(doc) });
    }
    const remove = url.match(/\/documents\/([^/]+)$/);
    if (method === "DELETE" && remove !== null) {
      const i = docs.findIndex((d) => d.id === decodeURIComponent(remove[1]));
      if (i === -1) return json(404, { detail: "not found" });
      docs.splice(i, 1);
      return json(204, null);
    }
    if (method === "POST" && url === text) {
      const key = headers.get("Idempotency-Key");
      if (key === null) return json(400, { detail: { code: "idempotency_key_required" } });
      if (!orderKeys.has(key) && status === "processing") return json(409, { detail: { code: "listing_text_busy" } });
      if (!orderKeys.has(key)) {
        orderKeys.add(key);
        note = typeof body.note === "string" ? body.note : null;
        status = "processing";
        stepIndex = 0;
      }
      return json(202, pkg());
    }
    return json(404, { detail: "not found" });
  };

  return { request, xhr: () => new MockXhr() };
}

export { MockXhr };

/** Falsk XHR: fremdrift i steg til 100 %, saa 200 med `Key` som Storage. */
class MockXhr implements UploadXhr {
  readonly marker = MOCK_MARKER;
  status = 0;
  responseText = "";
  readonly upload: UploadXhr["upload"] = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private path = "";

  open(_method: string, url: string): void {
    this.path = url.replace(/^mock:\/\/upload\//, "").split("?")[0];
  }

  setRequestHeader(): void {}

  send(body: Blob): void {
    let percent = 0;
    this.timer = setInterval(() => {
      percent = Math.min(100, percent + PROGRESS_STEP);
      this.upload.onprogress?.({ loaded: (body.size * percent) / 100, total: body.size, lengthComputable: true });
      if (percent >= 100) {
        this.stop();
        this.status = 200;
        this.responseText = JSON.stringify({ Key: `listing-documents/${this.path}` });
        this.onload?.();
      }
    }, PROGRESS_MS);
  }

  abort(): void {
    if (this.timer === null) return;
    this.stop();
    this.onabort?.();
  }

  private stop(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }
}
