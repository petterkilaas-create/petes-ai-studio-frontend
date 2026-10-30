import type { AssignmentRequest } from "./assignments.ts";
import {
  completeListingTextDocument,
  deleteListingTextDocument,
  DOCUMENT_CONTENT_TYPE,
  ListingTextError,
  listingTextErrorCode,
  MAX_DOCUMENT_BYTES,
  MAX_DOCUMENTS,
  startListingTextDocument,
  type ListingTextDocument,
} from "./listingText.ts";

/**
 * Opplastingen av PDF-er til tekstpakken (TG-NEW-281, T2). Én fil om gangen:
 * start (POST …/documents) -> PUT til den signerte lenken -> `complete`
 * (kontrakten §2 og §9.4, proevd i prod 30.10).
 *
 * PUT-kallet (§9.4): XHR, `Content-Type: application/pdf` satt fast (ikke
 * fra `file.type`), fila som raa kropp, og verken `apikey` eller
 * `Authorization`. Tokenet i lenken holder. Storage svarer HTTP 400 ogsaa
 * naar feilen egentlig er 409 eller 415, saa svarteksten leses:
 * `KeyAlreadyExists` betyr at fila ligger der alt (gaa til `complete`),
 * `invalid_mime_type` er en feil.
 *
 * Den signerte lenken og tokenet ligger bare privat i koeen, aldri i radene
 * (React-tilstand), i feilene eller i `console`. Modulen logger ingenting.
 *
 * Ren modul uten React: `request` kobles til authedFetch og `xhr` til
 * XMLHttpRequest der koeen tas i bruk, og begge er falske i testene.
 */

/** Ny lenke naar den gamle har mindre enn dette igjen (lenken varer i 2 timer). */
export const LINK_MARGIN_MS = 60_000;

/** `409 document_not_uploaded` fra `complete` proeves én gang til etter dette. */
export const COMPLETE_RETRY_MS = 2_000;

/** `accept` paa filvelgeren. */
export const DOCUMENT_ACCEPT = "application/pdf,.pdf";

const PDF_MAGIC = "%PDF-";

// --- PUT-kallet --------------------------------------------------------------

/** Den delen av XMLHttpRequest koeen bruker. Falsk i testene og i mock-modusen. */
export interface UploadXhr {
  open(method: string, url: string): void;
  setRequestHeader(name: string, value: string): void;
  send(body: Blob): void;
  abort(): void;
  readonly status: number;
  readonly responseText: string;
  readonly upload: { onprogress: ((ev: { loaded: number; total: number; lengthComputable: boolean }) => void) | null };
  onload: (() => void) | null;
  onerror: (() => void) | null;
  onabort: (() => void) | null;
  ontimeout: (() => void) | null;
}

export type XhrFactory = () => UploadXhr;

/**
 * XMLHttpRequest i nettleseren. Hendelsene faar et argument som koeen ikke
 * bruker; derfor typen gjennom `unknown`.
 */
export const browserXhr: XhrFactory = () => new XMLHttpRequest() as unknown as UploadXhr;

/** Utfallet av PUT-kallet. Ingen tekst fra svaret tas med videre. */
export type PutResult =
  | { kind: "stored" }
  /** 400 med `KeyAlreadyExists`: fila ligger der alt (§9.4). */
  | { kind: "exists" }
  /** 400 med `invalid_mime_type` (415 i svarteksten). */
  | { kind: "invalid_mime_type" }
  /** Annet feilsvar (utloept lenke, for stor fil …): ny start. */
  | { kind: "failed" }
  /** Ingen svar (nettfeil, tidsavbrudd): samme lenke kan proeves igjen. */
  | { kind: "network" }
  | { kind: "aborted" };

/** Svarteksten fra Storage: `{"statusCode":"409","error":"Duplicate","code":"KeyAlreadyExists"}` o.l. */
export function classifyPut(status: number, body: string): PutResult {
  if (status >= 200 && status < 300) return { kind: "stored" };
  if (status === 0) return { kind: "network" };
  let parsed: Record<string, unknown> = {};
  try {
    const raw: unknown = JSON.parse(body);
    if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) parsed = raw as Record<string, unknown>;
  } catch {
    // Ikke JSON: se paa teksten under.
  }
  const fields = [parsed.code, parsed.error].filter((v): v is string => typeof v === "string");
  if (fields.includes("KeyAlreadyExists") || body.includes("KeyAlreadyExists")) return { kind: "exists" };
  if (fields.some((v) => v === "InvalidMimeType" || v === "invalid_mime_type") || body.includes("invalid_mime_type")) {
    return { kind: "invalid_mime_type" };
  }
  return { kind: "failed" };
}

export interface PutHandle {
  done: Promise<PutResult>;
  abort: () => void;
}

