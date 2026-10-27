import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ImageTypeView } from "./api.ts";
import { brokerDiffersNote, choiceKey, imageTypeChoices, imageTypeLine, imageTypeParams } from "./imageType.ts";
import { analysisNotes, noteText, reviewNotes, type Note } from "./review.ts";
import { orderableTools } from "./services.ts";
import { stylingParams, EMPTY_STYLING } from "./styling.ts";
import { DICTIONARIES, orderErrorText, t, type UiKey } from "./i18n/index.ts";
import { literalTexts, withoutComments } from "./testing/jsxText.ts";

// «Hvor er bildet tatt?» (TG-NEW-268, backend #257 bak IMAGE_TYPE_CHOICE):
// valget ved bestilling, 400-tekstene og merknadene paa godkjenningssiden.
// api.ts kaster ved import uten NEXT_PUBLIC_API_BASE: dynamisk import.
process.env.NEXT_PUBLIC_API_BASE = "http://api.test";
const api = await import("./api.ts");

const APP = join(dirname(fileURLToPath(import.meta.url)), "..");
const code = (rel: string) => withoutComments(readFileSync(join(APP, rel), "utf8"));
const tool = (id: string) => {
  const found = orderableTools().find((x) => x.id === id);
  assert.ok(found, id);
  return found;
};

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

// --- Valgene per tjeneste ---------------------------------------------------------

test("valgene per tjeneste: Kveldsbilde inne/ute, Blå himmel ute/drone, ingen for styling og personvern", () => {
  assert.deepEqual(imageTypeChoices(tool("skumring")), ["auto", "interior", "exterior"]);
  assert.deepEqual(imageTypeChoices(tool("klart_vaer")), ["auto", "exterior", "aerial"]);
  for (const id of ["digital_styling", "privacy_blur"]) assert.deepEqual(imageTypeChoices(tool(id)), [], id);
  assert.deepEqual(imageTypeChoices(null), []);
  assert.deepEqual(imageTypeChoices(undefined), []);
  // Knappene paa nb, i fast rekkefoelge.
  assert.deepEqual(
    imageTypeChoices(tool("skumring")).map((c) => t("nb", choiceKey(c))),
    ["La analysen avgjøre", "Innendørs", "Utendørs"]
  );
  assert.deepEqual(
    imageTypeChoices(tool("klart_vaer")).map((c) => t("nb", choiceKey(c))),
    ["La analysen avgjøre", "Utendørs", "Drone"]
  );
});

test("image_type_hint sendes bare naar noe er valgt, og bare et lovlig valg", () => {
  const kveld = tool("skumring");
  const himmel = tool("klart_vaer");
  assert.deepEqual(imageTypeParams(kveld, "auto"), {});
  assert.deepEqual(imageTypeParams(kveld, "interior"), { image_type_hint: "interior" });
  assert.deepEqual(imageTypeParams(kveld, "exterior"), { image_type_hint: "exterior" });
  assert.deepEqual(imageTypeParams(himmel, "aerial"), { image_type_hint: "aerial" });
  // Et valg fra en annen tjeneste foelger aldri med.
  assert.deepEqual(imageTypeParams(kveld, "aerial"), {});
  assert.deepEqual(imageTypeParams(himmel, "interior"), {});
  assert.deepEqual(imageTypeParams(tool("digital_styling"), "exterior"), {});
  assert.deepEqual(imageTypeParams(null, "exterior"), {});
});

