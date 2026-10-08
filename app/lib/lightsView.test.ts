import { test } from "node:test";
import assert from "node:assert/strict";
import {
  badgePlacement,
  canShowMarkers,
  flatLights,
  lightMarkers,
  lightNames,
  lightText,
  lightZone,
  litLights,
  markerLetter,
  markerPosition,
  third,
} from "./lightsView.ts";
import { buildCorrection, initialToggles, isOn, setToggle, type Lights } from "./correction.ts";
import type { LightBox, LightState, ReviewLight } from "./api.ts";

/** Lysene slik megleren ser dem (D2b, avvik 3 A). Body bygges uendret av buildCorrection. */

function light(key: string, id: string, run: number | null, state: LightState): ReviewLight {
  return { key, id, run, type: "spotlight", location: null, box: null, reasonCode: "not_confirmed", editable: true, state };
}

function lights(): Lights {
  return {
    approved: [light("L1", "L1", null, "approved"), light("L2", "L2", null, "disabled")],
    unstable: [light("r2:L3", "L3", 2, "candidate")],
    rejected: [light("r1:L4", "L4", 1, "promoted"), light("r1:L5", "L5", 1, "candidate")],
  };
}

test("flat liste: godkjente foerst, saa ustabile og avviste, i rekkefoelgen fra backend", () => {
  assert.deepEqual(
    flatLights(lights()).map((f) => f.light.key),
    ["L1", "L2", "r2:L3", "r1:L4", "r1:L5"]
  );
});

test("«Usikker» bare paa ustabile og avviste", () => {
  assert.deepEqual(
    flatLights(lights()).map((f) => f.uncertain),
    [false, false, true, true, true]
  );
});

test("usikre lys starter som av; et lys slaatt paa i forrige runde staar paa", () => {
  const l = lights();
  const t = initialToggles(l);
  assert.deepEqual(
    flatLights(l).map((f) => isOn(f.light, t)),
    [true, false, false, true, false]
  );
});

test("body fra den flate lista er den samme som fra de tre listene", () => {
  const l = lights();
  // Slik siden gjorde foer D2b: kandidat-flagget fra lista lyset sto i.
  let before = initialToggles(l);
  before = setToggle(before, l.unstable[0], true, true);
  before = setToggle(before, l.approved[0], false, false);
  // Slik CorrectionPanel gjoer naa: uncertain fra den flate lista.
  let after = initialToggles(l);
  for (const { light: x, uncertain } of flatLights(l)) {
    if (x.key === "r2:L3") after = setToggle(after, x, uncertain, true);
    if (x.key === "L1") after = setToggle(after, x, uncertain, false);
  }
  assert.deepEqual(after, before);
  const body = buildCorrection({ lights: l, version: 3 }, after, false, null);
  assert.deepEqual(body, {
    action: "correct",
    overrides: { promote: [{ run: 2, id: "L3" }, { run: 1, id: "L4" }], disable: ["L1", "L2"], add: [] },
    expected_version: 3,
  });
});

test("sidepanelet viser lysene som er tent i gjeldende bilde", () => {
  assert.deepEqual(
    litLights(lights()).map((x) => x.key),
    ["L1", "r1:L4"]
  );
  assert.deepEqual(litLights({ approved: [], unstable: [], rejected: [] }), []);
});

// ---------------------------------------------------------------------------
// TG-NEW-148: nummer og sone (3 x 3) fra boksen, Petter 05.10.
// ---------------------------------------------------------------------------

function lamp(key: string, type: string | null, box: LightBox | null, state: LightState = "approved"): ReviewLight {
  return { key, id: key, run: null, type, location: "on the facade", box, reasonCode: null, editable: true, state };
}

/** Teksten slik LightLabel viser den. */
function label(locale: "nb" | "en", l: Lights, light: ReviewLight): string {
  const text = lightText(locale, light, lightNames(l)(light));
  return text.zone === null ? text.title : `${text.title} · ${text.zone}`;
}

/** Laavejobben 3e8fb887 (godkjent 04.10): fem exterior_wall_lamp, i rekkefoelgen fra backend. */
const BARN: LightBox[] = [
  [418, 7, 449, 23],
  [438, 214, 465, 227],
  [451, 331, 473, 340],
  [410, 759, 429, 769],
  [397, 869, 417, 881],
];

