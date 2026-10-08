/**
 * Retningen (EXIF Orientation) i originalen, for markoerene (TG-NEW-166).
 *
 * Analysen faar bytene med EXIF, og det er ikke kjent om Gemini roterer etter
 * retningen foer boksen lages. Nettleseren roterer bildet. Derfor vises
 * markoerene bare for JPEG med retning 1 eller uten retningstag (Petter 08.10,
 * valg 4 A). Alt annet gir sperren: andre retninger, PNG, WebP, AVIF,
 * oedelagte filer og feil i hentingen.
 *
 * Rene funksjoner uten import, saa de kan testes med node --test.
 */

/** Hvor mye av originalen som leses: EXIF ligger helt foerst i JPEG-en. */
export const HEAD_BYTES = 65536;

/** Tidsavbrudd for hentingen. */
export const HEAD_TIMEOUT_MS = 8000;

export type ImageOrientation =
  /** null: JPEG uten retningstag. */
  | { kind: "jpeg"; orientation: number | null }
  | { kind: "not_jpeg" }
  /** Avkuttet eller oedelagt: ingen sikker retning. */
  | { kind: "unknown" };

const UNKNOWN: ImageOrientation = { kind: "unknown" };

/** Retningen i IFD0 i TIFF-delen av et Exif-segment; `t` er starten paa TIFF. */
function tiffOrientation(b: Uint8Array, t: number, end: number): ImageOrientation {
  if (t + 8 > end) return UNKNOWN;
  const little = b[t] === 0x49 && b[t + 1] === 0x49;
  const big = b[t] === 0x4d && b[t + 1] === 0x4d;
  if (!little && !big) return UNKNOWN;
  const u16 = (i: number) => (little ? b[i] | (b[i + 1] << 8) : (b[i] << 8) | b[i + 1]);
  const u32 = (i: number) => (little ? u16(i) + u16(i + 2) * 65536 : u16(i) * 65536 + u16(i + 2));
  if (u16(t + 2) !== 42) return UNKNOWN;
  const ifd = t + u32(t + 4);
  if (ifd + 2 > end) return UNKNOWN;
  const count = u16(ifd);
  if (ifd + 2 + count * 12 > end) return UNKNOWN;
  for (let n = 0; n < count; n++) {
    const e = ifd + 2 + n * 12;
    if (u16(e) !== 0x0112) continue;
    // SHORT (3), én verdi, 1-8. Alt annet er ikke en retning vi stoler paa.
    if (u16(e + 2) !== 3 || u32(e + 4) !== 1) return UNKNOWN;
    const value = u16(e + 8);
    return value >= 1 && value <= 8 ? { kind: "jpeg", orientation: value } : UNKNOWN;
  }
  return { kind: "jpeg", orientation: null };
}

/**
 * Retningen fra de foerste bytene av fila. Leser segmentene fram til det
 * foerste Exif-segmentet (APP1 med `Exif\0\0`) eller bildedataene (SOS).
 * Naar bytene slutter foer det, er retningen ukjent.
 */
export function jpegOrientation(b: Uint8Array): ImageOrientation {
  if (b.length < 2) return UNKNOWN;
  if (b[0] !== 0xff || b[1] !== 0xd8) return { kind: "not_jpeg" };
  let i = 2;
  while (i + 1 < b.length) {
    if (b[i] !== 0xff) return UNKNOWN;
    const marker = b[i + 1];
    if (marker === 0xff) {
      i += 1; // fyllbyte
      continue;
    }
    // Bildedataene eller slutten: ingen retningstag foer dem.
    if (marker === 0xda || marker === 0xd9) return { kind: "jpeg", orientation: null };
    // Markoerer uten lengde.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    if (i + 4 > b.length) return UNKNOWN;
    const length = (b[i + 2] << 8) | b[i + 3];
    if (length < 2) return UNKNOWN;
    const data = i + 4;
    const end = Math.min(i + 2 + length, b.length);
    const exif =
      marker === 0xe1 &&
      end - data >= 6 &&
      b[data] === 0x45 && // E
      b[data + 1] === 0x78 && // x
      b[data + 2] === 0x69 && // i
      b[data + 3] === 0x66 && // f
      b[data + 4] === 0 &&
      b[data + 5] === 0;
    if (exif) return tiffOrientation(b, data + 6, end);
    i += 2 + length;
  }
  return UNKNOWN;
}

/** Sperren (valg 4 A): bare JPEG med retning 1 eller uten retningstag. */
export function markersAllowed(o: ImageOrientation): boolean {
  return o.kind === "jpeg" && (o.orientation === null || o.orientation === 1);
}

/**
 * De foerste `limit` bytene fra en strøm. Strømmen avbrytes (`cancel`) naar
 * nok er lest, saa et svar med hele fila (200 i stedet for 206) ikke lastes
 * ned til slutt.
 */
export async function readPrefix(body: ReadableStream<Uint8Array>, limit: number): Promise<Uint8Array> {
  const reader = body.getReader();
  const out = new Uint8Array(limit);
  let size = 0;
  try {
    while (size < limit) {
      const { done, value } = await reader.read();
      if (done) break;
      const take = Math.min(value.length, limit - size);
      out.set(value.subarray(0, take), size);
      size += take;
    }
  } finally {
    if (size >= limit) await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  return out.subarray(0, size);
}

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/**
 * Kan markoerene vises paa bildet bak `url`? Henter de foerste 64 KB med
 * `Range`. Alle feil (nettverk, CORS, tidsavbrudd, annen status enn 200 og
 * 206) gir false, aldri en feil videre.
 */
export async function checkOrientation(
  url: string,
  fetchImpl: FetchLike = (u, init) => fetch(u, init),
  timeoutMs: number = HEAD_TIMEOUT_MS
): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      headers: { Range: `bytes=0-${HEAD_BYTES - 1}` },
      signal: controller.signal,
    });
    if ((res.status !== 200 && res.status !== 206) || res.body === null) return false;
    return markersAllowed(jpegOrientation(await readPrefix(res.body, HEAD_BYTES)));
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

const checked = new Map<string, Promise<boolean>>();

/** Som checkOrientation, men hentes bare én gang per URL (ogsaa naar knappen trykkes paa nytt). */
export function orientationAllowed(url: string, fetchImpl?: FetchLike): Promise<boolean> {
  let result = checked.get(url);
  if (result === undefined) {
    result = checkOrientation(url, fetchImpl);
    checked.set(url, result);
  }
  return result;
}
