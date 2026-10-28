import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  addBox,
  addPin,
  addStroke,
  boxFrom,
  canAddPin,
  canRedo,
  canUndo,
  clampWidth,
  extendStroke,
  HISTORY_MAX,
  imageToPane,
  inPane,
  MAX_PINS,
  paneToImage,
  pinCount,
  pinNumber,
  redo,
  removeMark,
  serializeMark,
  serializeMarks,
  startStroke,
  STROKE_WIDTH_DEFAULT,
  STROKE_WIDTH_MAX,
  STROKE_WIDTH_MIN,
  strokePath,
  STUDIO_START,
  studioKey,
  svgFrame,
  undo,
  type StudioState,
} from "./studio.ts";
import { pinchPoint, pinchView, VIEW_START, zoomAt, type View } from "./zoom.ts";
import { DICTIONARIES } from "./i18n/index.ts";

// Dag 57: korreksjonsstudioet FE-2, lerretet for markering (ikke i bruk).
// V6: 0–1 i resultatets ramme. F1: én kjoering er én runde med inntil tre naaler.

const APP = join(dirname(fileURLToPath(import.meta.url)), "..");
/** Uten kommentarer, saa en kommentar ikke kan oppfylle eller bryte en sjekk. */
const code = (rel: string) =>
  readFileSync(join(APP, rel), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const near = (a: number, b: number, msg?: string) => assert.ok(Math.abs(a - b) < 1e-9, `${msg ?? ""} ${a} != ${b}`);

// ---------------------------------------------------------------------------
// Fra ruta til bildet
// ---------------------------------------------------------------------------

test("paneToImage: uten zoom er ruta og bildet det samme", () => {
  assert.deepEqual(paneToImage(VIEW_START, 0, 0), { x: 0, y: 0 });
  assert.deepEqual(paneToImage(VIEW_START, 1, 1), { x: 1, y: 1 });
  assert.deepEqual(paneToImage(VIEW_START, 0.25, 0.75), { x: 0.25, y: 0.75 });
});

test("paneToImage: 200 % i midten viser den midtre halvdelen", () => {
  const v: View = { scale: 2, cx: 0.5, cy: 0.5 };
  assert.deepEqual(paneToImage(v, 0, 0), { x: 0.25, y: 0.25 });
  assert.deepEqual(paneToImage(v, 0.5, 0.5), { x: 0.5, y: 0.5 });
  assert.deepEqual(paneToImage(v, 1, 1), { x: 0.75, y: 0.75 });
});

test("paneToImage: zoom og panorering til hjoernet nederst til hoeyre", () => {
  const v: View = { scale: 2, cx: 0.75, cy: 0.75 };
  assert.deepEqual(paneToImage(v, 0, 0), { x: 0.5, y: 0.5 });
  assert.deepEqual(paneToImage(v, 1, 1), { x: 1, y: 1 });
  const p = paneToImage({ scale: 1.5, cx: 0.4, cy: 0.6 }, 0.3, 0.9);
  assert.ok(p !== null);
  near(p.x, 0.4 - 1 / 3 + 0.3 / 1.5, "x");
  near(p.y, 0.6 - 1 / 3 + 0.9 / 1.5, "y");
});

test("paneToImage: punktet under fingrene staar i ro naar zoomAt og pinchView zoomer", () => {
  const v: View = { scale: 1.25, cx: 0.45, cy: 0.55 };
  const before = paneToImage(v, 0.3, 0.7);
  const after = paneToImage(zoomAt(v, 1.75, 0.3, 0.7), 0.3, 0.7);
  assert.ok(before !== null && after !== null);
  near(after.x, before.x, "zoomAt x");
  near(after.y, before.y, "zoomAt y");
  // To fingre som sprer seg rundt samme midtpunkt.
  const rect = { left: 0, top: 0, width: 400, height: 300 };
  const from = pinchPoint({ x: 150, y: 140 }, { x: 170, y: 160 }, rect);
  const to = pinchPoint({ x: 140, y: 130 }, { x: 180, y: 170 }, rect);
  const pinched = pinchView(VIEW_START, from, to);
  const p = paneToImage(pinched, from.x, from.y);
  assert.ok(p !== null);
  near(p.x, from.x, "pinch x");
  near(p.y, from.y, "pinch y");
});

test("paneToImage: grensene 0–1 holder ogsaa utenfor ruta og med et utsnitt utenfor bildet", () => {
  assert.deepEqual(paneToImage(VIEW_START, -0.2, 1.4), { x: 0, y: 1 });
  assert.deepEqual(paneToImage({ scale: 2, cx: 0.25, cy: 0.25 }, 3, -3), { x: 1, y: 0 });
  // Et utsnitt som ikke er klemt (midten utenfor), klemmes foer regningen.
  assert.deepEqual(paneToImage({ scale: 2, cx: 0, cy: 1 }, 0, 0), { x: 0, y: 0.5 });
  // Skala over taket regnes som 200 %.
  assert.deepEqual(paneToImage({ scale: 9, cx: 0.5, cy: 0.5 }, 0, 0), { x: 0.25, y: 0.25 });
  assert.equal(paneToImage(VIEW_START, Number.NaN, 0.5), null);
  assert.equal(paneToImage(VIEW_START, 0.5, Number.POSITIVE_INFINITY), null);
});

test("imageToPane er motsatt vei, og naaler utenfor utsnittet er ikke i ruta", () => {
  const v: View = { scale: 2, cx: 0.75, cy: 0.25 };
  for (const [fx, fy] of [
    [0, 0],
    [0.5, 0.5],
    [0.2, 0.9],
  ]) {
    const p = paneToImage(v, fx, fy);
    assert.ok(p !== null);
    const back = imageToPane(v, p);
    near(back.x, fx, "x");
    near(back.y, fy, "y");
  }
  assert.equal(inPane(imageToPane(v, { x: 0.1, y: 0.1 })), false);
  assert.equal(inPane(imageToPane(v, { x: 0.75, y: 0.25 })), true);
  assert.equal(inPane(imageToPane(VIEW_START, { x: 1, y: 0 })), true);
});

// ---------------------------------------------------------------------------
// Naaler, stroek og bokser
// ---------------------------------------------------------------------------

test("naal: hoeyst tre; den fjerde gir samme tilstand tilbake", () => {
  let s: StudioState = STUDIO_START;
  for (let i = 0; i < MAX_PINS; i++) s = addPin(s, { x: 0.1 * (i + 1), y: 0.5 });
  assert.equal(MAX_PINS, 3);
  assert.equal(pinCount(s.marks), 3);
  assert.equal(canAddPin(s), false);
  const after = addPin(s, { x: 0.9, y: 0.9 });
  assert.equal(after, s);
  assert.equal(pinCount(after.marks), 3);
  // Stroek og bokser teller ikke som naaler.
  const more = addBox(addStroke(s, startStroke({ x: 0.5, y: 0.5 }, 0.04)), { x: 0.1, y: 0.1 }, { x: 0.3, y: 0.3 });
  assert.equal(more.marks.length, 5);
  assert.equal(pinCount(more.marks), 3);
});

test("naal: nummereres 1–3 i rekkefoelgen, og en fjernet naal gir plass til en ny", () => {
  let s = addPin(addPin(addPin(STUDIO_START, { x: 0.1, y: 0.1 }), { x: 0.2, y: 0.2 }), { x: 0.3, y: 0.3 });
  const [a, b, c] = s.marks;
  assert.deepEqual([pinNumber(s.marks, a.id), pinNumber(s.marks, b.id), pinNumber(s.marks, c.id)], [1, 2, 3]);
  s = removeMark(s, a.id);
  assert.equal(pinNumber(s.marks, b.id), 1);
  assert.equal(pinNumber(s.marks, a.id), 0);
  assert.equal(canAddPin(s), true);
  s = addPin(s, { x: 0.4, y: 0.4 });
  assert.equal(pinCount(s.marks), 3);
  // Ny id, aldri gjenbrukt.
  assert.equal(new Set(s.marks.map((m) => m.id)).size, 3);
  assert.ok(!s.marks.some((m) => m.id === a.id));
  assert.equal(removeMark(s, 999), s);
});

test("naal: punktet klemmes til 0–1", () => {
  const s = addPin(STUDIO_START, { x: -0.5, y: 1.5 });
  assert.deepEqual(s.marks[0], { kind: "pin", id: 1, at: { x: 0, y: 1 } });
});

test("stroek: bredden klemmes, punktene klemmes, og for korte steg hoppes over", () => {
  assert.equal(clampWidth(0), STROKE_WIDTH_MIN);
  assert.equal(clampWidth(1), STROKE_WIDTH_MAX);
  assert.equal(clampWidth(0.03), 0.03);
  assert.equal(clampWidth(Number.NaN), STROKE_WIDTH_DEFAULT);
  let d = startStroke({ x: 1.2, y: -0.1 }, 2);
  assert.deepEqual(d, { points: [{ x: 1, y: 0 }], width: STROKE_WIDTH_MAX });
  d = startStroke({ x: 0.5, y: 0.5 }, 0.04);
  const same = extendStroke(d, { x: 0.5005, y: 0.5005 });
  assert.equal(same, d);
  d = extendStroke(d, { x: 0.6, y: 0.5 });
  d = extendStroke(d, { x: 2, y: 0.5 });
  assert.deepEqual(d.points, [
    { x: 0.5, y: 0.5 },
    { x: 0.6, y: 0.5 },
    { x: 1, y: 0.5 },
  ]);
  const s = addStroke(STUDIO_START, d);
  assert.equal(s.marks[0].kind, "stroke");
  assert.equal(addStroke(STUDIO_START, { points: [], width: 0.04 }), STUDIO_START);
});

test("boks: hjoernene sorteres, og et klikk uten aa dra gir ingen boks", () => {
  assert.deepEqual(boxFrom({ x: 0.8, y: 0.2 }, { x: 0.3, y: 0.9 }), {
    from: { x: 0.3, y: 0.2 },
    to: { x: 0.8, y: 0.9 },
  });
  assert.deepEqual(boxFrom({ x: -1, y: 2 }, { x: 0.5, y: 0.5 }), { from: { x: 0, y: 0.5 }, to: { x: 0.5, y: 1 } });
  assert.equal(addBox(STUDIO_START, { x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 }), STUDIO_START);
  assert.equal(addBox(STUDIO_START, { x: 0.1, y: 0.5 }, { x: 0.9, y: 0.502 }), STUDIO_START);
  const s = addBox(STUDIO_START, { x: 0.9, y: 0.9 }, { x: 0.1, y: 0.2 });
  assert.deepEqual(s.marks[0], { kind: "box", id: 1, from: { x: 0.1, y: 0.2 }, to: { x: 0.9, y: 0.9 } });
});

// ---------------------------------------------------------------------------
// Angre og gjoer om
// ---------------------------------------------------------------------------

test("angre og gjoer om gaar fram og tilbake gjennom markeringene", () => {
  const s1 = addPin(STUDIO_START, { x: 0.1, y: 0.1 });
  const s2 = addBox(s1, { x: 0.2, y: 0.2 }, { x: 0.4, y: 0.4 });
  const s3 = addStroke(s2, startStroke({ x: 0.5, y: 0.5 }, 0.04));
  assert.equal(canUndo(STUDIO_START), false);
  assert.equal(canRedo(s3), false);
  const u1 = undo(s3);
  assert.deepEqual(u1.marks, s2.marks);
  const u2 = undo(u1);
  assert.deepEqual(u2.marks, s1.marks);
  assert.equal(canRedo(u2), true);
  const r1 = redo(u2);
  assert.deepEqual(r1.marks, s2.marks);
  assert.deepEqual(redo(r1).marks, s3.marks);
  assert.deepEqual(undo(undo(undo(s3))).marks, []);
  // Ingenting aa angre eller gjoere om: samme tilstand.
  assert.equal(undo(STUDIO_START), STUDIO_START);
  assert.equal(redo(s3), s3);
});

test("angre: en ny markering etter angre toemmer «Gjoer om», og id-ene gjenbrukes ikke", () => {
  const s2 = addPin(addPin(STUDIO_START, { x: 0.1, y: 0.1 }), { x: 0.2, y: 0.2 });
  const u = undo(s2);
  const n = addPin(u, { x: 0.3, y: 0.3 });
  assert.equal(canRedo(n), false);
  assert.equal(n.marks.length, 2);
  assert.notEqual(n.marks[1].id, s2.marks[1].id);
});

test("angre: en fjernet naal kommer tilbake, og grensen paa tre gjelder etter gjoer om", () => {
  let s = addPin(addPin(addPin(STUDIO_START, { x: 0.1, y: 0.1 }), { x: 0.2, y: 0.2 }), { x: 0.3, y: 0.3 });
  const removed = removeMark(s, s.marks[0].id);
  assert.equal(pinCount(removed.marks), 2);
  s = undo(removed);
  assert.equal(pinCount(s.marks), 3);
  assert.equal(canAddPin(s), false);
  assert.equal(pinCount(redo(s).marks), 2);
});

test("angre: historikken har et tak", () => {
  let s: StudioState = STUDIO_START;
  for (let i = 0; i < HISTORY_MAX + 10; i++) s = addBox(s, { x: 0, y: 0 }, { x: 0.5, y: 0.5 });
  assert.equal(s.past.length, HISTORY_MAX);
  let n = 0;
  while (canUndo(s)) {
    s = undo(s);
    n++;
  }
  assert.equal(n, HISTORY_MAX);
  assert.equal(s.marks.length, 10);
});

test("tastene: Esc avbryter, Ctrl/Cmd-Z angrer, med Shift (eller Ctrl-Y) gjoer om", () => {
  assert.equal(studioKey("Escape", false, false), "cancel");
  assert.equal(studioKey("z", true, false), "undo");
  assert.equal(studioKey("Z", true, true), "redo");
  assert.equal(studioKey("y", true, false), "redo");
  assert.equal(studioKey("z", false, false), null);
  assert.equal(studioKey("y", true, true), null);
  assert.equal(studioKey("a", true, false), null);
  assert.equal(studioKey("Escape", true, false), null);
});

// ---------------------------------------------------------------------------
// Serialiseringen til backend (V6)
// ---------------------------------------------------------------------------

test("serialisering: {shape, points} i 0–1 med fire desimaler, og bredden for stroek", () => {
  let s = addPin(STUDIO_START, { x: 1 / 3, y: 2 / 3 });
  let d = startStroke({ x: 0.1, y: 0.2 }, 0.0412345);
  d = extendStroke(d, { x: 0.123456, y: 0.2 });
  s = addStroke(s, d);
  s = addBox(s, { x: 0.9, y: 0.75 }, { x: 0.5, y: 0.25 });
  assert.deepEqual(serializeMarks(s.marks), [
    { shape: "point", points: [[0.3333, 0.6667]] },
    {
      shape: "stroke",
      points: [
        [0.1, 0.2],
        [0.1235, 0.2],
      ],
      width: 0.0412,
    },
    {
      shape: "box",
      points: [
        [0.5, 0.25],
        [0.9, 0.75],
      ],
    },
  ]);
  // JSON uten ekstra felt (id og kind sendes ikke).
  assert.equal(JSON.stringify(serializeMark(s.marks[0])), '{"shape":"point","points":[[0.3333,0.6667]]}');
});

test("serialisering: alle tall er innenfor 0–1 og endelige, ogsaa fra en markering laget for haand", () => {
  const shapes = serializeMarks([
    { kind: "pin", id: 1, at: { x: -0.00001, y: 1.00001 } },
    { kind: "stroke", id: 2, points: [{ x: 2, y: -2 }], width: 9 },
    { kind: "box", id: 3, from: { x: -1, y: 0 }, to: { x: 0.5, y: 3 } },
  ]);
  for (const sh of shapes) {
    for (const [x, y] of sh.points) {
      assert.ok(x >= 0 && x <= 1 && y >= 0 && y <= 1, `${sh.shape} ${x},${y}`);
      assert.ok(!Object.is(x, -0) && !Object.is(y, -0));
    }
  }
  assert.deepEqual(shapes[0].points, [[0, 1]]);
  assert.equal(shapes[1].shape === "stroke" && shapes[1].width, STROKE_WIDTH_MAX);
});

test("SVG-rammen: kortsiden er 1, saa bredden er stroke-width rett fram", () => {
  assert.deepEqual(svgFrame(1.5), { width: 1.5, height: 1 });
  assert.deepEqual(svgFrame(0.5), { width: 1, height: 2 });
  assert.deepEqual(svgFrame(0), { width: 1, height: 1 });
  assert.deepEqual(svgFrame(Number.NaN), { width: 1, height: 1 });
  const f = svgFrame(1.5);
  assert.equal(
    strokePath(
      [
        { x: 0, y: 0 },
        { x: 0.5, y: 0.5 },
        { x: 1, y: 1 },
      ],
      f
    ),
    "M0 0L0.75 0.5L1.5 1"
  );
  assert.equal(strokePath([{ x: 0.5, y: 0.5 }], f), "M0.75 0.5L0.75 0.5");
  assert.equal(strokePath([], f), "");
});

// ---------------------------------------------------------------------------
// Komponenten: ikke i bruk, ingen kall, touch-none bare paa lerretet
// ---------------------------------------------------------------------------

const canvas = code("components/studio/StudioCanvas.tsx");

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(join(APP, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...sources(rel));
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(rel);
  }
  return out;
}