test("laavejobben: fem utvendige vegglamper faar nummer og sone paa nb og en", () => {
  const approved = BARN.map((box, i) => lamp(`L${i + 1}`, "exterior_wall_lamp", box));
  const l: Lights = { approved, unstable: [], rejected: [] };
  assert.deepEqual(
    approved.map((x) => label("nb", l, x)),
    [
      "Utvendig vegglampe 1 · til venstre",
      "Utvendig vegglampe 2 · til venstre",
      "Utvendig vegglampe 3 · i midten",
      "Utvendig vegglampe 4 · til høyre",
      "Utvendig vegglampe 5 · til høyre",
    ]
  );
  assert.deepEqual(
    approved.map((x) => label("en", l, x)),
    [
      "Exterior wall lamp 1 · left",
      "Exterior wall lamp 2 · left",
      "Exterior wall lamp 3 · center",
      "Exterior wall lamp 4 · right",
      "Exterior wall lamp 5 · right",
    ]
  );
  // Samme nummer naar backend sender dem i en annen rekkefoelge.
  const reversed: Lights = { approved: [...approved].reverse(), unstable: [], rejected: [] };
  assert.deepEqual(
    approved.map((x) => lightNames(reversed)(x).number),
    [1, 2, 3, 4, 5]
  );
});

test("tredjedelene: grensene hoerer til tredjedelen etter", () => {
  assert.equal(third(0), 0);
  assert.equal(third(333), 0);
  assert.equal(third(333.3), 0);
  assert.equal(third(1000 / 3), 1, "noeyaktig 333,33 er midten");
  assert.equal(third(333.5), 1);
  assert.equal(third(335.5), 1, "lampe 3 i laavejobben");
  assert.equal(third(666.5), 1);
  assert.equal(third(2000 / 3), 2, "noeyaktig 666,67 er hoeyre/nede");
  assert.equal(third(667), 2);
  assert.equal(third(1000), 2);
});

test("sonen fra midtpunktet i boksen, 3 x 3; uten boks ingen sone", () => {
  // [ymin, xmin, ymax, xmax]: midtpunktet er (y, x) = (100|500|900, 100|500|900).
  const at = (y: number, x: number): LightBox => [y - 10, x - 10, y + 10, x + 10];
  assert.deepEqual(
    [100, 500, 900].map((y) => [100, 500, 900].map((x) => lightZone(at(y, x)))),
    [
      ["top_left", "top_center", "top_right"],
      ["left", "center", "right"],
      ["bottom_left", "bottom_center", "bottom_right"],
    ]
  );
  // En stor boks: midtpunktet teller, ikke hvor mye som ligger i hver sone.
  assert.equal(lightZone([0, 0, 1000, 700]), "center");
  assert.equal(lightZone(null), null);
});

test("ordlista har ni soner paa nb og en, med Petters ord", () => {
  const nb = ["oppe til venstre", "oppe i midten", "oppe til høyre", "til venstre", "i midten", "til høyre",
    "nede til venstre", "nede i midten", "nede til høyre"];
  const en = ["top left", "top center", "top right", "left", "center", "right",
    "bottom left", "bottom center", "bottom right"];
  const at = (y: number, x: number): LightBox => [y, x, y, x];
  const boxes = [100, 500, 900].flatMap((y) => [100, 500, 900].map((x) => at(y, x)));
  const lone = (box: LightBox) => lamp("L1", "pendant", box);
  assert.deepEqual(boxes.map((b) => lightText("nb", lone(b), { number: null, zone: lightZone(b) }).zone), nb);
  assert.deepEqual(boxes.map((b) => lightText("en", lone(b), { number: null, zone: lightZone(b) }).zone), en);
});

test("én lampe av typen faar ikke nummer, men faar sone", () => {
  const p = lamp("L1", "pendant", [100, 100, 200, 200]);
  const l: Lights = { approved: [p, lamp("L2", "spotlight", [0, 0, 10, 10]), lamp("L3", "spotlight", [0, 900, 10, 910])], unstable: [], rejected: [] };
  assert.equal(label("nb", l, p), "Pendel · oppe til venstre");
  assert.equal(label("nb", l, l.approved[1]), "Spotlight 1 · oppe til venstre");
  assert.equal(label("nb", l, l.approved[2]), "Spotlight 2 · oppe til høyre");
});

