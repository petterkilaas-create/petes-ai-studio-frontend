import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { codeText, DICTIONARIES, t } from "./i18n/index.ts";
import {
  DOCUMENT_KINDS,
  getListingText,
  orderListingText,
  orderWireBody,
  parseListingText,
  type ListingText,
} from "./listingText.ts";
import { createListingTextMock } from "./listingTextMock.ts";
import { orderBlock } from "./listingTextOrder.ts";
import { channelName, factSource } from "./listingTextPackage.ts";
import {
  clearOrderDraft,
  emptyPropertyDraft,
  ENERGY_COLORS,
  formatNorwegianNumber,
  initialOrderDraft,
  KEY_FACT_COUNT,
  KEY_FIELDS,
  keyFactsFilled,
  loadOrderDraft,
  locationFromOrder,
  OWNERSHIPS,
  parseNorwegianNumber,
  parsePropertyWire,
  PLOT_OWNERSHIPS,
  PROPERTY_GROUPS,
  PROPERTY_KEYS,
  PROPERTY_TYPES,
  propertyDraftFrom,
  propertyErrors,
  propertyFieldError,
  propertyForOrder,
  propertyHasMaterial,
  propertyWire,
  saveOrderDraft,
  tidyPropertyField,
  type PropertyDraft,
  type TextDraftStorage,
} from "./listingTextProperty.ts";
import { getGuidePage } from "../../content/marketing/index.ts";
import { literalTextsInFile, withoutComments } from "./testing/jsxText.ts";

/**
 * Boligfakta i bestillingen av tekstpakken (TG-NEW-281, K §10): feltene og
 * grensene, norsk tallformat, adressen fra ordren, telleren, kroppen,
 * utkastet i nettleseren, kildene, mock, ordlista, veiledningen og
 * «Boligportal» i stedet for FINN (Petter 31.10). Sidene leses som tekst.
 */

const APP_DIR = fileURLToPath(new URL("..", import.meta.url));
const read = (rel: string) => readFileSync(join(APP_DIR, rel), "utf8");
const NOW = new Date("2026-10-31T12:00:00Z");
const ADDRESS = "Skogtunet 3, 1410 Kolbotn";

const draftWith = (fields: Partial<PropertyDraft>, address = ADDRESS): PropertyDraft => ({ ...emptyPropertyDraft(address), ...fields });

const pkg = (raw: Record<string, unknown>): ListingText => {
  const parsed = parseListingText({ assignment_id: "asg_1", display_status: "not_ordered", ...raw });
  assert.ok(parsed);
  return parsed;
};

// --- tallene -----------------------------------------------------------------

test("tallene: norsk format inn (mellomrom, hardt mellomrom, desimalkomma, minus) og ut", () => {
  assert.equal(parseNorwegianNumber("12 500 000"), 12_500_000);
  assert.equal(parseNorwegianNumber("12 500 000"), 12_500_000);
  assert.equal(parseNorwegianNumber("12500000"), 12_500_000);
  assert.equal(parseNorwegianNumber("12.500.000"), 12_500_000);
  assert.equal(parseNorwegianNumber("75,5"), 75.5);
  assert.equal(parseNorwegianNumber("75.5"), 75.5);
  assert.equal(parseNorwegianNumber("-1"), -1);
  assert.equal(parseNorwegianNumber("−2"), -2);
  for (const bad of ["", "  ", "12 kr", "1,2,3", "1.5,0", "abc", "1e5", ","]) assert.equal(parseNorwegianNumber(bad), null, bad);
  assert.equal(formatNorwegianNumber(12_500_000), "12 500 000");
  assert.equal(formatNorwegianNumber(33_158), "33 158");
  assert.equal(formatNorwegianNumber(75.5), "75,5");
  assert.equal(formatNorwegianNumber(1999, false), "1999");
  assert.equal(formatNorwegianNumber(-3, false), "-3");
  assert.equal(formatNorwegianNumber(999), "999");
});

test("tallene: norsk format naar feltet forlates; byggeaar og etasje uten tusenskille, tekst og feil uendret", () => {
  assert.equal(tidyPropertyField("asking_price", "12500000"), "12 500 000");
  assert.equal(tidyPropertyField("bra_i", "75.5"), "75,5");
  assert.equal(tidyPropertyField("build_year", "1 999"), "1999");
  assert.equal(tidyPropertyField("plot_area", "33158"), "33 158");
  assert.equal(tidyPropertyField("asking_price", "12 mill"), "12 mill");
  assert.equal(tidyPropertyField("address", " Skogtunet 3 "), " Skogtunet 3 ");
});

