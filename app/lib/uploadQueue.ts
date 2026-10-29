import { AssignmentError, MAX_IMAGES_PER_ASSIGNMENT, type AssignmentImage } from "./assignments.ts";

/**
 * Opplastingskoeen for ordren (TG-NEW-277, FE-0; audit punkt 2). Ett bilde
 * per kall (K 2.4), tre samtidige, status per fil og «Last opp paa nytt» for
 * de som feilet, med SAMME Idempotency-Key (samme noekkel gir samme bilde,
 * saa et kall som egentlig kom fram, gir ikke to bilder).
 *
 * Foer kallet sjekkes stoerrelsen og formatet i nettleseren (Petter 29.10:
 * ingen HEIC ved lansering, «JPG eller PNG»). Backend sjekker uansett.
 *
 * Ren modul uten React og uten api.ts: `send` kobles til
 * uploadAssignmentImage der koeen tas i bruk, og er falsk i testene.
 */

export const UPLOAD_CONCURRENCY = 3;

/** 413 image_too_large over dette (K 2.4). */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/** `accept` paa filvelgeren. */
export const UPLOAD_ACCEPT = "image/jpeg,image/png";

/** Bytene som trengs for aa kjenne igjen formatet. */
const HEAD_BYTES = 16;

export type ImageKind = "jpeg" | "png" | "heic" | "other";

const HEIC_BRANDS = new Set(["heic", "heix", "heim", "heis", "hevc", "hevx", "mif1", "msf1"]);

/** Formatet fra de foerste bytene: JPEG (FF D8 FF), PNG (signaturen) eller HEIC (`ftyp` + merke). */
export function imageKind(b: Uint8Array): ImageKind {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (b.length >= 8 && png.every((v, i) => b[i] === v)) return "png";
  if (b.length >= 12 && String.fromCharCode(...b.subarray(4, 8)) === "ftyp") {
    if (HEIC_BRANDS.has(String.fromCharCode(...b.subarray(8, 12)))) return "heic";
  }
  return "other";
}

/** Hvorfor en fil ikke ble lastet opp: koden fra K 2.4 (og `network`), med `reason` for unsupported_image. */
export interface UploadFailure {
  code: string;
  reason: string | null;
}

/** Sjekken foer kallet, eller null naar fila kan sendes. */
export function checkHead(size: number, head: Uint8Array): UploadFailure | null {
  const kind = imageKind(head);
  if (kind === "heic") return { code: "unsupported_image", reason: "heic" };
  if (kind === "other") return { code: "unsupported_image", reason: "format" };
  if (size > MAX_UPLOAD_BYTES) return { code: "image_too_large", reason: null };
  return null;
}

export async function checkFile(file: Blob): Promise<UploadFailure | null> {
  const head = new Uint8Array(await file.slice(0, HEAD_BYTES).arrayBuffer());
  return checkHead(file.size, head);
}

/**
 * Kan raden proeves paa nytt? Formatet og stoerrelsen blir ikke bedre av et
 * nytt forsoek; alt annet (nett, kapasitet, taket etter at bilder er fjernet) kan.
 */
export function retryable(failure: UploadFailure): boolean {
  return failure.code !== "unsupported_image" && failure.code !== "image_too_large";
}

/** Feilen fra `send` som en UploadFailure. Alt som ikke er et svar fra backend, er `network`. */
export function failureFrom(err: unknown): UploadFailure {
  if (err instanceof AssignmentError) {
    const reason = typeof err.detail.reason === "string" ? err.detail.reason : null;
    if (err.code !== null) return { code: err.code, reason };
    if (err.httpStatus === 413) return { code: "image_too_large", reason: null };
    return { code: `http_${err.httpStatus}`, reason: null };
  }
  return { code: "network", reason: null };
}

export type UploadState = "queued" | "uploading" | "done" | "failed";

export interface UploadRow {
  id: string;
  file: File;
  /** Idempotency-Key: fast for raden, ogsaa ved «Last opp paa nytt». */
  key: string;
  state: UploadState;
  failure: UploadFailure | null;
  /** Bildet fra backend naar raden er ferdig. */
  image: AssignmentImage | null;
}

export type UploadSend = (file: File, key: string) => Promise<AssignmentImage>;

export interface UploadQueueOptions {
  send: UploadSend;
  /** Kalles med en ny liste etter hver endring (ny array, nye rader), klar for setState. */
  onChange?: (rows: readonly UploadRow[]) => void;
  /** Hvor mange bilder ordren kan ta imot til (60 minus bildene den har). */
  capacity?: number;
  concurrency?: number;
  newKey?: () => string;
  /** Sjekken foer kallet; byttes i testene. */
  check?: (file: File) => Promise<UploadFailure | null>;
}

