import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ALL_PANELS,
  moodReview,
  panelShown,
  presetFileSlug,
  presetLabelKey,
  presetWorkingKey,
  shownPanels,
} from "./presets.ts";
import { downloadFileName, downloadMarkedImage } from "./download.ts";
import { mergeRefresh, overlayFor, workingKey, workingView } from "./jobMedia.ts";
import { canShowMarkers } from "./lightsView.ts";
import { DICTIONARIES } from "./i18n/index.ts";
import { isServiceEnabled } from "./services.ts";
import { DEFAULT_DUSK, duskParams } from "./dusk.ts";
import type { JobReviewDetail, JobSummary, ReviewLight } from "./api.ts";

/*
 * G3: etikett, ventetekst, filnavn og paneler slaas opp paa (service,
 * preset). null (jobben kjoerer) gir reserven «Kveldsbilde»; en ukjent
 * oppskrift faar aldri «Kveldsbilde».
 */

const nb = DICTIONARIES.nb.ui;
const en = DICTIONARIES.en.ui;
const JOB = "250dccaf-1234-4abc-9def-000000000000";

// --- Etiketten ---------------------------------------------------------------

test("G3: skumring, skumring_interior og reserven (null) heter «Kveldsbilde»", () => {
  for (const preset of ["skumring", "skumring_interior", null, undefined]) {
    const key = presetLabelKey("scene_transform", preset);
    assert.equal(key, "service.scene_transform", String(preset));
    assert.equal(nb[key!], "Kveldsbilde");
  }
});

test("G3: ukjent oppskrift under scene_transform gir null, aldri «Kveldsbilde»", () => {
  assert.equal(presetLabelKey("scene_transform", "ukjent_oppskrift"), null);
  assert.equal(presetLabelKey("scene_transform", "toString"), null);
  assert.equal(presetLabelKey("scene_transform", "__proto__"), null);
});

test("G3: andre tjenester som serviceLabelKey, uansett oppskrift", () => {
  assert.equal(presetLabelKey("privacy_blur", null), "service.privacy_blur");
  assert.equal(presetLabelKey("magic_cleanup"), "service.magic_cleanup");
  assert.equal(presetLabelKey("virtual_stage", "noe"), "service.virtual_stage");
  assert.equal(presetLabelKey("lawn_green", null), null);
});

// --- Ventetekst ----------------------------------------------------------------

test("G3: ventetekst per oppskrift; reserven og skumring er «Lager kveldsbilde …»", () => {
  for (const preset of ["skumring", "skumring_interior", null, undefined]) {
    assert.equal(presetWorkingKey("scene_transform", preset), "media.working.scene_transform");
    assert.equal(workingKey("scene_transform", preset), "media.working.scene_transform");
  }
  assert.equal(workingKey("scene_transform", "ukjent_oppskrift"), "media.working.generic");
  assert.equal(workingKey("privacy_blur", null), "media.working.privacy_blur");
  assert.equal(workingKey("noe_nytt", "skumring"), "media.working.generic");
  assert.deepEqual(workingView("scene_transform", "ukjent_oppskrift"), {
    kind: "placeholder",
    overlay: { key: "media.working.generic", working: true },
  });
  assert.deepEqual(workingView("scene_transform", "skumring"), {
    kind: "placeholder",
    overlay: { key: "media.working.scene_transform", working: true },
  });
});

test("G3: kortet mens jobben kjoerer bruker oppskriften, og null som reserve", () => {
  const job = (presetId: string | null) => ({ status: "running" as const, service: "scene_transform", code: null, presetId });
  assert.deepEqual(overlayFor(job(null)), { key: "media.working.scene_transform", working: true });
  assert.deepEqual(overlayFor(job("skumring")), { key: "media.working.scene_transform", working: true });
  assert.deepEqual(overlayFor(job("ukjent_oppskrift")), { key: "media.working.generic", working: true });
});

test("G3: automatisk henting bytter kortet naar oppskriften kommer", () => {
  const row = (presetId: string | null): JobSummary => ({
    jobId: "a",
    service: "scene_transform",
    status: "running",
    createdAt: null,
    thumbUrl: null,
    originalThumbUrl: null,
    error: null,
    code: null,
    reason: null,
    isOwner: true,
    ownerShort: null,
    presetId,
    orderId: null,
  });
  const prev = [row(null)];
  assert.equal(mergeRefresh(prev, [row(null)], 20)[0], prev[0]);
  const next = mergeRefresh(prev, [row("skumring")], 20);
  assert.notEqual(next[0], prev[0]);
  assert.equal(next[0].presetId, "skumring");
});