// --- valideringen (K §10.1) --------------------------------------------------

test("valideringen: grensene per felt fra kontrakten §10.1", () => {
  const err = (key: Parameters<typeof propertyFieldError>[0], raw: string) => propertyFieldError(key, raw, NOW)?.code ?? null;
  // Kroner: heltall 0-1 000 000 000 (omkostninger 0-100 000 000, maanedlig og aarlig 0-1 000 000).
  assert.equal(err("asking_price", "0"), null);
  assert.equal(err("asking_price", "1 000 000 000"), null);
  assert.equal(err("asking_price", "1 000 000 001"), "range");
  assert.equal(err("total_price", "-1"), "range");
  assert.equal(err("asking_price", "4 900 000,5"), "whole");
  assert.equal(err("purchase_costs", "100 000 001"), "range");
  assert.equal(err("shared_debt", "1 000 000 000"), null);
  assert.equal(err("monthly_costs", "1 000 001"), "range");
  assert.equal(err("municipal_fees", "21 737"), null);
  assert.equal(err("municipal_fees", "1 000 001"), "range");
  // Arealer: 0,5-100 000 med hoeyst én desimal; tomten 1-10 000 000, ogsaa med én desimal (K §10.7).
  assert.equal(err("bra_i", "0,5"), null);
  assert.equal(err("bra_i", "0,4"), "range");
  assert.equal(err("bra_i", "75,25"), "decimals");
  assert.equal(err("bra_total", "100 000"), null);
  assert.equal(err("tba", "100 000,1"), "range");
  assert.equal(err("plot_area", "33 158"), null);
  assert.equal(err("plot_area", "0"), "range");
  assert.equal(err("plot_area", "10 000 001"), "range");
  assert.equal(err("plot_area", "500,5"), null);
  assert.equal(err("plot_area", "500,55"), "decimals");
  // Rom og etasjer.
  assert.equal(err("rooms", "0"), null);
  assert.equal(err("bedrooms", "101"), "range");
  assert.equal(err("floors", "0"), "range");
  assert.equal(err("floors", "3"), null);
  assert.equal(err("floor", "-5"), null);
  assert.equal(err("floor", "-6"), "range");
  assert.equal(err("floor", "200"), null);
  assert.equal(err("floor", "201"), "range");
  // Byggeaaret: 1600 til i aar + 5.
  assert.equal(err("build_year", "1600"), null);
  assert.equal(err("build_year", "1599"), "range");
  assert.equal(err("build_year", "2031"), null);
  assert.equal(err("build_year", "2032"), "range");
  // Tekst og valg.
  assert.equal(err("address", "x".repeat(200)), null);
  assert.equal(err("address", "x".repeat(201)), "too_long");
  assert.equal(err("target_group", "Barnefamilier"), null);
  assert.equal(err("target_group", "å".repeat(201)), "too_long");
  assert.equal(err("property_type", "villa"), "choice");
  assert.equal(err("energy_letter", "H"), "choice");
  assert.equal(err("energy_color", "groenn"), "choice");
  // Ikke et tall.
  assert.equal(err("asking_price", "12 mill"), "not_number");
  // Tomme felt er aldri feil.
  for (const key of PROPERTY_KEYS) assert.equal(err(key, "  "), null, key);
});

test("valideringen: grensene i feilteksten er norsk formatert", () => {
  const range = propertyFieldError("asking_price", "2 000 000 000", NOW);
  assert.deepEqual(range, { code: "range", vars: { min: "0", max: "1 000 000 000" } });
  assert.equal(t("nb", "listingText.property.error.range", range!.vars), "Må være mellom 0 og 1 000 000 000.");
  assert.deepEqual(propertyFieldError("build_year", "1500", NOW)?.vars, { min: "1600", max: "2031" });
  assert.deepEqual(propertyFieldError("bra_i", "0,1", NOW)?.vars, { min: "0,5", max: "100 000" });
  assert.deepEqual(propertyFieldError("address", "x".repeat(201), NOW)?.vars, { max: "200" });
});

