import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { DecisionAction } from "./api.ts";
import { analysisNotes, isFireplaceStop, isStopped, NOTE_ORDER, STOP_REASON_ORDER, stopReasons } from "./review.ts";
import { DICTIONARIES, t, type UiKey } from "./i18n/index.ts";
import { withoutComments } from "./testing/jsxText.ts";

// Porten (Dag 56, P3a, Petter 27.10): tydelige tekster naar en jobb stopper,
// og merknadene fra analysen, for alle roller. stopReasons og analysisNotes
// tar ingen rolle: det megleren ser, er det admin ser.

const APP = join(dirname(fileURLToPath(import.meta.url)), "..");
const code = (rel: string) => withoutComments(readFileSync(join(APP, rel), "utf8"));

const KVELD = "skumring";
const KLART = "klart_vaer";
const STYLING = "styling_japandi";

function stopped(
  reasonCodes: string[],
  opts: { presetId?: string | null; actions?: DecisionAction[]; imageType?: string | null; code?: string | null; status?: string } = {}
) {
  return {
    status: opts.status ?? "needs_review",
    code: opts.code === undefined ? "gate_review" : opts.code,
    reasonCodes,
    allowedActions: opts.actions ?? ["continue", "reject"],
    presetId: opts.presetId === undefined ? KVELD : opts.presetId,
    imageType: { value: opts.imageType ?? null, runValues: [] },
  };
}

const nb = (keys: UiKey[]) => keys.map((k) => t("nb", k));

// --- Stoppboksen ----------------------------------------------------------------

test("P3a: hver grunnkode gir sin tekst (nb), ordrett som i oppdraget", () => {
  const cases: [string, Parameters<typeof stopped>[1], string][] = [
    [
      "screenshot_overlay",
      {},
      "Bildet ser ut som et skjermbilde med en meny- eller adresselinje øverst, og linjen blir med i bildet. Last opp originalfotoet, eller lag bildet likevel.",
    ],
    ["analysis_uncertain", {}, "Analysen var usikker på noe i bildet. Du kan lage bildet likevel og sjekke resultatet nøye."],
    [
      "valid_runs_insufficient",
      {},
      "Bare én av to analyser av bildet ga svar. Du kan lage bildet likevel og sjekke resultatet nøye.",
    ],
    ["valid_runs_insufficient", { actions: ["reject"] }, "Analysen av bildet feilet. Avbryt og prøv igjen."],
    [
      "image_type_disagreement",
      {},
      "Analysene var uenige om hva slags bilde dette er. Lager du bildet likevel, bruker vi den første analysen, så sjekk resultatet nøye.",
    ],
    [
      "image_type_untested",
      { presetId: KLART },
      "Blå himmel er ikke testet på denne typen bilde ennå, så resultatet kan bli dårligere. Vil du prøve likevel?",
    ],
    [
      "image_type_untested",
      { presetId: KVELD, actions: ["reject"] },
      "Kveldsbilde er ikke laget for denne typen bilde ennå, for eksempel dronebilder.",
    ],
    [
      "image_type_untested",
      { presetId: STYLING, actions: ["reject"] },
      "Digital styling er ikke laget for denne typen bilde ennå, for eksempel dronebilder.",
    ],
    ["image_type_not_supported", { presetId: KLART }, "Blå himmel kan ikke brukes på bilder tatt innendørs."],
    ["sky_missing", { presetId: KLART }, "Bildet har ingen himmel som kan byttes."],
    ["sky_through_windows_only", { presetId: KLART }, "Himmelen synes bare gjennom vinduer."],
    [
      "furnish_as_mismatch",
      { presetId: STYLING, imageType: "interior" },
      "Bildet ser ut som et rom inne, men du valgte balkong eller terrasse. Avbryt og bestill på nytt med riktig romtype.",
    ],
    [
      "furnish_as_mismatch",
      { presetId: STYLING, imageType: "balcony_terrace" },
      "Bildet ser ut som et uterom, men du valgte et rom inne. Avbryt og bestill på nytt med riktig romtype.",
    ],
    [
      "furnish_as_mismatch",
      { presetId: STYLING, imageType: "exterior_facade" },
      "Bildet ser ut som et uterom, men du valgte et rom inne. Avbryt og bestill på nytt med riktig romtype.",
    ],
    [
      "furnish_as_mismatch",
      { presetId: STYLING, imageType: "aerial" },
      "Bildet passer ikke romtypen du valgte. Avbryt og bestill på nytt med riktig romtype.",
    ],
    [
      "furnish_as_mismatch",
      { presetId: STYLING, imageType: null },
      "Bildet passer ikke romtypen du valgte. Avbryt og bestill på nytt med riktig romtype.",
    ],
    [
      "fireplace_disagreement",
      { code: "fireplace_answer_missing" },
      "Vi er usikre på om bildet har en peis. Velg om den skal være tent.",
    ],
    ["fireplace_present", {}, "Vi er usikre på om bildet har en peis. Velg om den skal være tent."],
  ];
  for (const [reason, opts, text] of cases) {
    assert.deepEqual(nb(stopReasons(stopped([reason], opts))), [text], `${reason} ${JSON.stringify(opts)}`);
  }
});