/**
 * PUT til den signerte lenken (§9.4). `onProgress` faar hele prosent (0-100).
 * Lenken brukes som den er; den bygges aldri her.
 */
export function putSignedUpload(
  xhrFactory: XhrFactory,
  url: string,
  file: Blob,
  onProgress: (percent: number) => void
): PutHandle {
  const xhr = xhrFactory();
  const done = new Promise<PutResult>((resolve) => {
    xhr.upload.onprogress = (ev) => {
      const total = ev.lengthComputable && ev.total > 0 ? ev.total : file.size;
      if (total > 0) onProgress(Math.min(100, Math.floor((ev.loaded * 100) / total)));
    };
    xhr.onload = () => resolve(classifyPut(xhr.status, xhr.responseText));
    xhr.onerror = () => resolve({ kind: "network" });
    xhr.ontimeout = () => resolve({ kind: "network" });
    xhr.onabort = () => resolve({ kind: "aborted" });
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", DOCUMENT_CONTENT_TYPE);
    xhr.send(file);
  });
  return { done, abort: () => xhr.abort() };
}

// --- sjekken i nettleseren ---------------------------------------------------

/** `invalid_document` (bare PDF), `document_too_large` eller null naar fila kan sendes. */
export function checkDocument(name: string, size: number): string | null {
  if (!name.toLowerCase().endsWith(".pdf") || size <= 0) return "invalid_document";
  if (size > MAX_DOCUMENT_BYTES) return "document_too_large";
  return null;
}

/** De foerste bytene: en PDF starter med `%PDF-`, som backend sjekker ved `complete`. */
export function isPdfHead(head: Uint8Array): boolean {
  return head.length >= PDF_MAGIC.length && [...PDF_MAGIC].every((ch, i) => head[i] === ch.charCodeAt(0));
}

export async function checkPdfHead(file: Blob): Promise<boolean> {
  return isPdfHead(new Uint8Array(await file.slice(0, PDF_MAGIC.length).arrayBuffer()));
}

// --- koeen --------------------------------------------------------------------

export type DocState =
  | "queued"
  | "starting"
  | "uploading"
  | "checking"
  | "ready"
  | "rejected"
  | "failed"
  /** Avbrutt av megleren: dokumentet er slettet, og et nytt forsoek er en ny start. */
  | "aborted";

export interface DocRow {
  id: string;
  fileName: string;
  /** Hele prosent mens fila lastes opp. */
  progress: number;
  state: DocState;
  /** Dokumentet hos backend, naar starten har svart. */
  documentId: string | null;
  /** `not_pdf`, `size_mismatch`, `too_large` (ordlista `listingTextDocumentReject`). */
  rejectCode: string | null;
  /** Koden naar raden feilet (ordlista `listingTextError`). */
  failure: string | null;
  /** «Prøv igjen» finnes (fila er her, og et nytt forsoek kan hjelpe). */
  canRetry: boolean;
}

/** Koder der et nytt forsoek med samme fil ikke hjelper. */
const FINAL_FAILURES = new Set(["invalid_document", "document_too_large", "document_limit", "not_uploaded"]);

/** Det koeen holder for seg selv per rad. Lenken er aldri i DocRow. */
interface Private {
  file: File | null;
  key: string;
  link: { url: string; expiresAt: number } | null;
  handle: PutHandle | null;
}

export interface DocumentQueueOptions {
  request: AssignmentRequest;
  assignmentId: string;
  xhr: XhrFactory;
  onChange?: (rows: readonly DocRow[]) => void;
  newKey?: () => string;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  /** Sjekken av de foerste bytene; byttes i testene. */
  checkHead?: (file: File) => Promise<boolean>;
}

const ACTIVE: ReadonlySet<DocState> = new Set(["queued", "starting", "uploading", "checking"]);

/** Raden teller mot de 10: den venter, er hos backend, eller kan bli det. */
function occupies(row: DocRow): boolean {
  if (row.state === "aborted") return row.documentId !== null;
  if (row.state === "failed") return row.documentId !== null;
  return true;
}

export class DocumentQueue {
  private list: DocRow[] = [];
  private priv = new Map<string, Private>();
  private running = false;
  private nextId = 1;
  private readonly opts: Required<Omit<DocumentQueueOptions, "onChange">> & Pick<DocumentQueueOptions, "onChange">;