test("StudioCanvas: bare godkjenningssiden bruker den, med én boks (FE-3, Dag 58)", () => {
  const users = [...sources("(app)"), ...sources("(marketing)"), ...sources("components")].filter(
    (f) => f !== "components/studio/StudioCanvas.tsx" && /StudioCanvas/.test(code(f))
  );
  assert.deepEqual(users, ["(app)/godkjenning/[jobId]/page.tsx"]);
  const page = code("(app)/godkjenning/[jobId]/page.tsx");
  assert.match(page, /<StudioCanvas[\s\S]*?tool="box"[\s\S]*?onChange=\{\(next\) => setLocalStudio\(keepOneBox\(next\)\)\}/);
});

test("StudioCanvas: ingen kall, regningen fra studio.ts og zoom.ts, og touch-none bare paa lerretet", () => {
  assert.doesNotMatch(canvas, /fetch\(|lib\/api|apiFetch|useAuth/);
  assert.match(canvas, /from "\.\.\/\.\.\/lib\/studio"/);
  assert.match(canvas, /from "\.\.\/\.\.\/lib\/zoom"/);
  assert.match(canvas, /paneToImage\(/);
  assert.match(canvas, /pinchView\(/);
  assert.equal((canvas.match(/touch-none/g) ?? []).length, 1);
  assert.match(canvas, /onPointerDown=\{onPointerDown\}/);
  assert.match(canvas, /onPointerCancel=\{onPointerEnd\}/);
  // Finger nummer to forkaster det som tegnes.
  assert.match(canvas, /pointers\.current\.size === 2\)\s*\{\s*setDraft\(null\)/);
  // Esc og Ctrl/Cmd-Z gaar gjennom studioKey.
  assert.match(canvas, /studioKey\(e\.key, e\.ctrlKey \|\| e\.metaKey, e\.shiftKey\)/);
  // Naalene legges til med addPin, saa grensen paa tre gjelder.
  assert.match(canvas, /addPin\(studio, at\)/);
});

test("ordet for lerretet finnes paa nb og en", () => {
  assert.match(DICTIONARIES.nb.ui["studio.canvas"], /Ctrl eller Cmd og Z angrer, Esc avbryter/);
  assert.match(DICTIONARIES.en.ui["studio.canvas"], /Ctrl or Cmd and Z undoes, Esc cancels/);
});