test("P3a: alle grunnkodene har tekst paa nb og en, og ingen er tom", () => {
  for (const reason of STOP_REASON_ORDER) {
    for (const presetId of [KVELD, KLART, STYLING]) {
      for (const key of stopReasons(stopped([reason], { presetId }))) {
        for (const locale of ["nb", "en"] as const) {
          assert.ok(DICTIONARIES[locale].ui[key].trim().length > 20, `${locale} ${key}`);
        }
      }
    }
  }
});

test("P3a: flere grunner vises alle, i fast rekkefoelge, uten duplikater", () => {
  const keys = stopReasons(
    stopped(["analysis_uncertain", "valid_runs_insufficient", "image_type_disagreement", "analysis_uncertain"])
  );
  assert.deepEqual(keys, [
    "stop.reason.image_type_disagreement",
    "stop.reason.valid_runs_insufficient.one",
    "stop.reason.analysis_uncertain",
  ]);
  // Begge peiskodene gir én tekst.
  assert.deepEqual(stopReasons(stopped(["fireplace_present", "fireplace_disagreement"])), ["stop.reason.fireplace"]);
  // Skjermbildet foerst.
  assert.equal(stopReasons(stopped(["analysis_uncertain", "screenshot_overlay"]))[0], "stop.reason.screenshot_overlay");
});

test("P3a: ukjente koder og tom liste gir en noeytral tekst, aldri en tom boks", () => {
  for (const codes of [[], ["unknown"], ["brand_new_code"], ["__proto__"], ["toString"], ["constructor"]]) {
    assert.deepEqual(stopReasons(stopped(codes)), ["stop.reason.unknown"], JSON.stringify(codes));
  }
  // Kjent og ukjent: den kjente, og den noeytrale til slutt.
  assert.deepEqual(stopReasons(stopped(["sky_missing", "brand_new_code"], { presetId: KLART })), [
    "stop.reason.sky_missing",
    "stop.reason.unknown",
  ]);
  // Utestet bildetype i en ukjent tjeneste: noeytral.
  assert.deepEqual(stopReasons(stopped(["image_type_untested"], { presetId: "noe_nytt" })), ["stop.reason.unknown"]);
  assert.equal(t("nb", "stop.reason.unknown"), "Vi stoppet bildet før det ble laget.");
});

test("P3a: stoppboksen bare ved needs_review; overskriften og peisstoppet", () => {
  for (const status of ["awaiting_approval", "succeeded", "failed", "running"]) {
    assert.deepEqual(stopReasons(stopped(["analysis_uncertain"], { status })), [], status);
    assert.equal(isStopped({ status }), false, status);
  }
  assert.equal(isStopped({ status: "needs_review" }), true);
  assert.equal(isFireplaceStop({ status: "needs_review", code: "fireplace_answer_missing" }), true);
  assert.equal(isFireplaceStop({ status: "needs_review", code: "gate_review" }), false);
  assert.equal(isFireplaceStop({ status: "awaiting_approval", code: "fireplace_answer_missing" }), false);
  assert.equal(t("nb", "stop.title"), "Vi trenger et svar fra deg før vi lager bildet.");
  assert.equal(t("en", "stop.title"), "We need an answer from you before we create the image.");
});

// --- Merknadsboksen -------------------------------------------------------------

