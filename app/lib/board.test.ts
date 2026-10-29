import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addToImages,
  BOARD_SERVICES,
  clearDraft,
  coverage,
  draftKey,
  itemsForImage,
  loadDraft,
  MAX_ITEMS_PER_CALL,
  orderChunks,
  pruneItems,
  removeFromImages,
  saveDraft,
  toWire,
  type BoardItem,
  type DraftStorage,
} from "./board.ts";

/**
 * Bildebrettet (FE-0, audit punkt 4): elementer per bilde, dekning i panelet,
 * deling i kall paa hoeyst 80 (Petter 29.10) og utkastet i localStorage
 * (Petter 29.10) med et falskt lager.
 */

test("tjenestekodene er de fra K 2.7, og taket er 80", () => {
  assert.deepEqual([...BOARD_SERVICES], ["skumring", "styling", "aarstid", "klart_vaer", "skjul_ansikter"]);
  assert.equal(MAX_ITEMS_PER_CALL, 80);
});

test("addToImages legger tjenesten paa de valgte bildene uten dubletter", () => {
  let items = addToImages([], ["a", "b"], { service: "skumring" });
  assert.equal(items.length, 2);
  items = addToImages(items, ["b", "c"], { service: "skumring" });
  assert.deepEqual(
    items.map((i) => i.imageId),
    ["a", "b", "c"]
  );
  // To stiler paa samme bilde er to elementer (beslutning 1).
  items = addToImages(items, ["a"], { service: "styling", option: "styling_japandi" });
  items = addToImages(items, ["a"], { service: "styling", option: "styling_moderne" });
  items = addToImages(items, ["a"], { service: "styling", option: "styling_japandi" });
  assert.equal(itemsForImage(items, "a").length, 3);
});

test("aarstid: kildeaarstiden oppdateres paa bilder som har valget fra foer", () => {
  let items = addToImages([], ["a"], { service: "aarstid", option: "vinter", sourceSeason: "sommer" });
  items = addToImages(items, ["a", "b"], { service: "aarstid", option: "vinter", sourceSeason: "hoest" });
  assert.equal(items.length, 2);
  assert.ok(items.every((i) => i.sourceSeason === "hoest"));
});

test("removeFromImages: hele tjenesten, eller bare ett valg", () => {
  let items = addToImages([], ["a", "b"], { service: "styling", option: "styling_japandi" });
  items = addToImages(items, ["a"], { service: "styling", option: "styling_moderne" });
  items = addToImages(items, ["a"], { service: "skumring" });
  assert.equal(removeFromImages(items, ["a"], "styling", "styling_moderne").length, 3);
  const noStyling = removeFromImages(items, ["a"], "styling");
  assert.deepEqual(
    noStyling.map((i) => `${i.imageId}:${i.service}`),
    ["b:styling", "a:skumring"]
  );
});

test("coverage: ingen, noen eller alle av de valgte bildene", () => {
  const items = addToImages([], ["a", "b"], { service: "klart_vaer" });
  assert.equal(coverage(items, ["a", "b"], "klart_vaer"), "all");
  assert.equal(coverage(items, ["a", "c"], "klart_vaer"), "some");
  assert.equal(coverage(items, ["c"], "klart_vaer"), "none");
  assert.equal(coverage(items, [], "klart_vaer"), "none");
  const styled = addToImages([], ["a"], { service: "styling", option: "styling_japandi" });
  assert.equal(coverage(styled, ["a"], "styling"), "all");
  assert.equal(coverage(styled, ["a"], "styling", "styling_moderne"), "none");
});

test("toWire: tomme valg sendes ikke; source_season bare for aarstid", () => {
  const base = { imageId: "a", option: null, sourceSeason: null };
  assert.deepEqual(toWire({ ...base, service: "skumring" }), { image_id: "a", service: "skumring" });
  assert.deepEqual(toWire({ ...base, service: "styling", option: "styling_japandi", sourceSeason: "sommer" }), {
    image_id: "a",
    service: "styling",
    option: "styling_japandi",
  });
  assert.deepEqual(toWire({ ...base, service: "aarstid", option: "vinter", sourceSeason: "sommer" }), {
    image_id: "a",
    service: "aarstid",
    option: "vinter",
    source_season: "sommer",
  });
});