const LIMIT = "assignment_image_limit";

export class UploadQueue {
  private list: UploadRow[] = [];
  private active = 0;
  private remaining: number;
  private nextId = 1;
  private waiters: (() => void)[] = [];
  private readonly opts: Required<Omit<UploadQueueOptions, "onChange">> & Pick<UploadQueueOptions, "onChange">;

  constructor(opts: UploadQueueOptions) {
    this.opts = {
      send: opts.send,
      onChange: opts.onChange,
      capacity: opts.capacity ?? MAX_IMAGES_PER_ASSIGNMENT,
      concurrency: opts.concurrency ?? UPLOAD_CONCURRENCY,
      newKey: opts.newKey ?? (() => crypto.randomUUID()),
      check: opts.check ?? checkFile,
    };
    this.remaining = this.opts.capacity;
  }

  get rows(): readonly UploadRow[] {
    return this.list;
  }

  /** Noe venter eller lastes opp: «Neste» er av til koeen er tom. */
  get busy(): boolean {
    return this.list.some((r) => r.state === "queued" || r.state === "uploading");
  }

  /** Taket er naadd (vises én gang over lista). */
  get limitReached(): boolean {
    return this.list.some((r) => r.state === "failed" && r.failure?.code === LIMIT);
  }

  /** Nye filer bak i koeen. Gir id-ene til radene. */
  add(files: readonly File[]): string[] {
    const ids: string[] = [];
    for (const file of files) {
      const id = `u${this.nextId++}`;
      ids.push(id);
      this.list = [...this.list, { id, file, key: this.opts.newKey(), state: "queued", failure: null, image: null }];
    }
    this.changed();
    this.pump();
    return ids;
  }

  /** «Last opp paa nytt»: feilede rader som kan proeves igjen, med samme noekkel. Gir antallet. */
  retryFailed(): number {
    let n = 0;
    this.list = this.list.map((r) => {
      if (r.state !== "failed" || r.failure === null || !retryable(r.failure)) return r;
      n++;
      return { ...r, state: "queued", failure: null };
    });
    if (n > 0) {
      this.changed();
      this.pump();
    }
    return n;
  }

  /** Fjern en rad som ikke lastes opp akkurat naa. */
  remove(id: string): boolean {
    const row = this.list.find((r) => r.id === id);
    if (row === undefined || row.state === "uploading") return false;
    this.list = this.list.filter((r) => r.id !== id);
    this.changed();
    return true;
  }

  /** Ordren har faatt plass til flere (et bilde er fjernet), eller tallet er hentet paa nytt. */
  setCapacity(capacity: number): void {
    const done = this.list.filter((r) => r.state === "done" || r.state === "uploading").length;
    this.remaining = Math.max(0, capacity - done);
  }

  /** Loeses naar ingenting venter eller lastes opp. */
  idle(): Promise<void> {
    if (!this.busy) return Promise.resolve();
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  private update(id: string, patch: Partial<UploadRow>): void {
    this.list = this.list.map((r) => (r.id === id ? { ...r, ...patch } : r));
    this.changed();
  }

  private changed(): void {
    this.opts.onChange?.(this.list);
    if (!this.busy) {
      const waiters = this.waiters;
      this.waiters = [];
      for (const w of waiters) w();
    }
  }

  /** Taket er naadd: alt som venter, feiler med samme kode uten kall. */
  private halt(): void {
    this.remaining = 0;
    this.list = this.list.map((r) => (r.state === "queued" ? { ...r, state: "failed", failure: { code: LIMIT, reason: null } } : r));
    this.changed();
  }

  private pump(): void {
    while (this.active < this.opts.concurrency) {
      const row = this.list.find((r) => r.state === "queued");
      if (row === undefined) return;
      if (this.remaining <= 0) {
        this.halt();
        return;
      }
      this.remaining--;
      this.active++;
      this.update(row.id, { state: "uploading" });
      void this.run(row);
    }
  }

  private async run(row: UploadRow): Promise<void> {
    let failure: UploadFailure | null = null;
    let image: AssignmentImage | null = null;
    try {
      failure = await this.opts.check(row.file);
      if (failure === null) image = await this.opts.send(row.file, row.key);
    } catch (err) {
      failure = failureFrom(err);
    }
    this.active--;
    if (!this.list.some((r) => r.id === row.id)) {
      // Raden ble fjernet underveis (skal ikke skje: remove avviser opplasting).
      if (image === null) this.remaining++;
    } else if (image !== null) {
      this.update(row.id, { state: "done", image, failure: null });
    } else {
      this.remaining++;
      this.update(row.id, { state: "failed", failure });
      if (failure?.code === LIMIT) this.halt();
    }
    this.pump();
  }
}