test("nummeret telles over godkjente, ustabile og avviste, og er det samme i alle visninger", () => {
  const l: Lights = {
    approved: [lamp("L1", "pendant", [100, 800, 200, 900])],
    unstable: [lamp("r2:L2", "pendant", [100, 100, 200, 200], "candidate")],
    rejected: [lamp("r1:L3", "pendant", [100, 450, 200, 550], "promoted")],
  };
  const nameOf = lightNames(l);
  // Venstre mot hoeyre uansett hvilken liste lampen staar i.
  assert.deepEqual(flatLights(l).map((f) => nameOf(f.light).number), [3, 1, 2]);
  // «Lys som tennes» (litLights) viser de samme objektene, altsaa samme nummer som rettingen.
  assert.deepEqual(litLights(l).map((x) => label("nb", l, x)), ["Pendel 3 · oppe til høyre", "Pendel 2 · oppe i midten"]);
});

test("likt midtpunkt vannrett: topp mot bunn; helt likt: rekkefoelgen fra backend", () => {
  const low = lamp("L1", "spotlight", [800, 100, 820, 120]);
  const high = lamp("L2", "spotlight", [100, 100, 120, 120]);
  const twinA = lamp("L3", "spotlight", [500, 500, 520, 520]);
  const twinB = lamp("L4", "spotlight", [500, 500, 520, 520]);
  const nameOf = lightNames({ approved: [low, high, twinA, twinB], unstable: [], rejected: [] });
  assert.deepEqual([high, low, twinA, twinB].map((x) => nameOf(x).number), [1, 2, 3, 4]);
});

test("lamper uten boks kommer til slutt i rekkefoelgen fra backend, uten sone", () => {
  const a = lamp("L1", "exterior_wall_lamp", null);
  const b = lamp("L2", "exterior_wall_lamp", [400, 900, 420, 920]);
  const c = lamp("L3", "exterior_wall_lamp", null);
  const d = lamp("L4", "exterior_wall_lamp", [400, 10, 420, 30]);
  const l: Lights = { approved: [a, b, c, d], unstable: [], rejected: [] };
  assert.deepEqual(
    [a, b, c, d].map((x) => label("nb", l, x)),
    ["Utvendig vegglampe 3", "Utvendig vegglampe 2 · til høyre", "Utvendig vegglampe 4", "Utvendig vegglampe 1 · til venstre"]
  );
});

test("numrene endres ikke naar lys slaas av og paa mellom rundene", () => {
  const before = lights();
  const after: Lights = {
    approved: before.approved.map((x) => ({ ...x, state: "disabled" as const })),
    unstable: before.unstable.map((x) => ({ ...x, state: "promoted" as const })),
    rejected: before.rejected,
  };
  const n1 = lightNames(before);
  const n2 = lightNames(after);
  assert.deepEqual(flatLights(after).map((f) => n2(f.light)), flatLights(before).map((f) => n1(f.light)));
  // Uten boks: nummer i rekkefoelgen fra backend.
  assert.deepEqual(flatLights(before).map((f) => n1(f.light).number), [1, 2, 3, 4, 5]);
});

test("ukjent type og lys utenfor listene gir aldri krasj", () => {
  const x = lamp("L1", null, [500, 500, 510, 510]);
  const y = lamp("L2", null, null);
  const l: Lights = { approved: [x, y], unstable: [], rejected: [] };
  assert.equal(label("nb", l, x), "Lyskilde 1 · i midten");
  assert.equal(label("nb", l, y), "Lyskilde 2");
  const stranger = lamp("L9", "pendant", [900, 900, 910, 910]);
  assert.deepEqual(lightNames(l)(stranger), { number: null, zone: "bottom_right" });
});

// ---------------------------------------------------------------------------
// TG-NEW-166: markoerene i originalen.
// ---------------------------------------------------------------------------

function boxed(key: string, type: string, box: LightBox | null): ReviewLight {
  return { key, id: key, run: null, type, location: null, box, reasonCode: null, editable: true, state: "approved" };
}

test("markoeren staar midt i boksen, i prosent; 0 og 1000 er kantene", () => {
  assert.deepEqual(markerPosition([100, 200, 300, 600]), { x: 40, y: 20, width: 40, height: 20 });
  assert.deepEqual(markerPosition([0, 0, 1000, 1000]), { x: 50, y: 50, width: 100, height: 100 });
  assert.deepEqual(markerPosition([1000, 1000, 1000, 1000]), { x: 100, y: 100, width: 0, height: 0 });
});

test("en snudd boks (ymin > ymax, xmin > xmax) normaliseres med min og max", () => {
  assert.deepEqual(markerPosition([300, 600, 100, 200]), markerPosition([100, 200, 300, 600]));
  assert.deepEqual(markerPosition([300, 200, 100, 600]), markerPosition([100, 200, 300, 600]));
});