  constructor(opts: DocumentQueueOptions) {
    this.opts = {
      ...opts,
      newKey: opts.newKey ?? (() => crypto.randomUUID()),
      now: opts.now ?? (() => Date.now()),
      sleep: opts.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))),
      checkHead: opts.checkHead ?? checkPdfHead,
    };
  }

  get rows(): readonly DocRow[] {
    return this.list;
  }

  /** Noe venter, lastes opp eller kontrolleres: «Bestill» er graa. */
  get busy(): boolean {
    return this.list.some((r) => ACTIVE.has(r.state));
  }

  /** Dokumentene som er `ready`, til bestillingen. */
  get readyIds(): string[] {
    return this.list.filter((r) => r.state === "ready" && r.documentId !== null).map((r) => r.documentId as string);
  }

  /** Plass til saa mange til (hoeyst 10 per pakke). */
  get capacity(): number {
    return Math.max(0, MAX_DOCUMENTS - this.list.filter(occupies).length);
  }

  /**
   * Dokumentene som finnes i pakken fra foer (GET …/listing-text). Bare de
   * koeen ikke kjenner. Et dokument som staar som `pending`, har ingen fil her
   * lenger: det kan bare fjernes.
   */
  seed(documents: readonly ListingTextDocument[]): void {
    const known = new Set(this.list.map((r) => r.documentId));
    const added: DocRow[] = [];
    for (const doc of documents) {
      if (known.has(doc.id)) continue;
      const id = `d${this.nextId++}`;
      this.priv.set(id, { file: null, key: "", link: null, handle: null });
      const base = { id, fileName: doc.fileName, progress: 0, documentId: doc.id, canRetry: false };
      if (doc.status === "ready") added.push({ ...base, state: "ready", rejectCode: null, failure: null });
      else if (doc.status === "rejected") added.push({ ...base, state: "rejected", rejectCode: doc.rejectCode, failure: null });
      else added.push({ ...base, state: "failed", rejectCode: null, failure: "not_uploaded" });
    }
    if (added.length === 0) return;
    this.list = [...this.list, ...added];
    this.changed();
  }

  /**
   * Nye filer bak i koeen. Feil type, for store filer og filer over taket
   * avvises her, uten kall. Gir id-ene til radene.
   */
  add(files: readonly File[]): string[] {
    const ids: string[] = [];
    let room = this.capacity;
    for (const file of files) {
      const id = `d${this.nextId++}`;
      ids.push(id);
      let failure = checkDocument(file.name, file.size);
      if (failure === null && room <= 0) failure = "document_limit";
      if (failure === null) room--;
      this.priv.set(id, { file, key: this.opts.newKey(), link: null, handle: null });
      this.list = [
        ...this.list,
        {
          id,
          fileName: file.name,
          progress: 0,
          state: failure === null ? "queued" : "failed",
          documentId: null,
          rejectCode: null,
          failure,
          canRetry: false,
        },
      ];
    }
    this.changed();
    void this.pump();
    return ids;
  }

  /**
   * «Prøv igjen». Etter nettfeil: samme lenke hvis den fortsatt gjelder,
   * ellers ny start med samme Idempotency-Key (samme dokument). Etter
   * «Avbryt»: ny start med ny noekkel (den gamle er brukt paa et slettet
   * dokument og gir 400, kontrakten §9.1 punkt 6).
   */
  retry(id: string): boolean {
    const row = this.list.find((r) => r.id === id);
    if (row === undefined || !row.canRetry) return false;
    // En rad som ikke teller mot taket (avbrutt og slettet), trenger plass.
    if (!occupies(row) && this.capacity <= 0) {
      this.update(id, { failure: "document_limit" });
      return false;
    }
    this.update(id, { state: "queued", failure: null, progress: 0, canRetry: false });
    void this.pump();
    return true;
  }

  /**
   * «Avbryt» mens fila lastes opp eller venter: opplastingen stoppes, og
   * dokumentet slettes (DELETE), saa det ikke teller mot de 10.
   */
  abort(id: string): boolean {
    const row = this.list.find((r) => r.id === id);
    if (row === undefined) return false;
    if (row.state === "queued") {
      this.toAborted(id);
      return true;
    }
    const p = this.priv.get(id);
    if (row.state !== "uploading" || p?.handle == null) return false;
    p.handle.abort();
    return true;
  }

  /**
   * «Fjern»: dokumentet slettes hos backend (DELETE) og raden tas bort. Ikke
   * mens raden er i arbeid. Gir false naar slettingen feilet (koden staar paa raden).
   */
  async remove(id: string): Promise<boolean> {
    const row = this.list.find((r) => r.id === id);
    if (row === undefined || ACTIVE.has(row.state)) return false;
    if (row.documentId !== null) {
      try {
        await deleteListingTextDocument(this.opts.request, { id: this.opts.assignmentId, documentId: row.documentId });
      } catch (err) {
        if (!(err instanceof ListingTextError && err.httpStatus === 404)) {
          this.update(id, { failure: listingTextErrorCode(err) });
          return false;
        }
      }
    }
    this.list = this.list.filter((r) => r.id !== id);
    this.priv.delete(id);
    this.changed();
    return true;
  }

  private update(id: string, patch: Partial<DocRow>): void {
    this.list = this.list.map((r) => (r.id === id ? { ...r, ...patch } : r));
    this.changed();
  }

  private changed(): void {
    this.opts.onChange?.(this.list);
  }

  private fail(id: string, failure: string, canRetry = true): void {
    this.update(id, { state: "failed", failure, progress: 0, canRetry: canRetry && !FINAL_FAILURES.has(failure) });
  }

  /** Raden er avbrutt; dokumentet slettes, og neste forsoek faar ny noekkel og ny start. */
  private async toAborted(id: string): Promise<void> {
    const p = this.priv.get(id);
    const row = this.list.find((r) => r.id === id);
    if (p === undefined || row === undefined) return;
    p.handle = null;
    p.link = null;
    p.key = this.opts.newKey();
    let documentId = row.documentId;
    let failure: string | null = null;
    if (documentId !== null) {
      try {
        await deleteListingTextDocument(this.opts.request, { id: this.opts.assignmentId, documentId });
        documentId = null;
      } catch (err) {
        if (err instanceof ListingTextError && err.httpStatus === 404) documentId = null;
        else failure = listingTextErrorCode(err);
      }
    }
    this.update(id, { state: "aborted", progress: 0, documentId, failure, canRetry: p.file !== null });
  }

  private async pump(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      for (;;) {
        const row = this.list.find((r) => r.state === "queued");
        if (row === undefined) return;
        await this.run(row.id);
      }
    } finally {
      this.running = false;
    }
  }

  private linkValid(p: Private): boolean {
    return p.link !== null && p.link.expiresAt - this.opts.now() > LINK_MARGIN_MS;
  }

  private async run(id: string): Promise<void> {
    const p = this.priv.get(id);
    if (p === undefined || p.file === null) {
      this.fail(id, "not_uploaded", false);
      return;
    }
    const file = p.file;
    this.update(id, { state: "starting", progress: 0, failure: null });

    if (!(await this.opts.checkHead(file))) {
      this.fail(id, "invalid_document", false);
      return;
    }

    if (!this.linkValid(p)) {
      try {
        const started = await startListingTextDocument(this.opts.request, {
          id: this.opts.assignmentId,
          fileName: file.name,
          bytes: file.size,
          idempotencyKey: p.key,
        });
        const expiresAt = Date.parse(started.upload.expiresAt);
        p.link = {
          url: started.upload.signedUrl,
          // Uten gyldig tidspunkt: regn med to timer fra naa.
          expiresAt: Number.isFinite(expiresAt) ? expiresAt : this.opts.now() + 2 * 60 * 60_000,
        };
        this.update(id, { documentId: started.document.id });
      } catch (err) {
        this.fail(id, listingTextErrorCode(err));
        return;
      }
    }

    this.update(id, { state: "uploading", progress: 0 });
    const link = p.link as { url: string; expiresAt: number };
    p.handle = putSignedUpload(this.opts.xhr, link.url, file, (progress) => {
      const current = this.list.find((r) => r.id === id);
      if (current?.state === "uploading" && current.progress !== progress) this.update(id, { progress });
    });
    const result = await p.handle.done;
    p.handle = null;

    switch (result.kind) {
      case "stored":
      case "exists":
        break;
      case "aborted":
        await this.toAborted(id);
        return;
      case "network":
        // Samme lenke kan proeves igjen innen 2 timer (§9.4).
        this.fail(id, "network");
        return;
      case "invalid_mime_type":
        p.link = null;
        this.fail(id, "invalid_mime_type");
        return;
      case "failed":
        // Utloept lenke eller annet: ny start med samme noekkel gir ny lenke til samme dokument.
        p.link = null;
        this.fail(id, "upload_failed");
        return;
    }

    p.link = null;
    this.update(id, { state: "checking", progress: 100 });
    const documentId = this.list.find((r) => r.id === id)?.documentId ?? null;
    if (documentId === null) {
      this.fail(id, "invalid_response");
      return;
    }
    let doc: ListingTextDocument;
    try {
      doc = await this.complete(documentId);
    } catch (err) {
      this.fail(id, listingTextErrorCode(err));
      return;
    }
    if (doc.status === "ready") this.update(id, { state: "ready", rejectCode: null, canRetry: false });
    else if (doc.status === "rejected") this.update(id, { state: "rejected", rejectCode: doc.rejectCode, canRetry: false });
    else this.fail(id, "document_not_uploaded");
  }

  /** `complete`, med ett nytt forsoek etter 2 s ved `409 document_not_uploaded`. */
  private async complete(documentId: string): Promise<ListingTextDocument> {
    const call = () => completeListingTextDocument(this.opts.request, { id: this.opts.assignmentId, documentId });
    try {
      return await call();
    } catch (err) {
      if (!(err instanceof ListingTextError && err.code === "document_not_uploaded")) throw err;
      await this.opts.sleep(COMPLETE_RETRY_MS);
      return call();
    }
  }
}