// --- Filnavn -------------------------------------------------------------------

test("G3: filnavnet er kveldsbilde-ai_<8>.jpg for skumring og reserven, som foer", () => {
  for (const preset of ["skumring", "skumring_interior", null, undefined]) {
    assert.equal(presetFileSlug(preset), "kveldsbilde");
    assert.equal(downloadFileName(JOB, preset), "kveldsbilde-ai_250dccaf.jpg");
  }
});

test("G3: ukjent oppskrift gir id-en renset til a-z0-9 i filnavnet", () => {
  assert.equal(downloadFileName(JOB, "ukjent_oppskrift"), "ukjentoppskrift-ai_250dccaf.jpg");
  assert.equal(downloadFileName(JOB, "Ny/../Tjeneste-2"), "nytjeneste2-ai_250dccaf.jpg");
  assert.equal(downloadFileName("", "ukjent_oppskrift"), "ukjentoppskrift-ai.jpg");
  // Ingenting igjen etter rensing: «bilde», aldri «kveldsbilde».
  assert.equal(downloadFileName(JOB, "øæå"), "bilde-ai_250dccaf.jpg");
});

test("G3: nedlastingen bruker oppskriften i filnavnet", async () => {
  const saved: string[] = [];
  const result = await downloadMarkedImage({
    jobId: JOB,
    presetId: "ukjent_oppskrift",
    fetchFile: async () => new Response(new Uint8Array([0xff, 0xd8]), { status: 200 }),
    save: (_blob, name) => saved.push(name),
  });
  assert.deepEqual(result, { kind: "ok", fileName: "ukjentoppskrift-ai_250dccaf.jpg" });
  assert.deepEqual(saved, ["ukjentoppskrift-ai_250dccaf.jpg"]);
});

// --- Klart vaer (K2) ------------------------------------------------------------

test("K2: klart_vaer heter «Blå himmel», kortets tittel, paa nb og en", () => {
  const key = presetLabelKey("scene_transform", "klart_vaer");
  assert.equal(key, "express.tool.klart_vaer.title");
  assert.equal(nb[key!], "Blå himmel");
  assert.equal(en[key!], "Blue sky");
});

test("K2: ventetekst for klart_vaer er «Bytter himmelen …»", () => {
  assert.equal(presetWorkingKey("scene_transform", "klart_vaer"), "media.working.klart_vaer");
  assert.equal(workingKey("scene_transform", "klart_vaer"), "media.working.klart_vaer");
  const job = { status: "running" as const, service: "scene_transform", code: null, presetId: "klart_vaer" };
  assert.deepEqual(overlayFor(job), { key: "media.working.klart_vaer", working: true });
  assert.equal(nb["media.working.klart_vaer"], "Bytter himmelen …");
  assert.equal(en["media.working.klart_vaer"], "Replacing the sky …");
});

test("K2: filnavnet for klart_vaer er blaahimmel-ai_<8>.jpg", () => {
  assert.equal(presetFileSlug("klart_vaer"), "blaahimmel");
  assert.equal(downloadFileName(JOB, "klart_vaer"), "blaahimmel-ai_250dccaf.jpg");
  assert.equal(downloadFileName("", "klart_vaer"), "blaahimmel-ai.jpg");
});

test("K2: skumring og reserven er fortsatt «Kveldsbilde» og kveldsbilde-ai", () => {
  for (const preset of ["skumring", null]) {
    assert.equal(nb[presetLabelKey("scene_transform", preset)!], "Kveldsbilde");
    assert.equal(presetWorkingKey("scene_transform", preset), "media.working.scene_transform");
    assert.equal(downloadFileName(JOB, preset), "kveldsbilde-ai_250dccaf.jpg");
  }
});

test("K2/K3: klart_vaer kan bestilles (aapnet i K3), og faar ingen skumringsfelt", () => {
  assert.equal(isServiceEnabled("klart_vaer"), true);
  assert.deepEqual(duskParams("scene_transform", "klart_vaer", DEFAULT_DUSK), {});
});