test("valideringen: alle valgene fra kontrakten §10.1", () => {
  assert.deepEqual([...PROPERTY_TYPES], ["enebolig", "tomannsbolig", "rekkehus", "leilighet", "hytte", "gardsbruk", "tomt", "annet"]);
  assert.deepEqual([...OWNERSHIPS], ["selveier", "borettslag", "aksje", "obligasjon"]);
  assert.deepEqual([...PLOT_OWNERSHIPS], ["eiet", "festet"]);
  assert.deepEqual([...ENERGY_COLORS], ["morkegronn", "lysegronn", "gul", "oransje", "rod"]);
  assert.equal(propertyFieldError("energy_letter", "A", NOW), null);
  assert.equal(propertyFieldError("energy_letter", "G", NOW), null);
  // K §10.7: visningsnavnene som i backend.
  assert.equal(codeText("nb", "listingTextPropertyOption", "property_type.hytte"), "Hytte/fritidsbolig");
  assert.equal(codeText("nb", "listingTextPropertyOption", "property_type.gardsbruk"), "Gårdsbruk/småbruk");
});

test("valideringen: fargen i energimerket uten bokstaven er en feil ved fargen (K §10.7: 400 i backend)", () => {
  const colorOnly = draftWith({ energy_color: "oransje" });
  assert.deepEqual(propertyErrors(colorOnly, NOW), { energy_color: { code: "needs_letter", vars: {} } });
  assert.equal(propertyWire(colorOnly, ADDRESS, NOW), null);
  assert.deepEqual(propertyErrors({ ...colorOnly, energy_letter: "F" }, NOW), {});
  // Bokstaven alene er greit.
  assert.deepEqual(propertyErrors(draftWith({ energy_letter: "F" }), NOW), {});
  assert.equal(t("nb", "listingText.property.error.needs_letter"), "Velg bokstaven i energimerket også.");
});

// --- adressen, telleren og kroppen --------------------------------------------

test("adressen: fylt inn fra ordren og kan endres; uten utkast fra property i GET", () => {
  assert.equal(emptyPropertyDraft(ADDRESS).address, ADDRESS);
  const fresh = initialOrderDraft(null, { property: null, note: null }, ADDRESS);
  assert.equal(fresh.property.address, ADDRESS);
  assert.equal(fresh.note, "");
  // Etter bestillingen: verdiene fra property i GET, tallene i norsk format.
  const fromGet = initialOrderDraft(null, { property: { address: "Skogtunet 3B", asking_price: 12_500_000, bra_i: 75.5, build_year: 1999 }, note: "Nytt bad" }, ADDRESS);
  assert.equal(fromGet.property.address, "Skogtunet 3B");
  assert.equal(fromGet.property.asking_price, "12 500 000");
  assert.equal(fromGet.property.bra_i, "75,5");
  assert.equal(fromGet.property.build_year, "1999");
  assert.equal(fromGet.note, "Nytt bad");
  // property uten adresse: adressen fra ordren.
  assert.equal(propertyDraftFrom({ rooms: 4 }, ADDRESS).address, ADDRESS);
  // Utkastet i nettleseren gaar foran GET.
  const stored = { property: draftWith({ address: "Endret 1" }), note: "Utkast" };
  assert.equal(initialOrderDraft(stored, { property: { address: "Fra GET" }, note: "GET" }, ADDRESS), stored);
});

test("telleren: de seks noekkelopplysningene, bare gyldige felt, og totalprisen som backend regner ut", () => {
  assert.equal(KEY_FACT_COUNT, 6);
  assert.deepEqual([...KEY_FIELDS].sort(), ["address", "bedrooms", "bra_i", "energy_letter", "property_type", "total_price"]);
  // Adressen fra ordren teller (sted).
  assert.equal(keyFactsFilled(emptyPropertyDraft(ADDRESS), ADDRESS, NOW), 1);
  // Tomt adressefelt: backend bruker ordrens adresse.
  assert.equal(keyFactsFilled(draftWith({ address: "" }), ADDRESS, NOW), 1);
  assert.equal(keyFactsFilled(draftWith({ address: "" }, ""), "", NOW), 0);
  const all = draftWith({ total_price: "5 375 000", property_type: "leilighet", bra_i: "68", bedrooms: "2", energy_letter: "C" });
  assert.equal(keyFactsFilled(all, ADDRESS, NOW), 6);
  // Ugyldig felt teller ikke.
  assert.equal(keyFactsFilled({ ...all, bra_i: "68,25" }, ADDRESS, NOW), 5);
  // Fargen alene er ikke energimerket.
  assert.equal(keyFactsFilled({ ...all, energy_letter: "", energy_color: "gul" }, ADDRESS, NOW), 5);
  // Totalpris utregnet: prisantydning + omkostninger + fellesgjeld, eller selveier uten fellesgjeld.
  const parts = draftWith({ asking_price: "4 900 000", purchase_costs: "125 000" });
  assert.equal(keyFactsFilled(parts, ADDRESS, NOW), 1);
  assert.equal(keyFactsFilled({ ...parts, shared_debt: "350 000" }, ADDRESS, NOW), 2);
  assert.equal(keyFactsFilled({ ...parts, ownership: "selveier" }, ADDRESS, NOW), 2);
  assert.equal(keyFactsFilled({ ...parts, ownership: "borettslag" }, ADDRESS, NOW), 1);
  assert.equal(t("nb", "listingText.property.keyCount", { n: 4, max: KEY_FACT_COUNT }), "4 av 6 nøkkelopplysninger er fylt ut");
});

