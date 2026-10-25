import { test } from "node:test";
import assert from "node:assert/strict";
import {
  centerAt,
  clampScale,
  clampView,
  fitBox,
  imageSplit,
  isDoubleTap,
  mapFrame,
  panBy,
  panKey,
  pinchPoint,
  pinchView,
  sideLayout,
  VIEW_START,
  viewTransform,
  ZOOM_MAX,
  ZOOM_MIN,
  zoomAt,
  zoomKey,
  zoomStep,
} from "./zoom.ts";

// D-5b1 og D-5b2: zoom og utsnitt i lysboksen. Taket er 200 % (Petter 25.10, §5 b).

const near = (a: number, b: number, msg?: string) => assert.ok(Math.abs(a - b) < 1e-9, `${msg ?? ""} ${a} != ${b}`);

test("zoom: grensene er 100 og 200 %", () => {
  assert.equal(ZOOM_MIN, 1);
  assert.equal(ZOOM_MAX, 2);
  assert.equal(clampScale(0.5), 1);
  assert.equal(clampScale(4), 2);
  assert.equal(clampScale(1.5), 1.5);
  assert.equal(clampScale(Number.NaN), 1);
  assert.equal(clampScale(Number.POSITIVE_INFINITY), 1);
  assert.deepEqual(VIEW_START, { scale: 1, cx: 0.5, cy: 0.5 });
});

test("zoom: utsnittet holdes innenfor bildet", () => {
  assert.deepEqual(clampView({ scale: 1, cx: 0.1, cy: 0.9 }), VIEW_START);
  assert.deepEqual(clampView({ scale: 2, cx: 0, cy: 1 }), { scale: 2, cx: 0.25, cy: 0.75 });
  assert.deepEqual(clampView({ scale: 2, cx: 0.4, cy: 0.6 }), { scale: 2, cx: 0.4, cy: 0.6 });
  assert.deepEqual(clampView({ scale: 9, cx: Number.NaN, cy: 0.5 }), { scale: 2, cx: 0.5, cy: 0.5 });
});

test("zoom: «+» og «−» går i trinn på 25 % og stopper ved grensene", () => {
  let v = VIEW_START;
  const seen: number[] = [];
  for (let i = 0; i < 6; i++) {
    v = zoomStep(v, 1);
    seen.push(v.scale);
  }
  assert.deepEqual(seen, [1.25, 1.5, 1.75, 2, 2, 2]);
  assert.equal(zoomStep(VIEW_START, -1).scale, 1);
  // Fra en skala etter to fingre: neste trinn opp eller ned.
  assert.equal(zoomStep({ scale: 1.37, cx: 0.5, cy: 0.5 }, 1).scale, 1.5);
  assert.equal(zoomStep({ scale: 1.37, cx: 0.5, cy: 0.5 }, -1).scale, 1.25);
  assert.equal(zoomStep({ scale: 1.5, cx: 0.5, cy: 0.5 }, -1).scale, 1.25);
});

test("zoom: punktet under pekeren står i ro", () => {
  // Zoom til 2 med punktet oeverst til venstre i ruta: hjoernet staar.
  assert.deepEqual(zoomAt(VIEW_START, 2, 0, 0), { scale: 2, cx: 0.25, cy: 0.25 });
  assert.deepEqual(zoomAt(VIEW_START, 2, 1, 1), { scale: 2, cx: 0.75, cy: 0.75 });
  // Punktet (0.3, 0.6) i ruta peker paa samme sted i bildet foer og etter.
  const before = { scale: 1.5, cx: 0.45, cy: 0.55 };
  const after = zoomAt(before, 1.75, 0.3, 0.6);
  const at = (v: typeof before, f: number, c: number) => c - 1 / (2 * v.scale) + f / v.scale;
  near(at(before, 0.3, before.cx), at(after, 0.3, after.cx), "x");
  near(at(before, 0.6, before.cy), at(after, 0.6, after.cy), "y");
  // Ut til 100 %: hele bildet igjen.
  assert.deepEqual(zoomAt(after, 1), VIEW_START);
});

test("zoom: dra flytter utsnittet motsatt vei, og ikke utenfor bildet", () => {
  const v = { scale: 2, cx: 0.5, cy: 0.5 };
  assert.deepEqual(panBy(v, 0.2, 0), { scale: 2, cx: 0.4, cy: 0.5 });
  assert.deepEqual(panBy(v, 0, -0.2), { scale: 2, cx: 0.5, cy: 0.6 });
  assert.deepEqual(panBy(v, 5, -5), { scale: 2, cx: 0.25, cy: 0.75 });
  // Uten zoom staar bildet.
  assert.deepEqual(panBy(VIEW_START, 0.3, 0.3), VIEW_START);
});

test("zoom: kartet sentrerer utsnittet og viser rammen", () => {
  const v = { scale: 2, cx: 0.5, cy: 0.5 };
  assert.deepEqual(centerAt(v, 0.7, 0.3), { scale: 2, cx: 0.7, cy: 0.3 });
  assert.deepEqual(centerAt(v, 1, 0), { scale: 2, cx: 0.75, cy: 0.25 });
  assert.deepEqual(mapFrame(VIEW_START), { left: 0, top: 0, width: 100, height: 100 });
  assert.deepEqual(mapFrame({ scale: 2, cx: 0.75, cy: 0.25 }), { left: 50, top: 0, width: 50, height: 50 });
  assert.deepEqual(mapFrame({ scale: 1.25, cx: 0.5, cy: 0.5 }), { left: 10, top: 10, width: 80, height: 80 });
});