test("P3a: hver flaggkode gir sin tekst (nb)", () => {
  const cases: [string, string, string][] = [
    [
      "analysis_light_unconfirmed",
      KVELD,
      "Analysen fant noe som kan være en lampe, men var ikke sikker, så den er ikke tent. Er det en lampe, kan du tenne den i «Korriger bildet».",
    ],
    [
      "analysis_sky_unclear",
      KLART,
      "Analysen var usikker på hvor mye himmel som synes. Sjekk at himmelen ser naturlig ut mot originalen.",
    ],
    [
      "analysis_overexposed",
      STYLING,
      "Deler av originalen er svært lyse, så detaljer kan mangle der. Sjekk de lyse områdene mot originalen.",
    ],
    [
      "analysis_text_unreadable",
      KVELD,
      "Analysen kunne ikke lese all tekst i bildet, som skilt eller husnummer. Sjekk at teksten er lik originalen.",
    ],
    ["analysis_other", KVELD, "Analysen var usikker på noe i bildet. Sammenlign bildet nøye med originalen."],
    [
      "single_run",
      KVELD,
      "Bare én av to analyser ga svar, så ingen lamper er tent. Du kan tenne dem i «Korriger bildet».",
    ],
    ["single_run", KLART, "Analysen var usikker på noe i bildet. Sammenlign bildet nøye med originalen."],
    ["single_run", STYLING, "Analysen var usikker på noe i bildet. Sammenlign bildet nøye med originalen."],
    [
      "image_type_disagreement",
      STYLING,
      "Analysen var usikker på bildetypen, så vi brukte rommet du valgte. Sjekk at møblene passer rommet.",
    ],
    [
      "sky_visibility_disagreement",
      KLART,
      "Analysene var uenige om hvor mye himmel som synes, så vi regnet med minst himmel. Sjekk at himmelen ser naturlig ut mot originalen.",
    ],
    ["fireplace_disagreement", KVELD, "Analysene var uenige om bildet har en peis. Sjekk peisen mot originalen."],
    [
      "analysis_screenshot_overlay",
      KVELD,
      "Bildet ser ut som et skjermbilde med en meny- eller adresselinje øverst. Sjekk om linjen er med i bildet.",
    ],
  ];
  for (const [flag, presetId, text] of cases) {
    assert.deepEqual(nb(analysisNotes({ flagCodes: [flag], presetId })), [text], `${flag}/${presetId}`);
  }
});

test("P3a: lampeteksten bare for Kveldsbilde", () => {
  assert.deepEqual(analysisNotes({ flagCodes: ["analysis_light_unconfirmed"], presetId: KVELD }), [
    "note.analysis_light_unconfirmed",
  ]);
  assert.deepEqual(analysisNotes({ flagCodes: ["analysis_light_unconfirmed"], presetId: "skumring_interior" }), [
    "note.analysis_light_unconfirmed",
  ]);
  for (const presetId of [KLART, STYLING, "noe_nytt"]) {
    assert.deepEqual(analysisNotes({ flagCodes: ["analysis_light_unconfirmed"], presetId }), [], presetId);
    const keys = analysisNotes({ flagCodes: ["single_run", "analysis_light_unconfirmed"], presetId });
    for (const key of keys) assert.doesNotMatch(t("nb", key), /lampe|Korriger bildet/, `${presetId} ${key}`);
  }
});

test("P3a: merknadene i fast rekkefoelge, uten duplikater, ukjente gir noeytral tekst", () => {
  assert.deepEqual(analysisNotes({ flagCodes: [], presetId: KVELD }), []);
  assert.deepEqual(analysisNotes({ flagCodes: ["analysis_other", "single_run"], presetId: STYLING }), ["note.analysis_other"]);
  assert.deepEqual(
    analysisNotes({ flagCodes: ["fireplace_disagreement", "analysis_light_unconfirmed", "brand_new"], presetId: KVELD }),
    ["note.analysis_light_unconfirmed", "note.fireplace_disagreement", "note.unknown"]
  );
  for (const flag of ["unknown", "__proto__", "toString", "brand_new"]) {
    assert.deepEqual(analysisNotes({ flagCodes: [flag], presetId: KVELD }), ["note.unknown"], flag);
  }
  assert.equal(
    t("nb", "note.unknown"),
    "Analysen hadde en merknad til bildet. Sammenlign bildet nøye med originalen."
  );
  // Alle kjente koder har tekst paa nb og en.
  for (const presetId of [KVELD, KLART, STYLING]) {
    for (const key of analysisNotes({ flagCodes: [...NOTE_ORDER], presetId })) {
      for (const locale of ["nb", "en"] as const) assert.ok(DICTIONARIES[locale].ui[key].length > 20, `${locale} ${key}`);
    }
  }
});

test("P3a: ingen tekst lover gratisbildet tilbake (kommer med P2)", () => {
  for (const locale of ["nb", "en"] as const) {
    for (const [key, text] of Object.entries(DICTIONARIES[locale].ui)) {
      if (key.startsWith("stop.") || key.startsWith("note.")) assert.doesNotMatch(text, /gratis|free|tilbake|back/i, key);
    }
  }
});

// --- Knappene -------------------------------------------------------------------

test("P3a: knappenavnene, nb og en", () => {
  const expected: [UiKey, string, string][] = [
    ["action.continueAnyway", "Lag likevel", "Create anyway"],
    ["action.makeImage", "Lag bildet", "Create the image"],
    ["action.stopReject", "Avbryt", "Cancel"],
    ["action.confirmStop", "Ja, avbryt", "Yes, cancel"],
    ["action.back", "Tilbake", "Back"],
    ["stop.confirm", "Bildet blir ikke laget.", "The image will not be created."],
    // Etter at bildet er laget: som foer.
    ["action.approve", "Godkjenn", "Approve"],
    ["action.reject", "Avvis", "Reject"],
  ];
  for (const [key, nbText, enText] of expected) {
    assert.equal(t("nb", key), nbText, key);
    assert.equal(t("en", key), enText, key);
  }
});