test("K2: beskrivelsen av Blå himmel lover ikke dagslys", () => {
  assert.equal(nb["express.tool.klart_vaer.desc"], "Bytter grå himmel med klar, blå himmel.");
  assert.equal(en["express.tool.klart_vaer.desc"], "Replaces a grey sky with a clear blue sky.");
  assert.doesNotMatch(nb["express.tool.klart_vaer.desc"], /dagslys/i);
  assert.doesNotMatch(en["express.tool.klart_vaer.desc"], /daylight/i);
});

// --- Paneler -------------------------------------------------------------------

test("G3: shownPanels(null) gir alle fem; ellers lista som den er", () => {
  assert.deepEqual(shownPanels(null), ["fireplace", "dusk", "style", "lights", "correct"]);
  assert.deepEqual(shownPanels(undefined), ALL_PANELS);
  assert.deepEqual(shownPanels([]), []);
  assert.deepEqual(shownPanels(["dusk", "lights"]), ["dusk", "lights"]);
});

test("G3: panelShown uten feltet viser alt; med feltet bare de i lista", () => {
  for (const panel of ALL_PANELS) {
    assert.equal(panelShown({}, panel), true, panel);
    assert.equal(panelShown({ reviewPanels: null }, panel), true, panel);
    assert.equal(panelShown({ reviewPanels: [] }, panel), false, panel);
  }
  assert.equal(panelShown({ reviewPanels: ["lights"] }, "lights"), true);
  assert.equal(panelShown({ reviewPanels: ["lights"] }, "fireplace"), false);
});

function light(key: string, box: [number, number, number, number] | null = [0, 0, 10, 10]): ReviewLight {
  return { key, id: key, run: 0, type: "spotlight", location: null, box, reasonCode: null, editable: true, state: null };
}

type MoodInput = Pick<JobReviewDetail, "dusk" | "style" | "lights" | "fireplace" | "reviewPanels">;
const MOOD: MoodInput = {
  dusk: { time: "early", sky: "clear", skyApplied: true },
  style: { requested: "nordic_blue_hour_v1", applied: "nordic_blue_hour_v1" },
  lights: { approved: [light("a")], unstable: [], rejected: [] },
  fireplace: { present: true, disagreement: false, answer: "yes" },
  reviewPanels: null,
};

test("G3: moodReview uten panellista gir dataene uendret", () => {
  assert.deepEqual(moodReview(MOOD), {
    dusk: MOOD.dusk,
    style: MOOD.style,
    fireplace: MOOD.fireplace,
    lights: MOOD.lights,
    duskShown: true,
    lightsShown: true,
  });
  const all = { ...MOOD, reviewPanels: [...ALL_PANELS] };
  assert.deepEqual(moodReview(all), moodReview(MOOD));
});

test("G3: moodReview tommer skjulte paneler, og null naar alle fire er borte", () => {
  const r = moodReview({ ...MOOD, reviewPanels: ["style", "correct"] });
  assert.deepEqual(r, {
    dusk: null,
    style: MOOD.style,
    fireplace: { present: true, disagreement: false, answer: null },
    lights: { approved: [], unstable: [], rejected: [] },
    duskShown: false,
    lightsShown: false,
  });
  assert.equal(moodReview({ ...MOOD, reviewPanels: ["correct"] }), null);
  assert.equal(moodReview({ ...MOOD, reviewPanels: [] }), null);
  assert.notEqual(moodReview({ ...MOOD, reviewPanels: ["lights"] }), null);
});

test("G3: lampene i bildet vises ikke uten lyspanelet", () => {
  const review = (reviewPanels: JobReviewDetail["reviewPanels"] | undefined) =>
    ({
      images: { originalUrl: "https://x/o.jpg" },
      lights: MOOD.lights,
      mediaDeletedAt: null,
      reviewPanels,
    }) as Parameters<typeof canShowMarkers>[0];
  assert.equal(canShowMarkers(review(undefined), { litOnly: false }), true);
  assert.equal(canShowMarkers(review(null), { litOnly: false }), true);
  assert.equal(canShowMarkers(review(["lights"]), { litOnly: false }), true);
  assert.equal(canShowMarkers(review(["dusk", "correct"]), { litOnly: false }), false);
});