test("telleren: Sted er fylt ut og merket «fra ordren» naar adressen er ordrens; endret adresse uten merket", () => {
  assert.equal(locationFromOrder(emptyPropertyDraft(ADDRESS), ADDRESS), true);
  assert.equal(locationFromOrder(draftWith({ address: " skogtunet 3,  1410 KOLBOTN " }), ADDRESS), true);
  assert.equal(locationFromOrder(draftWith({ address: "" }), ADDRESS), true);
  assert.equal(locationFromOrder(draftWith({ address: "Skogtunet 3B" }), ADDRESS), false);
  assert.equal(locationFromOrder(draftWith({ address: "" }, ""), ""), false);
  // Sted teller begge veier.
  assert.equal(keyFactsFilled(emptyPropertyDraft(ADDRESS), ADDRESS, NOW), 1);
  assert.equal(keyFactsFilled(draftWith({ address: "Skogtunet 3B" }), ADDRESS, NOW), 1);
  assert.equal(t("nb", "listingText.property.locationFromOrder"), "Sted: fra ordren");
  const src = withoutComments(read("components/annonsetekst/ListingTextPropertyForm.tsx"));
  assert.match(src, /\{locationFromOrder\(draft, orderAddress\) && \(\s*<span[^>]*>\{t\(locale, "listingText\.property\.locationFromOrder"\)\}<\/span>/);
});

test("kroppen: tomme felt sendes ikke, tall som tall, tekst uten mellomrom rundt; ugyldig gir null", () => {
  const draft = draftWith({
    asking_price: "12 500 000",
    bra_i: "75,5",
    floor: "-1",
    property_type: "tomannsbolig",
    energy_letter: "F",
    energy_color: "oransje",
    target_group: "  Barnefamilier  ",
    rooms: "   ",
  });
  // Adressen er ordrens: utelatt, saa backend bruker ordren selv (K §10.7).
  assert.deepEqual(propertyWire(draft, ADDRESS, NOW), {
    property_type: "tomannsbolig",
    asking_price: 12_500_000,
    bra_i: 75.5,
    floor: -1,
    energy_letter: "F",
    energy_color: "oransje",
    target_group: "Barnefamilier",
  });
  assert.deepEqual(propertyWire(emptyPropertyDraft(""), "", NOW), {});
  assert.deepEqual(propertyWire(emptyPropertyDraft(ADDRESS), ADDRESS, NOW), {});
  assert.equal(propertyWire({ ...draft, bra_i: "75,55" }, ADDRESS, NOW), null);
  assert.deepEqual(Object.keys(propertyErrors({ ...draft, bra_i: "75,55", rooms: "x" }, NOW)).sort(), ["bra_i", "rooms"]);
});

test("kroppen: adressen bare naar megleren har endret den, begge veier (K §10.7)", () => {
  // Lik ordrens adresse (ogsaa med annen skrivemaate og mellomrom): utelatt.
  assert.deepEqual(propertyWire(draftWith({ bedrooms: "3" }), ADDRESS, NOW), { bedrooms: 3 });
  assert.deepEqual(propertyWire(draftWith({ address: "  skogtunet 3,  1410 kolbotn", bedrooms: "3" }), ADDRESS, NOW), { bedrooms: 3 });
  // Tomt adressefelt: utelatt.
  assert.deepEqual(propertyWire(draftWith({ address: "", bedrooms: "3" }), ADDRESS, NOW), { bedrooms: 3 });
  // Endret: med, uten mellomrom rundt.
  assert.deepEqual(propertyWire(draftWith({ address: " Skogtunet 3B ", bedrooms: "3" }), ADDRESS, NOW), { address: "Skogtunet 3B", bedrooms: 3 });
  // Bare ordrens adresse i skjemaet: ingen property i bestillingen.
  assert.equal(propertyForOrder(emptyPropertyDraft(ADDRESS), null, ADDRESS, NOW), undefined);
  assert.deepEqual(propertyForOrder(draftWith({ address: "Skogtunet 3B" }), null, ADDRESS, NOW), { address: "Skogtunet 3B" });
  // Siden sender ordrens adresse med til propertyForOrder.
  assert.match(withoutComments(read("components/annonsetekst/ListingTextOrder.tsx")), /propertyForOrder\(form\.property, pkg\?\.property \?\? null, assignment\.address\)/);
});

test("kroppen: property i bestillingen; null fjerner det lagrede, ellers utelatt naar alt er tomt", async () => {
  const wire = propertyForOrder(draftWith({ bedrooms: "3" }), null, ADDRESS, NOW);
  assert.deepEqual(wire, { bedrooms: 3 });
  assert.deepEqual(orderWireBody({ note: "Hei", property: wire }), { note: "Hei", property: { bedrooms: 3 } });
  // Alt er toemt, og pakken hadde Boligfakta: null fjerner det (K §10.1).
  assert.equal(propertyForOrder(emptyPropertyDraft(ADDRESS), { bedrooms: 3 }, ADDRESS, NOW), null);
  assert.deepEqual(orderWireBody({ property: null }), { property: null });
  // Alt er tomt uten lagret: noekkelen er ikke med.
  assert.equal(propertyForOrder(emptyPropertyDraft(""), null, "", NOW), undefined);
  assert.deepEqual(orderWireBody({ property: undefined }), {});
  // Kallet sender kroppen som JSON.
  let sent: unknown = null;
  const request = async (_path: string, init: RequestInit) => {
    sent = JSON.parse(String(init.body));
    return new Response(JSON.stringify({ assignment_id: "asg_1", display_status: "processing" }), { status: 202 });
  };
  await orderListingText(request, { id: "asg_1", order: { property: { bra_i: 75.5 } }, idempotencyKey: "k1" });
  assert.deepEqual(sent, { property: { bra_i: 75.5 } });
});

test("bestill: aldri sperret av tomme felt, sperret av ugyldige; Boligfakta er grunnlag, adressen bare naar den er endret", () => {
  const base = { images: 0, readyDocuments: 0, note: "", uploading: false, sending: false };
  assert.equal(propertyHasMaterial(emptyPropertyDraft(ADDRESS), ADDRESS), false);
  assert.equal(propertyHasMaterial(draftWith({ address: " skogtunet 3,  1410 kolbotn " }), ADDRESS), false);
  assert.equal(propertyHasMaterial(draftWith({ address: "Skogtunet 5" }), ADDRESS), true);
  assert.equal(propertyHasMaterial(draftWith({ target_group: "Barnefamilier" }), ADDRESS), false);
  assert.equal(propertyHasMaterial(draftWith({ bedrooms: "3" }), ADDRESS), true);
  assert.equal(orderBlock({ ...base, propertyMaterial: false }), "no_material");
  assert.equal(orderBlock({ ...base, propertyMaterial: true }), null);
  assert.equal(orderBlock({ ...base, images: 3, propertyInvalid: true }), "property_invalid");
  assert.equal(orderBlock({ ...base, images: 3, propertyInvalid: true, uploading: true }), "uploading");
  assert.equal(orderBlock({ ...base, images: 3, propertyInvalid: false }), null);
});

// --- utkastet i nettleseren -------------------------------------------------------

function memoryStorage(): TextDraftStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

test("utkastet: lagres per ordre, leses tilbake og slettes", () => {
  const storage = memoryStorage();
  const draft = { property: draftWith({ asking_price: "12 500 000", energy_letter: "F" }), note: "Nytt bad 2024" };
  assert.equal(saveOrderDraft(storage, "asg_1", draft), true);
  assert.deepEqual(loadOrderDraft(storage, "asg_1"), draft);
  assert.equal(loadOrderDraft(storage, "asg_2"), null);
  clearOrderDraft(storage, "asg_1");
  assert.equal(loadOrderDraft(storage, "asg_1"), null);
  assert.equal(storage.data.size, 0);
});

test("utkastet: taaler at lagringen feiler, mangler eller har ugyldig innhold", () => {
  const throwing: TextDraftStorage = {
    getItem: () => {
      throw new Error("SecurityError");
    },
    setItem: () => {
      throw new Error("QuotaExceededError");
    },
    removeItem: () => {
      throw new Error("SecurityError");
    },
  };
  const draft = { property: emptyPropertyDraft(ADDRESS), note: "" };
  assert.equal(saveOrderDraft(throwing, "asg_1", draft), false);
  assert.equal(loadOrderDraft(throwing, "asg_1"), null);
  assert.doesNotThrow(() => clearOrderDraft(throwing, "asg_1"));
  assert.equal(saveOrderDraft(null, "asg_1", draft), false);
  assert.equal(loadOrderDraft(null, "asg_1"), null);
  assert.doesNotThrow(() => clearOrderDraft(null, "asg_1"));
  const storage = memoryStorage();
  storage.data.set("annonsetekst.utkast.asg_1.v1", "{ikke json");
  assert.equal(loadOrderDraft(storage, "asg_1"), null);
  // Ukjente felt og valg som ikke finnes, hoppes over; tall og tekst beholdes som tekst.
  storage.data.set(
    "annonsetekst.utkast.asg_1.v1",
    JSON.stringify({ property: { rooms: "4", property_type: "slott", ukjent: "x", bedrooms: 3 }, note: 5 })
  );
  const loaded = loadOrderDraft(storage, "asg_1");
  assert.equal(loaded?.property.rooms, "4");
  assert.equal(loaded?.property.property_type, "");
  assert.equal(loaded?.property.bedrooms, "");
  assert.equal(loaded?.note, "");
  assert.equal(Object.hasOwn(loaded!.property, "ukjent"), false);
});

test("utkastet: siden husker per ordre og sletter etter bestillingen; lagringen i try/catch", () => {
  const src = withoutComments(read("components/annonsetekst/ListingTextOrder.tsx"));
  assert.match(src, /loadOrderDraft\(browserTextStorage\(\), assignmentId\)/);
  assert.match(src, /saveOrderDraft\(browserTextStorage\(\), assignmentId, next\)/);
  // Slettes bare etter et vellykket svar (foer setPackage), ikke ved feil.
  assert.match(src, /keys\.received\(\);\s*clearOrderDraft\(browserTextStorage\(\), assignmentId\);\s*setDraft\(null\);\s*text\.setPackage\(next\);/);
  assert.match(src, /property: propertyForOrder\(form\.property, pkg\?\.property \?\? null, assignment\.address\)/);
  const mod = withoutComments(read("lib/listingTextProperty.ts"));
  assert.match(mod, /window\.localStorage/);
  // Uten merkenavnet i noekkelen (design.test.ts).
  assert.match(mod, /`annonsetekst\.utkast\.\$\{assignmentId\}\.v1`/);
});

// --- GET, kildene og dokumenttypen ---------------------------------------------

test("GET: property leses med kjente noekler og riktig type; ukjent og feil type hoppes over", () => {
  const p = pkg({ property: { address: "Skogtunet 3", bra_i: 219, property_type: "tomannsbolig", ownership: "villa", rooms: "4", country: "no" } });
  assert.deepEqual(p.property, { address: "Skogtunet 3", property_type: "tomannsbolig", bra_i: 219 });
  assert.equal(pkg({}).property, null);
  assert.equal(pkg({ property: null }).property, null);
  assert.equal(parsePropertyWire([1, 2]), null);
});

test("kildene: source.form vises som «Oppgitt av megler», og nabolagsprofilen har navn", () => {
  const p = pkg({
    display_status: "to_review",
    version: 1,
    basis: {
      facts: [{ id: "p1", field: "bra_i", label: "BRA-i", value_text: "219 m²", kind: "broker", source: { form: true } }],
    },
  });
  const fact = p.basis!.facts[0];
  assert.equal(fact.source?.form, true);
  assert.equal(fact.source?.note, false);
  assert.equal(factSource("nb", fact, [], p.basis).text, "Oppgitt av megler");
  assert.equal(factSource("en", fact, [], p.basis).text, "Provided by the agent");
  assert.ok((DOCUMENT_KINDS as readonly string[]).includes("neighbourhood_profile"));
  assert.equal(codeText("nb", "listingTextDocumentKind", "neighbourhood_profile"), "Nabolagsprofil");
  assert.equal(codeText("en", "listingTextDocumentKind", "neighbourhood_profile"), "Neighbourhood profile");
});

// --- mock ---------------------------------------------------------------------

test("mock: tar property, gir det tilbake i GET og som fakta med form; ukjent noekkel gir 400", async () => {
  const mock = createListingTextMock("asg_mock", { latencyMs: 0 });
  await assert.rejects(
    orderListingText(mock.request, { id: "asg_mock", order: { property: { bra_i: 75, villa: true } as never }, idempotencyKey: "k0" }),
    (err: { httpStatus: number; code: string; detail: Record<string, unknown> }) =>
      err.httpStatus === 400 && err.code === "invalid_listing_text" && err.detail.field === "property.villa"
  );
  await assert.rejects(
    orderListingText(mock.request, { id: "asg_mock", order: { property: { energy_color: "gul" } }, idempotencyKey: "k0b" }),
    (err: { httpStatus: number; detail: Record<string, unknown> }) => err.httpStatus === 400 && err.detail.field === "property.energy_color"
  );
  const property = { address: "Mockveien 1", bra_i: 75.5, asking_price: 4_900_000, target_group: "Barnefamilier" };
  const ordered = await orderListingText(mock.request, { id: "asg_mock", order: { property }, idempotencyKey: "k1" });
  assert.deepEqual(ordered.property, property);
  let p = ordered;
  while (p.displayStatus === "processing") p = await getListingText(mock.request, "asg_mock");
  assert.deepEqual(p.property, property);
  const full = await getListingText(mock.request, "asg_mock", { includeBasis: true });
  const form = full.basis!.facts.filter((f) => f.source?.form === true);
  assert.deepEqual(
    form.map((f) => [f.id, f.field, f.valueText]),
    [
      ["p1", "location", "Mockveien 1"],
      ["p2", "asking_price", "4 900 000"],
      ["p3", "bra_i", "75,5"],
    ]
  );
});

// --- siden ----------------------------------------------------------------------

test("siden: Boligfakta mellom «Bildene» og «Dokumentene», «Om boligen» etter, uten tekst skrevet rett inn", () => {
  const form = withoutComments(read("components/annonsetekst/ListingTextOrderForm.tsx"));
  const images = form.indexOf('"listingText.order.imagesTitle"');
  const property = form.indexOf("<ListingTextPropertyForm");
  const docs = form.indexOf("<DocumentUploadPanel");
  const note = form.indexOf('"listingText.order.noteLabel"');
  assert.ok(images > 0 && images < property && property < docs && docs < note);
  assert.match(form, /property_invalid: "listingText\.order\.blockPropertyInvalid"/);
  for (const rel of ["components/annonsetekst/ListingTextPropertyForm.tsx", "components/annonsetekst/ListingTextOrderForm.tsx"]) {
    assert.deepEqual(literalTextsInFile(read(rel)), [], rel);
    assert.doesNotMatch(withoutComments(read(rel)), /\bfetch\(|API_BASE|\bconsole\./, rel);
  }
});

test("siden: feltene under hverandre paa mobil, to kolonner fra sm; merket, telleren og feilen ved feltet", () => {
  const src = withoutComments(read("components/annonsetekst/ListingTextPropertyForm.tsx"));
  assert.match(src, /className="grid grid-cols-1 gap-4 sm:grid-cols-2"/);
  assert.match(src, /KEY_FIELDS\.has\(key\) && <span[^>]*>\{t\(locale, "listingText\.property\.keyMark"\)\}<\/span>/);
  assert.match(src, /"listingText\.property\.keyCount", \{ n: filled, max: KEY_FACT_COUNT \}/);
  assert.match(src, /aria-invalid": error !== undefined/);
  assert.match(src, /"aria-describedby": error !== undefined \? errorId : undefined/);
  assert.match(src, /"listingText\.property\.targetHint"/);
  assert.match(src, /const tidy = tidyPropertyField\(key, draft\[key\]\);/);
  // Alle feltene utenom maalgruppen staar i en gruppe, i rekkefoelgen fra oppdraget.
  assert.deepEqual(PROPERTY_GROUPS.flat(), PROPERTY_KEYS.filter((k) => k !== "target_group"));
});

// --- ordlista ---------------------------------------------------------------------

test("ordlista: Boligfakta, valgene og feilene paa nb og en, med samme plassholdere", () => {
  const nb = DICTIONARIES.nb.ui as Record<string, string>;
  const en = DICTIONARIES.en.ui as Record<string, string>;
  const keys = Object.keys(nb).filter((k) => k.startsWith("listingText.property."));
  for (const key of PROPERTY_KEYS) assert.ok(keys.includes(`listingText.property.field.${key}`), key);
  for (const code of ["not_number", "whole", "decimals", "range", "too_long", "choice"]) {
    assert.ok(keys.includes(`listingText.property.error.${code}`), code);
  }
  const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
  for (const key of [...keys, "listingText.order.blockPropertyInvalid"]) {
    assert.ok(nb[key] && en[key], key);
    assert.notEqual(nb[key], en[key], key);
    assert.deepEqual(vars(nb[key]), vars(en[key]), key);
  }
  for (const locale of ["nb", "en"] as const) {
    const options = DICTIONARIES[locale].codes.listingTextPropertyOption;
    const all = [
      ...PROPERTY_TYPES.map((c) => `property_type.${c}`),
      ...OWNERSHIPS.map((c) => `ownership.${c}`),
      ...PLOT_OWNERSHIPS.map((c) => `plot_ownership.${c}`),
      ...ENERGY_COLORS.map((c) => `energy_color.${c}`),
    ];
    assert.deepEqual(Object.keys(options).sort(), all.sort(), locale);
  }
  assert.equal(t("nb", "listingText.property.title"), "Boligfakta");
  assert.equal(t("nb", "listingText.property.field.target_group"), "Målgruppe");
  assert.equal(t("nb", "listingText.property.targetHint"), "Valgfritt. Hvem passer boligen for? Påvirker vinkelen i teksten.");
  assert.equal(codeText("nb", "listingTextPropertyOption", "ownership.borettslag"), "Andel i borettslag");
  assert.equal(codeText("nb", "listingTextPropertyOption", "energy_color.oransje"), "Oransje");
  assert.equal(t("nb", "listingText.order.noteLabel"), "Om boligen");
  assert.match(t("nb", "listingText.order.noteHint"), /oppussing, kvaliteter, beliggenhet/);
  const docs = t("nb", "listingText.docs.noDocsHint");
  assert.match(docs, /^Tilstandsrapport, nabolagsprofil og andre dokumenter gjør teksten mer presis\./);
  assert.match(docs, /Uten dokumenter bygger teksten på bildene, boligfaktaene og det du skriver\./);
  assert.doesNotMatch(docs, /Uten salgsoppgave/);
});

test("Boligportal: kanalen heter Boligportal (en: Listing portal) i alt brukeren ser; noekkelen finn staar", () => {
  assert.equal(channelName("nb", "finn"), "Boligportal");
  assert.equal(channelName("en", "finn"), "Listing portal");
  assert.equal(t("nb", "express.card.annonsetekst.chip1"), "Boligportal, sosiale medier og e-post");
  assert.equal(t("en", "express.card.annonsetekst.chip1"), "Listing portal, social media and email");
  for (const locale of ["nb", "en"] as const) {
    const dict = DICTIONARIES[locale];
    const texts = [...Object.values(dict.ui), ...Object.values(dict.codes).flatMap((g) => Object.values(g))];
    assert.deepEqual(texts.filter((s) => /FINN/.test(s)), [], locale);
  }
  const guide = JSON.stringify(getGuidePage("no"));
  assert.doesNotMatch(guide, /FINN/);
  // Den oppdiktede pakken i mock nevner heller ikke FINN.
  assert.doesNotMatch(read("lib/listingTextMock.ts").replace(/\/\*[\s\S]*?\*\//g, ""), /FINN/);
});

// --- veiledningen ----------------------------------------------------------------

test("veiledningen: Boligfakta, «Om boligen» og maalgruppen; ingen «Noe vi bør vite?»", () => {
  const section = getGuidePage("no").sections.find((s) => s.id === "annonsetekst")!;
  const all = [...section.steps, ...(section.notes ?? [])].join("\n");
  assert.match(all, /«Boligfakta»/);
  assert.match(all, /«Nøkkelopplysning»/);
  assert.match(all, /«Om boligen»/);
  assert.match(all, /«Målgruppe»/);
  assert.match(all, /«Boligportal»/);
  assert.match(all, /Adressen er fylt inn fra ordren/);
  assert.match(all, /Tomme felt stopper aldri bestillingen/);
  assert.doesNotMatch(all, /Noe vi bør vite/);
  // Rekkefoelgen i stegene foelger siden: Boligfakta, dokumentene, «Om boligen», bestill.
  const at = (re: RegExp) => section.steps.findIndex((s) => re.test(s));
  assert.ok(at(/«Boligfakta»/) < at(/«Velg PDF-er»/));
  assert.ok(at(/«Velg PDF-er»/) < at(/«Om boligen»/));
  assert.ok(at(/«Om boligen»/) < at(/«Bestill tekstpakke»/));
});
