import { test } from "node:test";
import assert from "node:assert/strict";
import {
  avifTransforms,
  checkOrientation,
  HEAD_BYTES,
  imageOrientation,
  jpegOrientation,
  markersAllowed,
  markersGate,
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

test("PNG, WebP og AVIF er ikke JPEG for jpegOrientation", () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
  const avif = new Uint8Array([0, 0, 0, 0x1c, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66]);
  for (const b of [png, webp, avif]) {
    assert.deepEqual(jpegOrientation(b), { kind: "other" });
    assert.equal(markersAllowed(jpegOrientation(b)), false);
  }
});

// ---------------------------------------------------------------------------
// TG-166-oppfoelging: AVIF. Pillow (backend) dekoder uten irot, imir og clap;
// nettleseren bruker dem. Bare AVIF uten dem slipper gjennom.
// ---------------------------------------------------------------------------

const ascii = (s: string) => Array.from(s, (c) => c.charCodeAt(0));
const u32be = (v: number) => [(v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff];

function box(type: string, content: number[]): number[] {
  return [...u32be(content.length + 8), ...ascii(type), ...content];
}

const ISPE = box("ispe", [0, 0, 0, 0, ...u32be(40), ...u32be(20)]);
const IROT = box("irot", [1]);
const IMIR = box("imir", [0]);
const CLAP = box("clap", new Array(32).fill(0));

/** AVIF med `ftyp`, `meta` (hdlr, pitm, iprp > ipco + ipma) og en `mdat` som er lenger enn bytene (avkuttet, som med Range). */
function avif(props: number[][], brand = "avif", before: number[][] = []): Uint8Array {
  const ipco = box("ipco", props.flat());
  const iprp = box("iprp", [...ipco, ...box("ipma", [0, 0, 0, 0, ...u32be(0)])]);
  const meta = box("meta", [0, 0, 0, 0, ...box("hdlr", [0, 0, 0, 0, 0, 0, 0, 0, ...ascii("pict"), ...new Array(13).fill(0)]), ...box("pitm", [0, 0, 0, 0, 0, 1]), ...iprp]);
  const ftyp = box("ftyp", [...ascii(brand), 0, 0, 0, 0, ...ascii("mif1"), ...ascii(brand)]);
  return new Uint8Array([...ftyp, ...before.flat(), ...meta, ...u32be(500000), ...ascii("mdat"), 1, 2, 3]);
}

test("AVIF uten irot, imir og clap: markoerene vises, ogsaa med mdat avkuttet", () => {
  const o = imageOrientation(avif([ISPE]));
  assert.deepEqual(o, { kind: "avif", transformed: false });
  assert.equal(markersAllowed(o), true);
  // En free-boks foer meta er grei.
  assert.equal(markersAllowed(imageOrientation(avif([ISPE], "avif", [box("free", [0, 0])]))), true);
});

test("AVIF med irot, imir eller clap gir sperren", () => {
  for (const [name, prop] of [["irot", IROT], ["imir", IMIR], ["clap", CLAP]] as const) {
    const o = imageOrientation(avif([ISPE, prop]));
    assert.deepEqual(o, { kind: "avif", transformed: true }, name);
    assert.equal(markersAllowed(o), false, name);
  }
});

test("AVIF-sekvens (avis), HEIC og mif1 som hovedmerke gir sperren", () => {
  for (const brand of ["avis", "heic", "mif1"]) {
    const o = imageOrientation(avif([ISPE], brand));
    assert.deepEqual(o, { kind: "other" }, brand);
    assert.equal(markersAllowed(o), false, brand);
  }
});

test("AVIF der meta ikke er helt innenfor bytene (meta etter 64 KB eller avkuttet) gir sperren", () => {
  // En stor mdat foer meta: meta naas ikke.
  const late = avif([ISPE], "avif", [[...u32be(HEAD_BYTES * 2), ...ascii("mdat")]]);
  assert.deepEqual(imageOrientation(late.subarray(0, HEAD_BYTES)), { kind: "unknown" });
  const full = avif([ISPE]);
  const metaEnd = full.length - 11;
  for (const n of [8, 12, 30, 40, 60, metaEnd - 1]) {
    const o = imageOrientation(full.subarray(0, n));
    assert.equal(markersAllowed(o), false, String(n));
  }
  assert.deepEqual(imageOrientation(full.subarray(0, metaEnd)), { kind: "avif", transformed: false });
});

test("AVIF uten iprp eller ipco, med feil boksstoerrelser eller stoerrelse 0 og 1, gir sperren", () => {
  const ftyp = box("ftyp", [...ascii("avif"), 0, 0, 0, 0, ...ascii("mif1")]);
  const noIprp = new Uint8Array([...ftyp, ...box("meta", [0, 0, 0, 0, ...box("pitm", [0, 0, 0, 0, 0, 1])])]);
  const noIpco = new Uint8Array([...ftyp, ...box("meta", [0, 0, 0, 0, ...box("iprp", box("ipma", [0, 0, 0, 0]))])]);
  // ipco med en barneboks som er for lang for ipco.
  const badChild = new Uint8Array([...ftyp, ...box("meta", [0, 0, 0, 0, ...box("iprp", box("ipco", [...u32be(99), ...ascii("ispe"), 0, 0, 0, 0]))])]);
  // Stoerrelse 0 (til slutten) og 1 (64 bit) paa toppnivaa foer meta.
  const size0 = new Uint8Array([...ftyp, ...u32be(0), ...ascii("free"), ...avif([ISPE]).subarray(ftyp.length)]);
  const size1 = new Uint8Array([...ftyp, ...u32be(1), ...ascii("free"), ...u32be(0), ...u32be(16)]);
  for (const [name, b] of [["uten iprp", noIprp], ["uten ipco", noIpco], ["barn for lang", badChild], ["stoerrelse 0", size0], ["stoerrelse 1", size1]] as const) {
    assert.deepEqual(avifTransforms(b), { kind: "unknown" }, name);
    assert.equal(markersAllowed(imageOrientation(b)), false, name);
  }
});

test("ekte AVIF fra Pillow 12.3.0 (libavif 1.4.2): uten retning vises, med retning 6 (irot) gir sperren", () => {
  const hex = (h: string) => new Uint8Array(h.match(/../g)!.map((x) => parseInt(x, 16)));
  const plain = hex("00000020667479706176696600000000617669666d6966316d6961664d413142000000eb6d657461000000000000002168646c72000000000000000070696374000000000000000000000000000000000e7069746d0000000000010000001e696c6f63000000004400000100010000000100000113000000380000002869696e660000000000010000001a696e6665020000000001000061763031436f6c6f72000000006a697072700000004b6970636f0000001469737065000000000000002800000014000000107069786900000000030808080000000c6176314381000c0000000013636f6c726e636c780001000d0006800000001769706d61000000000000000100010401028304000000406d64617412000a091815279b4404341a1032294481fdfdaa4020820f900020effaf8fa04079eea769039740fc664417f19366984492f995c60037706");
  const rotated = hex("00000020667479706176696600000000617669666d6966316d6961664d413142000000f56d657461000000000000002168646c72000000000000000070696374000000000000000000000000000000000e7069746d0000000000010000001e696c6f6300000000440000010001000000010000011d000000380000002869696e660000000000010000001a696e6665020000000001000061763031436f6c6f72000000007469707270000000546970636f0000001469737065000000000000002800000014000000107069786900000000030808080000000c6176314381000c0000000013636f6c726e636c780001000d0006800000000969726f74030000001869706d6100000000000000010001050102830485000000406d64617412000a091815279b4404341a1032294481fdfdaa4020820f900020effaf8fa04079eea769039740fc664417f19366984492f995c60037706");
  assert.deepEqual(imageOrientation(plain), { kind: "avif", transformed: false });
  assert.deepEqual(imageOrientation(rotated), { kind: "avif", transformed: true });
});

test("imageOrientation: JPEG leses som foer, og PNG og WebP gir sperren", () => {
  assert.deepEqual(imageOrientation(withOrientation(1)), { kind: "jpeg", orientation: 1 });
  assert.deepEqual(imageOrientation(withOrientation(6)), { kind: "jpeg", orientation: 6 });
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
  for (const b of [png, webp]) assert.equal(markersAllowed(imageOrientation(b)), false);
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

test("checkOrientation: AVIF uten irot gir true, med irot false", async () => {
  assert.equal(await checkOrientation("https://x/g.avif", async () => response(206, avif([ISPE]))), true);
  assert.equal(await checkOrientation("https://x/h.avif", async () => response(206, avif([ISPE, IROT]))), false);
});

// ---------------------------------------------------------------------------
// TG-NEW-170 PR 3b: med input_orientation hentes ikke bildet.
// ---------------------------------------------------------------------------

test("markersGate: med input_orientation vises markoerene uten aa hente bildet", async () => {
  let calls = 0;
  const counting = async () => {
    calls += 1;
    return response(206, withOrientation(6));
  };
  // Ogsaa for en URL der bildet har retning 6 (stoerende bilde, som be21c202).
  assert.equal(await markersGate("https://x/gate-1", true, counting), true);
  assert.equal(await markersGate("https://x/gate-2", true, counting), true);
  assert.equal(calls, 0);
});

test("markersGate: uten input_orientation sjekkes originalen som foer, med Range", async () => {
  const seen: RequestInit[] = [];
  const fake = (bytes: Uint8Array) => async (_url: string, init: RequestInit) => {
    seen.push(init);
    return response(206, bytes);
  };
  assert.equal(await markersGate("https://x/gate-3", false, fake(withOrientation(1))), true);
  assert.equal(await markersGate("https://x/gate-4", false, fake(withOrientation(6))), false);
  assert.equal(seen.length, 2);
  for (const init of seen) assert.deepEqual(init.headers, { Range: `bytes=0-${HEAD_BYTES - 1}` });
});