test("orderChunks: 25 bilder x 4 tjenester = 100 elementer gir 80 + 20, i samme rekkefoelge", () => {
  const ids = Array.from({ length: 25 }, (_, i) => `img_${i + 1}`);
  let items: BoardItem[] = [];
  for (const service of ["skumring", "klart_vaer", "skjul_ansikter"] as const) items = addToImages(items, ids, { service });
  items = addToImages(items, ids, { service: "styling", option: "styling_japandi" });
  const chunks = orderChunks(items);
  assert.deepEqual(
    chunks.map((c) => c.length),
    [80, 20]
  );
  assert.deepEqual(chunks.flat(), items.map(toWire));
  assert.deepEqual(orderChunks([]), []);
  assert.deepEqual(
    orderChunks(items.slice(0, 5), 2).map((c) => c.length),
    [2, 2, 1]
  );
  assert.throws(() => orderChunks(items, 0), RangeError);
});

test("orderChunks tar ut dubletter som har sneket seg inn (f.eks. fra et gammelt utkast)", () => {
  const item: BoardItem = { imageId: "a", service: "skumring", option: null, sourceSeason: null };
  assert.equal(orderChunks([item, { ...item }]).flat().length, 1);
});

test("pruneItems fjerner elementer for bilder som ikke finnes lenger", () => {
  const items = addToImages([], ["a", "b", "c"], { service: "skumring" });
  assert.deepEqual(
    pruneItems(items, ["a", "c"]).map((i) => i.imageId),
    ["a", "c"]
  );
});

// --- utkastet ----------------------------------------------------------------

function memoryStorage(): DraftStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

function throwingStorage(): DraftStorage {
  const fail = () => {
    throw new Error("SecurityError");
  };
  return { getItem: fail, setItem: fail, removeItem: fail };
}

test("utkastet lagres per ordre og leses tilbake med bare bildene som finnes", () => {
  const storage = memoryStorage();
  const items = addToImages([], ["a", "b"], { service: "skumring" });
  assert.equal(
    saveDraft(storage, "asg_1", items, () => new Date("2026-10-29T10:00:00Z")),
    true
  );
  assert.ok(storage.data.has("ordre.brett.asg_1.v1"));
  assert.equal(draftKey("asg_2"), "ordre.brett.asg_2.v1");
  const draft = loadDraft(storage, "asg_1", ["a"]);
  assert.deepEqual(
    draft?.items.map((i) => i.imageId),
    ["a"]
  );
  assert.equal(draft?.savedAt, "2026-10-29T10:00:00.000Z");
  assert.equal(loadDraft(storage, "asg_2", ["a"]), null);
  clearDraft(storage, "asg_1");
  assert.equal(loadDraft(storage, "asg_1", ["a"]), null);
});

test("ugyldig utkast gir null eller hopper over elementer, aldri krasj", () => {
  const storage = memoryStorage();
  for (const text of ["{", "null", "42", '{"items":"x"}']) {
    storage.data.set(draftKey("x"), text);
    assert.equal(loadDraft(storage, "x", ["a"]), null, text);
  }
  storage.data.set(
    draftKey("x"),
    JSON.stringify({ items: [{ imageId: "a", service: "ukjent" }, { imageId: "a", service: "skumring" }, null, "x"] })
  );
  assert.deepEqual(loadDraft(storage, "x", ["a"])?.items, [
    { imageId: "a", service: "skumring", option: null, sourceSeason: null },
  ]);
});

test("siden virker uten lagring: null og en lagring som kaster gir ingen feil", () => {
  const items = addToImages([], ["a"], { service: "skumring" });
  for (const storage of [null, throwingStorage()]) {
    assert.equal(saveDraft(storage, "a", items), false);
    assert.equal(loadDraft(storage, "a", ["a"]), null);
    assert.doesNotThrow(() => clearDraft(storage, "a"));
  }
});