const card = code("components/godkjenning/DecisionCard.tsx");

test("P3a: kortet bytter knappenavn bare i stoppet, og peisen heter «Lag bildet»", () => {
  assert.match(
    card,
    /t\(locale, stop === null \? "action\.continue" : stop\.fireplace \? "action\.makeImage" : "action\.continueAnyway"\)/
  );
  assert.match(card, /t\(locale, stop === null \? "action\.reject" : "action\.stopReject"\)/);
});

test("P3a: «Avbryt» i stoppet spoer kort, uten begrunnelse", () => {
  const start = card.indexOf("{controls.reject && rejectOpen && stop !== null && (");
  const end = card.indexOf("{controls.reject && rejectOpen && stop === null && (");
  assert.ok(start > 0 && end > start, "egen bekreftelse i stoppet");
  const confirm = card.slice(start, end);
  assert.match(confirm, /t\(locale, "stop\.confirm"\)/);
  assert.match(confirm, /onClick=\{\(\) => onDecide\("reject"\)\} disabled=\{locked\} className=\{BTN_DANGER\}>\s*\{t\(locale, "action\.confirmStop"\)\}/);
  assert.match(confirm, /onClick=\{\(\) => onRejectOpen\(false\)\} disabled=\{locked\} className=\{BTN_SECONDARY\}>\s*\{t\(locale, "action\.back"\)\}/);
  assert.doesNotMatch(confirm, /textarea|reasonText|action\.cancel|confirmReject/);
  // Etter bildet: tekstfeltet og «Bekreft avvisning» som foer.
  assert.match(card.slice(end), /<textarea[\s\S]*action\.confirmReject/);
});

// --- Siden og kortet ------------------------------------------------------------

test("P3a: stoppboksen har overskriften og én linje per grunn", () => {
  const box = card.slice(card.indexOf("{stop !== null && ("), card.indexOf("{controls.fireplaceQuestion"));
  assert.match(box, /t\(locale, "stop\.title"\)/);
  assert.match(box, /stop\.reasons\.map\(\(key\) => \(/);
});

test("P3a: merknadsboksen over sjekklista, i samme stil som merknaden fra kontrollen, bare naar Godkjenn vises", () => {
  const approveBlock = card.slice(card.indexOf("{controls.approve && ("), card.indexOf("{controls.none ?"));
  const notes = approveBlock.indexOf("{notes.length > 0 && (");
  assert.ok(notes > 0, "i Godkjenn-blokken");
  assert.ok(notes < approveBlock.indexOf("{checklist !== null && ("), "over sjekklista");
  assert.ok(notes > approveBlock.indexOf('view.notice === "note"'), "etter merknaden fra kontrollen");
  assert.match(
    approveBlock,
    /\{notes\.length > 0 && \(\s*<div className="flex flex-col gap-2 text-sm text-amber-fg bg-amber-bg rounded-button p-3 break-words" role="status">/
  );
});

test("P3a: siden gir stoppboksen og merknadene til alle roller; «Detaljer» er fortsatt bare admin", () => {
  const page = code("(app)/godkjenning/[jobId]/page.tsx");
  assert.match(
    page,
    /stop=\{\s*isStopped\(review\)\s*\? \{ reasons: stopReasons\(review\), fireplace: isFireplaceStop\(review\) \}\s*: null\s*\}/
  );
  assert.match(page, /notes=\{analysisNotes\(review\)\}/);
  assert.doesNotMatch(page, /(stop|notes)=\{[^}]*admin/);
  assert.match(page, /\{showDetails\(caps\) && <DetailsPanel /);
});

test("P3a: jobbkortet sier «Vi trenger et svar fra deg …», peisen beholder sin tekst", () => {
  const { reviewCode } = DICTIONARIES.nb.codes;
  assert.equal(reviewCode.gate_review, "Vi trenger et svar fra deg før vi lager bildet.");
  assert.equal(reviewCode.needs_review, "Vi trenger et svar fra deg før vi lager bildet.");
  assert.equal(reviewCode.fireplace_answer_missing, "Venter på svar om peisen.");
  assert.equal(DICTIONARIES.nb.generic.reviewCode, "Vi trenger et svar fra deg før vi lager bildet.");
  for (const locale of ["nb", "en"] as const) {
    assert.doesNotMatch(JSON.stringify(DICTIONARIES[locale].codes.reviewCode), /må sjekkes|needs a check/);
  }
});
