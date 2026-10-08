import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checkOrientation,
  HEAD_BYTES,
  jpegOrientation,
  markersAllowed,
  orientationAllowed,
  readPrefix,
} from "./orientation.ts";

/**
 * TG-NEW-166: retningen i originalen (valg 4 A). Markoerene vises bare for
 * JPEG med retning 1 eller uten retningstag. Syntetiske bytes; fetch er
 * en falsk funksjon, ingen nettverkskall.
 */

function segment(marker: number, data: number[]): number[] {
  const length = data.length + 2;
  return [0xff, marker, length >> 8, length & 0xff, ...data];
}

/** TIFF med IFD0 og én oppfoering (tag, type, antall, verdi). */
function tiff(little: boolean, entries: [number, number, number, number][]): number[] {
  const u16 = (v: number) => (little ? [v & 0xff, v >> 8] : [v >> 8, v & 0xff]);
  const u32 = (v: number) => (little ? [...u16(v & 0xffff), ...u16(v >>> 16)] : [...u16(v >>> 16), ...u16(v & 0xffff)]);
  const head = [...(little ? [0x49, 0x49] : [0x4d, 0x4d]), ...u16(42), ...u32(8)];
  const ifd = [...u16(entries.length)];
  for (const [tag, type, count, value] of entries) ifd.push(...u16(tag), ...u16(type), ...u32(count), ...u16(value), 0, 0);
  return [...head, ...ifd, 0, 0, 0, 0];
}

const EXIF = [0x45, 0x78, 0x69, 0x66, 0, 0];
const SOS = [0xff, 0xda, 0, 2];

function jpeg(...segments: number[][]): Uint8Array {
  return new Uint8Array([0xff, 0xd8, ...segments.flat(), ...SOS]);
}

function withOrientation(value: number, little = false): Uint8Array {
  return jpeg(segment(0xe0, [0x4a, 0x46, 0x49, 0x46, 0]), segment(0xe1, [...EXIF, ...tiff(little, [[0x010f, 2, 1, 0], [0x0112, 3, 1, value]])]));
}

test("JPEG uten EXIF: ingen retningstag, markoerene vises", () => {
  const o = jpegOrientation(jpeg(segment(0xe0, [0x4a, 0x46, 0x49, 0x46, 0])));
  assert.deepEqual(o, { kind: "jpeg", orientation: null });
  assert.equal(markersAllowed(o), true);
});

test("EXIF uten retningstag: markoerene vises", () => {
  const o = jpegOrientation(jpeg(segment(0xe1, [...EXIF, ...tiff(true, [[0x010f, 2, 1, 0]])])));
  assert.deepEqual(o, { kind: "jpeg", orientation: null });
  assert.equal(markersAllowed(o), true);
});

test("retning 1 vises, 3, 6 og 8 gir sperren; begge byte-rekkefoelger (II og MM)", () => {
  for (const little of [true, false]) {
    for (const [value, allowed] of [[1, true], [2, false], [3, false], [6, false], [8, false]] as const) {
      const o = jpegOrientation(withOrientation(value, little));
      assert.deepEqual(o, { kind: "jpeg", orientation: value }, `${value} ${little}`);
      assert.equal(markersAllowed(o), allowed, `${value} ${little}`);
    }
  }
});

test("XMP i APP1 foer Exif hoppes over", () => {
  const xmp = segment(0xe1, [...Array.from("http://ns.adobe.com/xap/1.0/", (c) => c.charCodeAt(0)), 0]);
  const o = jpegOrientation(jpeg(xmp, segment(0xe1, [...EXIF, ...tiff(true, [[0x0112, 3, 1, 6]])])));
  assert.deepEqual(o, { kind: "jpeg", orientation: 6 });
});

test("ugyldig retning (0, 9, feil type) er ukjent og gir sperren", () => {
  for (const entry of [[0x0112, 3, 1, 0], [0x0112, 3, 1, 9], [0x0112, 4, 1, 1]] as [number, number, number, number][]) {
    const o = jpegOrientation(jpeg(segment(0xe1, [...EXIF, ...tiff(true, [entry])])));
    assert.deepEqual(o, { kind: "unknown" }, String(entry));
    assert.equal(markersAllowed(o), false);
  }
});