test("Tjenester: velgeren bare med valg, feltet i bestillingen, og nullstilt ved ny tjeneste, nytt bilde og «Start på nytt»", () => {
  const page = code("(app)/tjenester/page.tsx");
  assert.match(page, /const imageTypeOptions = imageTypeChoices\(selectedTool\);/);
  assert.match(page, /\{imageTypeOptions\.length > 0 && \(\s*<ImageTypeChoice\s+choices=\{imageTypeOptions\}\s+value=\{imageType\}/);
  const start = page.indexOf("job.run(preview.file, selectedTool.service, {");
  const body = page.slice(start, page.indexOf("});", start));
  assert.match(body, /\.\.\.imageTypeParams\(selectedTool, imageType\),/);
  // selectTool, handleFileChange og handleReset.
  assert.equal(page.match(/setImageType\("auto"\);/g)?.length, 3);
  // Etter skumringsvalgene, foer styling-velgeren.
  assert.ok(page.indexOf("<DuskChoicePicker") < page.indexOf("<ImageTypeChoice"));
  assert.ok(page.indexOf("<ImageTypeChoice") < page.indexOf("<StylingChoicePicker"));
  // Den gamle velgeren er urørt (TG-NEW-270) og deler ingenting med den nye.
  assert.match(page, /const showSceneControls =/);
  assert.doesNotMatch(code("components/ImageTypeChoice.tsx"), /sceneType|scene_type|express\.imageType/);
});

test("Digital styling faar ikke valget, og bestillingen sender aldri feltet", () => {
  const params = stylingParams({ ...EMPTY_STYLING, furnishAs: "living", roomEmpty: true, styles: ["styling_japandi"] });
  assert.ok(params !== null);
  assert.ok(!("image_type_hint" in params));
  assert.doesNotMatch(code("lib/styling.ts"), /image_type_hint|imageType/);
  assert.doesNotMatch(code("components/StylingChoicePicker.tsx"), /ImageTypeChoice|imageType/);
});

// --- 400 ved bestilling -------------------------------------------------------------

test("400 image_type_hint_not_supported: koden, og valget som grunn", async () => {
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({ detail: { code: "image_type_hint_not_supported", hint: "aerial", allowed: ["exterior", "interior"] } }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    )) as typeof fetch;
  const image = new File([new Uint8Array([1])], "a.jpg", { type: "image/jpeg" });
  const err = await api
    .submitJob({ service: "scene_transform", image, params: { preset_id: "skumring", image_type_hint: "aerial" }, getToken: async () => "tok" })
    .then(() => null, (e: unknown) => e);
  assert.ok(err instanceof api.SubmitError);
  assert.equal(err.httpStatus, 400);
  assert.equal(err.code, "image_type_hint_not_supported");
  assert.equal(err.detail.reason, "aerial");
});

test("400-tekstene: Kveldsbilde + Drone og Blå himmel + Innendørs; ukjent valg og ugyldig verdi gir den generelle", () => {
  assert.equal(orderErrorText("nb", "image_type_hint_not_supported", "aerial"), "Kveldsbilde kan ikke lages fra dronebilder ennå.");
  assert.equal(orderErrorText("nb", "image_type_hint_not_supported", "interior"), "Blå himmel bytter himmelen på bilder tatt utendørs.");
  assert.equal(orderErrorText("en", "image_type_hint_not_supported", "aerial"), "Dusk image cannot be made from drone photos yet.");
  assert.equal(orderErrorText("en", "image_type_hint_not_supported", "interior"), "Blue sky replaces the sky in photos taken outdoors.");
  const generic = "Bildet kunne ikke behandles. Prøv igjen, eller kontakt oss.";
  for (const hint of ["exterior", "toString", null, 5]) {
    assert.equal(orderErrorText("nb", "image_type_hint_not_supported", hint), generic, String(hint));
  }
  assert.equal(orderErrorText("nb", "invalid_image_type_hint", null), generic);
});

// --- Review-svaret ----------------------------------------------------------------

test("image_type i review: source og hint strengt lest; gamle svar gir analysis og null", () => {
  const read = (raw: unknown) => api.normalizeReview({ image_type: raw }, "j").imageType;
  assert.deepEqual(read({ value: "interior", run_values: ["balcony_terrace", "balcony_terrace"], source: "broker", hint: "interior" }), {
    value: "interior",
    runValues: ["balcony_terrace", "balcony_terrace"],
    source: "broker",
    hint: "interior",
  });
  assert.deepEqual(read({ value: "balcony_terrace", run_values: ["balcony_terrace"] }), {
    value: "balcony_terrace",
    runValues: ["balcony_terrace"],
    source: "analysis",
    hint: null,
  });
  assert.deepEqual(read({ value: "x", run_values: [], source: "admin", hint: "garage" }), {
    value: "x",
    runValues: [],
    source: "analysis",
    hint: null,
  });
  assert.deepEqual(read(undefined), { value: null, runValues: [], source: "analysis", hint: null });
});

// --- Merknadene -----------------------------------------------------------------

function view(over: Partial<ImageTypeView>): ImageTypeView {
  return { value: "exterior_facade", runValues: [], source: "broker", hint: "exterior", ...over };
}

function differs(over: Partial<ImageTypeView>, locale: "nb" | "en" = "nb"): string | null {
  const note = brokerDiffersNote({ flagCodes: ["image_type_broker_differs"], imageType: view(over) });
  return note === null ? null : noteText(locale, note);
}

test("merknaden: eksemplet, og de fire tilfellene fra svaret (Cowork 27.10)", () => {
  assert.equal(
    differs({ hint: "exterior", value: "exterior_facade", runValues: ["interior", "interior"] }),
    "Du valgte Utendørs, men analysen mente at bildet er tatt innendørs. Bildet er laget som et utebilde. Sjekk at det ser riktig ut."
  );
  // 1. Fasaden er «fra bakken» naar megleren valgte Drone.
  assert.equal(
    differs({ hint: "aerial", value: "aerial", runValues: ["exterior_facade", "exterior_facade"] }),
    "Du valgte Drone, men analysen mente at bildet er tatt fra bakken. Bildet er laget som et dronebilde. Sjekk at det ser riktig ut."
  );
  // 2. Fasade og balkong sammen: bare fasaden.
  assert.equal(
    differs({ hint: "interior", value: "interior", runValues: ["exterior_facade", "balcony_terrace"] }),
    "Du valgte Innendørs, men analysen mente at bildet er tatt utendørs. Bildet er laget som et innebilde. Sjekk at det ser riktig ut."
  );
  // 3. Uenige kjoeringer: i rekkefoelge, med «eller».
  assert.equal(
    differs({ hint: "exterior", value: "exterior_facade", runValues: ["interior", "aerial"] }),
    "Du valgte Utendørs, men analysen mente at bildet er tatt innendørs eller fra en drone. Bildet er laget som et utebilde. Sjekk at det ser riktig ut."
  );
  // 4. Alle `other`: egen setning.
  assert.equal(
    differs({ hint: "exterior", value: "exterior_facade", runValues: ["other", "other"] }),
    "Du valgte Utendørs, men analysen kjente ikke igjen hvor bildet er tatt. Bildet er laget som et utebilde. Sjekk at det ser riktig ut."
  );
});

test("merknaden: other tas ut naar det finnes andre ord, balkongen alene, og ingen like ord to ganger", () => {
  assert.equal(
    differs({ hint: "exterior", value: "exterior_facade", runValues: ["other", "interior"] }),
    "Du valgte Utendørs, men analysen mente at bildet er tatt innendørs. Bildet er laget som et utebilde. Sjekk at det ser riktig ut."
  );
  assert.equal(
    differs({ hint: "interior", value: "interior", runValues: ["balcony_terrace", "balcony_terrace"] }),
    "Du valgte Innendørs, men analysen mente at bildet er tatt på en balkong eller terrasse. Bildet er laget som et innebilde. Sjekk at det ser riktig ut."
  );
  // Fasaden «fra bakken» og balkongen med Drone: bare fasaden.
  assert.equal(
    differs({ hint: "aerial", value: "aerial", runValues: ["balcony_terrace", "exterior_facade"] }),
    "Du valgte Drone, men analysen mente at bildet er tatt fra bakken. Bildet er laget som et dronebilde. Sjekk at det ser riktig ut."
  );
  assert.equal(
    differs({ hint: "exterior", value: "balcony_terrace", runValues: ["interior", "interior"] }, "en"),
    "You chose Outdoors, but the analysis thought the photo was taken indoors. The image was made as an outdoor photo. Check that it looks right."
  );
});

test("merknaden aldri med tomme felt: tom run_values, manglende valg eller type gir den generelle; ingen kode gir ingen", () => {
  const unknown = "Analysen hadde en merknad til bildet. Sammenlign bildet nøye med originalen.";
  assert.equal(differs({ runValues: [] }), unknown);
  assert.equal(differs({ hint: null, runValues: ["interior"] }), unknown);
  assert.equal(differs({ hint: undefined, runValues: ["interior"] }), unknown);
  assert.equal(differs({ value: "other", runValues: ["interior"] }), unknown);
  assert.equal(differs({ value: null, runValues: ["interior"] }), unknown);
  assert.equal(differs({ runValues: ["garage", "__proto__"] }), unknown);
  assert.equal(brokerDiffersNote({ flagCodes: [], imageType: view({ runValues: ["interior"] }) }), null);
});

test("merknaden for Blå himmel + Drone, og den generelle for andre tjenester", () => {
  assert.deepEqual(analysisNotes({ flagCodes: ["image_type_untested"], presetId: "klart_vaer" }), ["note.image_type_untested.klart_vaer"]);
  assert.equal(
    t("nb", "note.image_type_untested.klart_vaer"),
    "Blå himmel er ikke testet på dronebilder ennå. Sjekk bildet nøye før du godkjenner."
  );
  assert.deepEqual(analysisNotes({ flagCodes: ["image_type_untested"], presetId: "skumring" }), ["note.analysis_other"]);
  // Uenigheten har egne ord og kommer ikke fra analysisNotes.
  assert.deepEqual(analysisNotes({ flagCodes: ["image_type_broker_differs"], presetId: "skumring" }), []);
});

test("reviewNotes: uenigheten med ord foerst, saa de andre, og den generelle hoeyst én gang", () => {
  const notes = reviewNotes({
    flagCodes: ["analysis_sky_unclear", "image_type_broker_differs", "image_type_untested"],
    presetId: "klart_vaer",
    imageType: view({ hint: "aerial", value: "aerial", runValues: ["exterior_facade"] }),
  });
  assert.deepEqual(
    notes.map((n: Note) => n.key),
    ["note.image_type_broker_differs", "note.analysis_sky_unclear", "note.image_type_untested.klart_vaer"]
  );
  const twice = reviewNotes({
    flagCodes: ["image_type_broker_differs", "something_new"],
    presetId: "skumring",
    imageType: view({ runValues: [] }),
  });
  assert.deepEqual(twice.map((n) => n.key), ["note.unknown"]);
  // Uten merknaden om bildetypen: som analysisNotes.
  assert.deepEqual(
    reviewNotes({ flagCodes: ["single_run"], presetId: "skumring", imageType: view({}) }),
    [{ key: "note.single_run.kveldsbilde" }]
  );
});

test("linja «Bildetype: … (valgt ved bestilling)» bare naar megleren valgte typen (valg 2A)", () => {
  const line = (over: Partial<ImageTypeView>, locale: "nb" | "en" = "nb") => {
    const note = imageTypeLine({ imageType: view(over) });
    return note === null ? null : noteText(locale, note);
  };
  assert.equal(line({ hint: "exterior" }), "Bildetype: Utendørs (valgt ved bestilling)");
  assert.equal(line({ hint: "interior" }), "Bildetype: Innendørs (valgt ved bestilling)");
  assert.equal(line({ hint: "aerial" }), "Bildetype: Drone (valgt ved bestilling)");
  assert.equal(line({ hint: "exterior" }, "en"), "Photo type: Outdoors (chosen when ordering)");
  assert.equal(line({ source: "analysis", hint: null }), null);
  // Bare naar typen ble brukt fra valget (source "broker"), ogsaa om svaret skulle ha et valg.
  assert.equal(line({ source: "analysis", hint: "exterior" }), null);
  assert.equal(line({ source: undefined, hint: undefined }), null);
  assert.equal(line({ source: "broker", hint: null }), null);
});

test("siden og kortet: merknadene og linja for alle roller, linja over merknadene og i resultatkortet", () => {
  const page = code("(app)/godkjenning/[jobId]/page.tsx");
  assert.match(page, /const typeLine = imageTypeLine\(review\);/);
  assert.match(page, /notes=\{reviewNotes\(review\)\}\s+imageTypeLine=\{typeLine\}/);
  assert.match(page, /\{typeLine !== null && <p className="text-sm text-ink mt-2">\{noteText\(locale, typeLine\)\}<\/p>\}/);
  assert.doesNotMatch(page, /admin && .*typeLine/);
  const card = code("components/godkjenning/DecisionCard.tsx");
  const line = card.indexOf("{imageTypeLine !== null &&");
  assert.ok(line > 0 && line < card.indexOf("{notes.length > 0 && ("), "linja over merknadene");
  assert.match(card, /<p key=\{note\.key\}>\{noteText\(locale, note\)\}<\/p>/);
});

test("velgeren: tekstene fra ordlista, knapper med aria-pressed i en gruppe", () => {
  const src = readFileSync(join(APP, "components/ImageTypeChoice.tsx"), "utf8");
  assert.deepEqual(literalTexts(withoutComments(src)), []);
  assert.match(src, /aria-pressed=\{value === choice\}/);
  assert.match(src, /role="group" aria-label=\{t\(locale, "imageTypeChoice\.title"\)\}/);
  assert.equal(t("nb", "imageTypeChoice.title"), "Hvor er bildet tatt?");
  assert.equal(t("nb", "imageTypeChoice.help"), "Vet du det, blir resultatet sikrere. Ellers avgjør analysen.");
});

test("ordlista: alle de nye tekstene paa nb og en, og «Blå himmel», aldri «Klart vær»", () => {
  const keys = Object.keys(DICTIONARIES.nb.ui).filter((k) =>
    /^(imageTypeChoice|imageTypeWord|imageTypeMade)\.|^note\.image_type_(broker_differs|untested)|^review\.imageTypeChosen$/.test(k)
  ) as UiKey[];
  assert.equal(keys.length, 19);
  for (const key of keys) {
    assert.ok(DICTIONARIES.en.ui[key].length > 1, key);
    for (const locale of ["nb", "en"] as const) assert.doesNotMatch(DICTIONARIES[locale].ui[key], /Klart vær/, key);
  }
  for (const locale of ["nb", "en"] as const) {
    for (const text of Object.values(DICTIONARIES[locale].codes.imageTypeHintNotSupported)) {
      assert.doesNotMatch(text, /Klart vær/);
    }
  }
});