test("zoom: transformen flytter og skalerer fra hjørnet oppe til venstre", () => {
  assert.equal(viewTransform(VIEW_START), "translate(0%, 0%) scale(1)");
  assert.equal(viewTransform({ scale: 2, cx: 0.25, cy: 0.25 }), "translate(0%, 0%) scale(2)");
  assert.equal(viewTransform({ scale: 2, cx: 0.75, cy: 0.5 }), "translate(-100%, -50%) scale(2)");
  assert.equal(viewTransform({ scale: 1.5, cx: 0.5, cy: 0.5 }), "translate(-25%, -25%) scale(1.5)");
});

test("zoom: skillet på skjermen klipper originalen på samme sted i bildet", () => {
  assert.equal(imageSplit(VIEW_START, 50), 50);
  assert.equal(imageSplit(VIEW_START, 0), 0);
  assert.equal(imageSplit(VIEW_START, 100), 100);
  // 200 %, utsnittet til venstre (0–50 % av bildet): midten av ruta er 25 % av bildet.
  assert.equal(imageSplit({ scale: 2, cx: 0.25, cy: 0.5 }, 50), 25);
  assert.equal(imageSplit({ scale: 2, cx: 0.75, cy: 0.5 }, 50), 75);
  assert.equal(imageSplit({ scale: 2, cx: 0.75, cy: 0.5 }, 100), 100);
});

test("zoom: tastene + og − (også = og -), og 0 tilbakestiller", () => {
  const v = { scale: 1.5, cx: 0.4, cy: 0.6 };
  assert.equal(zoomKey(v, "+")?.scale, 1.75);
  assert.equal(zoomKey(v, "=")?.scale, 1.75);
  assert.equal(zoomKey(v, "-")?.scale, 1.25);
  assert.equal(zoomKey(v, "−")?.scale, 1.25);
  assert.deepEqual(zoomKey(v, "0"), VIEW_START);
  for (const key of ["ArrowLeft", "Escape", " ", "1", "a"]) assert.equal(zoomKey(v, key), null, key);
});

test("zoom: piltastene flytter utsnittet en tidel av ruta", () => {
  const v = { scale: 2, cx: 0.5, cy: 0.5 };
  assert.deepEqual(panKey(v, "ArrowRight"), { scale: 2, cx: 0.55, cy: 0.5 });
  assert.deepEqual(panKey(v, "ArrowLeft"), { scale: 2, cx: 0.45, cy: 0.5 });
  assert.deepEqual(panKey(v, "ArrowDown"), { scale: 2, cx: 0.5, cy: 0.55 });
  assert.deepEqual(panKey(v, "ArrowUp"), { scale: 2, cx: 0.5, cy: 0.45 });
  assert.equal(panKey(v, "+"), null);
});

test("zoom: to fingre zoomer rundt midtpunktet og flytter med det", () => {
  const rect = { left: 100, top: 50, width: 400, height: 200 };
  assert.deepEqual(pinchPoint({ x: 200, y: 100 }, { x: 400, y: 200 }, rect), { d: Math.hypot(200, 100), x: 0.5, y: 0.5 });
  const from = { d: 100, x: 0.5, y: 0.5 };
  // Dobbel avstand: 200 %, midten staar.
  assert.deepEqual(pinchView(VIEW_START, from, { d: 200, x: 0.5, y: 0.5 }), { scale: 2, cx: 0.5, cy: 0.5 });
  // Mer enn taket: 200 %.
  assert.equal(pinchView(VIEW_START, from, { d: 900, x: 0.5, y: 0.5 }).scale, 2);
  // Klype sammen: ikke under 100 %.
  assert.deepEqual(pinchView({ scale: 2, cx: 0.3, cy: 0.3 }, from, { d: 10, x: 0.5, y: 0.5 }), VIEW_START);
  // Flytt midtpunktet uten aa endre avstanden: bildet foelger.
  assert.deepEqual(pinchView({ scale: 2, cx: 0.5, cy: 0.5 }, from, { d: 100, x: 0.6, y: 0.5 }), { scale: 2, cx: 0.45, cy: 0.5 });
  // Avstand 0 ved start gir ingen deling paa null.
  assert.deepEqual(pinchView(VIEW_START, { d: 0, x: 0.5, y: 0.5 }, { d: 50, x: 0.5, y: 0.5 }), VIEW_START);
});

test("zoom: dobbelttrykk innen 300 ms og 30 px", () => {
  const first = { t: 1000, x: 100, y: 100 };
  assert.equal(isDoubleTap(null, first), false);
  assert.equal(isDoubleTap(first, { t: 1250, x: 110, y: 95 }), true);
  assert.equal(isDoubleTap(first, { t: 1301, x: 100, y: 100 }), false);
  assert.equal(isDoubleTap(first, { t: 1100, x: 140, y: 100 }), false);
  assert.equal(isDoubleTap(first, { t: 900, x: 100, y: 100 }), false);
});

test("zoom: bildet fyller ruta med riktig sideforhold", () => {
  assert.deepEqual(fitBox(1200, 600, 1.5), { width: 900, height: 600 });
  assert.deepEqual(fitBox(390, 700, 1.5), { width: 390, height: 260 });
  assert.deepEqual(fitBox(0, 600, 1.5), { width: 0, height: 0 });
  assert.deepEqual(fitBox(600, 600, 0), { width: 0, height: 0 });
  // Side ved side: bred skjerm ved siden av hverandre, smal over hverandre.
  assert.deepEqual(sideLayout(1416, 700, 1.5, 16), { row: true, box: { width: 700, height: 466 } });
  assert.deepEqual(sideLayout(390, 700, 1.5, 16), { row: false, box: { width: 390, height: 260 } });
});