test("avkuttet fil (foer SOS eller midt i Exif) er ukjent og gir sperren", () => {
  const full = withOrientation(1);
  for (const n of [1, 3, 10, 24, full.length - 20]) {
    const o = jpegOrientation(full.subarray(0, n));
    assert.deepEqual(o, { kind: "unknown" }, String(n));
    assert.equal(markersAllowed(o), false);
  }
});

test("PNG, WebP og AVIF er ikke JPEG og gir sperren", () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
  const avif = new Uint8Array([0, 0, 0, 0x1c, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66]);
  for (const b of [png, webp, avif]) {
    assert.deepEqual(jpegOrientation(b), { kind: "not_jpeg" });
    assert.equal(markersAllowed(jpegOrientation(b)), false);
  }
});

/** En stroem i biter, som teller hvor mye som er lest og om den ble avbrutt. */
function stream(bytes: Uint8Array, chunk: number) {
  const state = { pulled: 0, cancelled: false };
  let offset = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.length) return controller.close();
      const part = bytes.subarray(offset, offset + chunk);
      offset += part.length;
      state.pulled += part.length;
      controller.enqueue(part);
    },
    cancel() {
      state.cancelled = true;
    },
  }, { highWaterMark: 0 });
  return { body, state };
}

test("readPrefix: et svar med hele fila (200) leses bare til grensen og avbrytes", async () => {
  const big = new Uint8Array(HEAD_BYTES * 10).fill(7);
  const { body, state } = stream(big, 16384);
  const head = await readPrefix(body, HEAD_BYTES);
  assert.equal(head.length, HEAD_BYTES);
  assert.equal(state.cancelled, true);
  assert.ok(state.pulled <= HEAD_BYTES + 16384, `leste ${state.pulled}`);
});

test("readPrefix: en kort fil leses helt, uten avbrudd", async () => {
  const { body, state } = stream(new Uint8Array(1000).fill(1), 300);
  const head = await readPrefix(body, HEAD_BYTES);
  assert.equal(head.length, 1000);
  assert.equal(state.cancelled, false);
});

function response(status: number, bytes: Uint8Array) {
  return new Response(stream(bytes, 4096).body, { status });
}

test("checkOrientation: sender Range for de foerste 64 KB, og 206 med retning 1 gir true", async () => {
  const seen: RequestInit[] = [];
  const ok = await checkOrientation("https://x/a.jpg", async (_url, init) => {
    seen.push(init);
    return response(206, withOrientation(1));
  });
  assert.equal(ok, true);
  assert.deepEqual(seen[0].headers, { Range: `bytes=0-${HEAD_BYTES - 1}` });
});

test("checkOrientation: 200 med hele fila virker ogsaa", async () => {
  const file = new Uint8Array(HEAD_BYTES * 4);
  file.set(withOrientation(1));
  assert.equal(await checkOrientation("https://x/b.jpg", async () => response(200, file)), true);
});

test("checkOrientation: retning 6, feilstatus, nettverksfeil og tidsavbrudd gir false, aldri en feil", async () => {
  assert.equal(await checkOrientation("https://x/c", async () => response(206, withOrientation(6))), false);
  assert.equal(await checkOrientation("https://x/d", async () => response(403, withOrientation(1))), false);
  assert.equal(
    await checkOrientation("https://x/e", async () => {
      throw new TypeError("Failed to fetch");
    }),
    false
  );
  const slow = (_url: string, init: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    });
  assert.equal(await checkOrientation("https://x/f", slow, 10), false);
});

test("orientationAllowed: hentes bare én gang per URL", async () => {
  let calls = 0;
  const fake = async () => {
    calls += 1;
    return response(206, withOrientation(1));
  };
  assert.equal(await orientationAllowed("https://x/cache-1", fake), true);
  assert.equal(await orientationAllowed("https://x/cache-1", fake), true);
  assert.equal(calls, 1);
  assert.equal(await orientationAllowed("https://x/cache-2", fake), true);
  assert.equal(calls, 2);
});