test("markoerene har samme nummer og sone som lista, merke A, B, C i rekkefoelgen, og lys uten boks telles", () => {
  const l: Lights = {
    approved: [boxed("L1", "exterior_wall_lamp", [400, 800, 450, 820]), boxed("L2", "exterior_wall_lamp", [400, 100, 450, 120])],
    unstable: [boxed("r2:L3", "exterior_wall_lamp", [400, 500, 450, 520])],
    rejected: [boxed("r1:L4", "pendant", null), boxed("r1:L5", "spotlight", [10, 10, 20, 20])],
  };
  const nameOf = lightNames(l);
  const { markers, withoutBox } = lightMarkers(l);
  assert.equal(withoutBox, 1);
  assert.deepEqual(
    markers.map((m) => [m.light.key, m.letter, m.uncertain, m.name.number]),
    [
      ["L1", "A", false, 3],
      ["L2", "B", false, 1],
      ["r2:L3", "C", true, 2],
      // Lyset uten boks (r1:L4) faar intet merke; avviste er usikre, som ustabile (valg 2 A).
      ["r1:L5", "D", true, null],
    ]
  );
  for (const m of markers) assert.deepEqual(m.name, nameOf(m.light), m.light.key ?? "");
  assert.equal(lightText("nb", markers[0].light, markers[0].name).title, "Utvendig vegglampe 3");
});

test("knappen vises bare med original, uten sletting og med minst én boks", () => {
  const withBox: Lights = { approved: [boxed("L1", "pendant", [1, 2, 3, 4])], unstable: [], rejected: [] };
  const noBox: Lights = { approved: [boxed("L1", "pendant", null)], unstable: [], rejected: [] };
  const review = (originalUrl: string | null, lights: Lights, mediaDeletedAt: string | null = null) =>
    ({ images: { originalUrl }, lights, mediaDeletedAt }) as Parameters<typeof canShowMarkers>[0];
  assert.equal(canShowMarkers(review("https://x/o.jpg", withBox)), true);
  assert.equal(canShowMarkers(review(null, withBox)), false);
  assert.equal(canShowMarkers(review("https://x/o.jpg", withBox, "2026-10-01T00:00:00Z")), false);
  assert.equal(canShowMarkers(review("https://x/o.jpg", noBox)), false);
  assert.equal(canShowMarkers(review("https://x/o.jpg", { approved: [], unstable: [], rejected: [] })), false);
});

test("TG-166-oppfoelging: merket er A-Z, saa AA, AB ... (valg 1 A)", () => {
  assert.deepEqual([0, 1, 25, 26, 27, 51, 52, 701, 702].map(markerLetter), ["A", "B", "Z", "AA", "AB", "AZ", "BA", "ZZ", "AAA"]);
});

test("TG-166-oppfoelging: en lampe alene om typen har ikke nummer, men faar likevel et merke", () => {
  const l: Lights = { approved: [boxed("L1", "pendant", [100, 100, 200, 200])], unstable: [], rejected: [] };
  const [m] = lightMarkers(l).markers;
  assert.equal(m.name.number, null);
  assert.equal(m.letter, "A");
});

test("TG-166-oppfoelging: merket staar over rammen, under naar det ikke er plass, og inni bare naar boksen fyller hoeyden", () => {
  // Liten lampe midt i: over. Toppen akkurat paa grensen (10 %) er over.
  assert.equal(badgePlacement({ x: 50, y: 50, height: 4 }).vertical, "above");
  assert.equal(badgePlacement({ x: 50, y: 12, height: 4 }).vertical, "above");
  // Rammen helt oeverst: under.
  assert.equal(badgePlacement({ x: 50, y: 5, height: 4 }).vertical, "below");
  assert.equal(badgePlacement({ x: 50, y: 11.9, height: 4 }).vertical, "below");
  // Hoey boks uten plass over eller under: inni.
  assert.equal(badgePlacement({ x: 50, y: 50, height: 95 }).vertical, "inside");
  // Ved kantene inntil kanten, ellers midt paa.
  assert.equal(badgePlacement({ x: 3, y: 50, height: 4 }).horizontal, "start");
  assert.equal(badgePlacement({ x: 50, y: 50, height: 4 }).horizontal, "center");
  assert.equal(badgePlacement({ x: 97, y: 50, height: 4 }).horizontal, "end");
  // Fra en boks: samme plassering som markerPosition gir.
  assert.deepEqual(badgePlacement(markerPosition([0, 980, 40, 1000])), { vertical: "below", horizontal: "end" });
});
