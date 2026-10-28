import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { withoutComments } from "./testing/jsxText.ts";
import type { DecisionOutcome, JobReviewDetail } from "./api.ts";
import type { ReviewDisclosure } from "./disclosure.ts";

// «Marker og beskriv» i Kveldsbilde (FE-3, Dag 58). Kontrakten er backend
// BE-7b (`dag58-lokal`, 8512789, flettet i backend-3): DecisionRequest.local og
// .candidate og `_choose` i services/router.py, local_view, local_accepted og
// review_payload i services/decisions.py, LOCAL_CODES i nivaa2/disclosure.py.
// `correction.last_round_error` kommer i samme backend-PR (Petter 28.10).
// Falske svar: fetch byttes ut, ingen nettverkskall og ingen betalte kall.
process.env.NEXT_PUBLIC_API_BASE = "http://api.test";
const api = await import("./api.ts");
const { DICTIONARIES, codeText, t } = await import("./i18n/index.ts");
const local = await import("./local.ts");
const { addBox, undo, STUDIO_START } = await import("./studio.ts");
const { disclosureText } = await import("./disclosure.ts");

const APP_DIR = fileURLToPath(new URL("..", import.meta.url));
const read = (rel: string) => withoutComments(readFileSync(join(APP_DIR, rel), "utf8"));

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});
const getToken = async () => "tok";

function captureFetch(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  return calls;
}

/** Review-svaret med LOCAL_EDIT paa, etter en lokal runde (som `review_payload`). */
const LOCAL_REVIEW = {
  job_id: "j1",
  status: "awaiting_approval",
  version: 7,
  allowed_actions: ["approve", "reject", "correct", "choose"],
  correction: {
    rounds_used: 1,
    rounds_left: 2,
    max_rounds: 3,
    current_round: 1,
    current_overrides: { promote: [], disable: [], add: [] },
    last_round_failed: false,
    choices_accepted: ["dusk_style", "dusk_sky"],
    current_choices: { dusk_style: "warm_dusk_v3", dusk_time: "early", dusk_sky: "light_clouds" },
    local_accepted: true,
  },
  images: { preview_url: "https://x/p.jpg" },
  local: {
    instruction: "remove",
    round: 1,
    chosen: 1,
    candidates: [
      { k: 1, preview_url: "https://x/c1.jpg" },
      { k: 2, preview_url: null },
    ],
  },
};

const review = (raw: unknown = LOCAL_REVIEW): JobReviewDetail => api.normalizeReview(raw, "j1");

/** Én boks fra (0,1, 0,2) til (0,4, 0,5). */
const ONE_BOX = addBox(STUDIO_START, { x: 0.4, y: 0.5 }, { x: 0.1, y: 0.2 });

// --- Review-svaret --------------------------------------------------------------

test("FE-3: review-svaret leses strengt: local_accepted, max_rounds, last_round_error og local", () => {
  const r = review();
  assert.equal(r.correction.localAccepted, true);
  assert.equal(r.correction.maxRounds, 3);
  assert.equal(r.correction.lastRoundError, null);
  assert.deepEqual(r.allowedActions, ["approve", "reject", "correct", "choose"]);
  assert.deepEqual(r.local, {
    instruction: "remove",
    round: 1,
    chosen: 1,
    candidates: [
      { k: 1, previewUrl: "https://x/c1.jpg" },
      { k: 2, previewUrl: null },
    ],
  });
  // Feil form: bare k 1 og 2, hver én gang; chosen utenfor 1–2 blir null.
  const odd = review({
    ...LOCAL_REVIEW,
    local: { chosen: 3, candidates: [{ k: 2 }, { k: 2 }, { k: 3 }, { k: "1" }, null] },
  });
  assert.deepEqual(odd.local?.candidates, [{ k: 2, previewUrl: null }]);
  assert.equal(odd.local?.chosen, null);
  // Uten kandidater, uten feltet (flagget av) eller null: ingen lokal runde.
  for (const value of [null, undefined, "x", { candidates: [] }]) {
    assert.equal(review({ ...LOCAL_REVIEW, local: value }).local, null, String(value));
  }
  // Uten LOCAL_EDIT mangler local_accepted: av.
  const off = review({ ...LOCAL_REVIEW, correction: { rounds_left: 2 } });
  assert.equal(off.correction.localAccepted, false);
  assert.equal(local.localShown(off), false);
  assert.equal(local.localShown(review()), true);
  // Bare `true` slaar det paa.
  assert.equal(review({ ...LOCAL_REVIEW, correction: { local_accepted: "true" } }).correction.localAccepted, false);
  // last_round_error: koden, eller null naar den er tom eller ikke tekst.
  const failed = review({ ...LOCAL_REVIEW, correction: { last_round_failed: true, last_round_error: "mask_empty" } });
  assert.equal(failed.correction.lastRoundError, "mask_empty");
  assert.equal(review({ correction: { last_round_error: "" } }).correction.lastRoundError, null);
  assert.equal(review({ correction: { last_round_error: 4 } }).correction.lastRoundError, null);
});

// --- Kjør: correct med local -----------------------------------------------------

test("FE-3: «Lag 2 forslag» sender correct med én boks, instruksen og expected_version, og 202 gir poll", async () => {
  const body = local.buildLocalCorrection(review(), ONE_BOX, "remove", "ignoreres");
  assert.deepEqual(body, {
    action: "correct",
    local: { shape: { shape: "box", points: [[0.1, 0.2], [0.4, 0.5]] }, instruction: "remove" },
    expected_version: 7,
  });
  const calls = captureFetch(202, { job_id: "j1", status: "running", round: 2, status_url: "/v1/jobs/j1" });
  const out = await api.postDecision({ jobId: "j1", decision: body!, getToken });
  assert.equal(calls[0].url, "http://api.test/v1/jobs/j1/decision");
  assert.equal(calls[0].init?.method, "POST");
  // Body er byte for byte det backend venter: aldri overrides, choices eller fireplace_fire (local_exclusive).
  assert.equal(
    calls[0].init?.body,
    '{"action":"correct","local":{"shape":{"shape":"box","points":[[0.1,0.2],[0.4,0.5]]},"instruction":"remove"},"expected_version":7}'
  );
  assert.deepEqual(out, { kind: "poll", status: "running" });
  assert.deepEqual(local.localResult(out), { kind: "poll" });
});

test("FE-3: Legg til har teksten, renset som i backend; de andre instruksene aldri tekst", () => {
  const add = local.buildLocalCorrection({ version: null }, ONE_BOX, "add", "  en  grønn\n plante ");
  assert.deepEqual(add?.local, {
    shape: { shape: "box", points: [[0.1, 0.2], [0.4, 0.5]] },
    instruction: "add",
    text: "en grønn plante",
  });
  assert.equal("expected_version" in (add ?? {}), false, "uten version: utelatt");
  for (const instruction of ["fire_out", "light", "remove"] as const) {
    const body = local.buildLocalCorrection({ version: 1 }, ONE_BOX, instruction, "tekst");
    assert.equal(body?.local?.instruction, instruction);
    assert.equal("text" in (body?.local ?? {}), false, instruction);
    assert.equal("overrides" in (body ?? {}), false);
    assert.equal("choices" in (body ?? {}), false);
    assert.equal("fireplace_fire" in (body ?? {}), false);
  }
  assert.deepEqual(local.LOCAL_INSTRUCTIONS, ["fire_out", "light", "remove", "add"]);
});

test("FE-3: knappen er laast til boksen, instruksen og teksten (1–200 tegn) er paa plass", () => {
  const m = (studio = ONE_BOX, instruction: "add" | "light" | null = "light", text = "") =>
    local.localMissing({ studio, instruction, text });
  assert.equal(m(STUDIO_START), "box");
  assert.equal(m(ONE_BOX, null), "instruction");
  assert.equal(m(ONE_BOX, "light"), null);
  assert.equal(m(ONE_BOX, "add", "   \n "), "text");
  assert.equal(m(ONE_BOX, "add", "x".repeat(200)), null);
  assert.equal(m(ONE_BOX, "add", "x".repeat(201)), "textTooLong");
  // Mellomrom som renses bort, teller ikke.
  assert.equal(m(ONE_BOX, "add", ` ${"x".repeat(200)} `), null);
  assert.equal(local.LOCAL_TEXT_MAX, 200);
  assert.equal(local.buildLocalCorrection({ version: 1 }, STUDIO_START, "light", ""), null);
  assert.equal(local.buildLocalCorrection({ version: 1 }, ONE_BOX, null, ""), null);
  assert.equal(local.buildLocalCorrection({ version: 1 }, ONE_BOX, "add", ""), null);
});

test("FE-3: én boks (B1): en ny boks erstatter den forrige, og Angre gir den forrige tilbake", () => {
  const second = local.keepOneBox(addBox(ONE_BOX, { x: 0.6, y: 0.6 }, { x: 0.9, y: 0.8 }));
  assert.equal(second.marks.length, 1);
  assert.deepEqual(local.localBox(second)?.from, { x: 0.6, y: 0.6 });
  const back = undo(second);
  assert.equal(back.marks.length, 1);
  assert.deepEqual(local.localBox(back)?.from, { x: 0.1, y: 0.2 });
  // En tilstand med én boks er uendret (samme objekt).
  assert.equal(local.keepOneBox(ONE_BOX), ONE_BOX);
  assert.equal(local.keepOneBox(STUDIO_START), STUDIO_START);
});

// --- Velg kandidat ----------------------------------------------------------------

test("FE-3: «Bruk denne» sender choose med kandidaten og expected_version; 200 gir ny henting (AVVIK 2)", async () => {
  const body = local.buildChoose(review(), 2);
  assert.deepEqual(body, { action: "choose", candidate: 2, expected_version: 7 });
  const calls = captureFetch(200, { job_id: "j1", status: "awaiting_approval", version: 9, chosen: 2 });
  const out = await api.postDecision({ jobId: "j1", decision: body, getToken });
  assert.equal(calls[0].init?.body, '{"action":"choose","candidate":2,"expected_version":7}');
  assert.equal(out.kind, "updated");
  assert.deepEqual(local.chooseResult(out), { kind: "reload", message: null });
  // Skulle backend svare 202 likevel, hentes review ogsaa paa nytt.
  assert.deepEqual(local.chooseResult({ kind: "poll", status: "running" }), { kind: "reload", message: null });
});

test("FE-3: kandidatene side om side; kandidat 1 i bruk fra start, «Bruk denne» bare med choose", () => {
  const view = local.candidatesView(review());
  assert.deepEqual(view, {
    candidates: [
      { k: 1, previewUrl: "https://x/c1.jpg" },
      { k: 2, previewUrl: null },
    ],
    chosen: 1,
    canChoose: true,
  });
  // Uten chosen fra backend: kandidat 1.
  assert.equal(local.candidatesView(review({ ...LOCAL_REVIEW, local: { ...LOCAL_REVIEW.local, chosen: null } }))?.chosen, 1);
  // Uten choose i allowed_actions (f.eks. admin paa andres jobb): ingen knapp.
  assert.equal(local.candidatesView(review({ ...LOCAL_REVIEW, allowed_actions: ["approve"] }))?.canChoose, false);
  // Én kandidat (den andre feilet): ingenting aa velge mellom.
  const one = review({ ...LOCAL_REVIEW, local: { ...LOCAL_REVIEW.local, candidates: [{ k: 1, preview_url: "u" }] } });
  assert.equal(local.candidatesView(one)?.canChoose, false);
  // Uten lokal runde, eller naar jobben ikke venter: ingen kandidater.
  assert.equal(local.candidatesView(review({ ...LOCAL_REVIEW, local: null })), null);
  assert.equal(local.candidatesView(review({ ...LOCAL_REVIEW, status: "succeeded" })), null);
});

// --- Feilkodene --------------------------------------------------------------------

const PROMPT_CODES = [
  "shape_invalid",
  "shape_not_supported",
  "text_required",
  "text_too_long",
  "local_not_accepted",
  "local_exclusive",
  "raw_missing",
  "raw_mismatch",
  "effect_too_large",
  "mask_empty",
  "no_candidate",
  "correction_limit",
  "candidate_invalid",
  "candidate_already_chosen",
];
/** Kodene i backend som ikke stod i oppdraget (AVVIK 4). */
const EXTRA_CODES = ["local_not_supported", "instruction_invalid", "text_not_accepted", "candidate_missing", "choose_failed"];

test("FE-3: alle feilkodene har norsk tekst (ikke den generiske)", () => {
  const nb = DICTIONARIES.nb.codes;
  for (const code of [...PROMPT_CODES, ...EXTRA_CODES]) {
    const hit = ["localError", "localRoundError", "decisionError"].filter((g) =>
      Object.hasOwn(nb[g as "localError"], code)
    );
    assert.ok(hit.length > 0, code);
  }
  // Ordlyden fra oppdraget.
  assert.match(codeText("nb", "localRoundError", "effect_too_large"), /^Markér et mindre område\./);
  assert.match(codeText("nb", "localRoundError", "mask_empty"), /^Fant ingen gjenstand i området\./);
  // Samme koder paa engelsk.
  for (const group of ["localError", "localRoundError", "disclosureLocal"] as const) {
    assert.deepEqual(Object.keys(DICTIONARIES.en.codes[group]), Object.keys(nb[group]), group);
  }
  // Tabellen i local.ts og ordlista er de samme kodene.
  assert.deepEqual([...local.LOCAL_ERROR_TEXT_CODES].sort(), Object.keys(nb.localError).sort());
  assert.deepEqual([...local.LOCAL_ROUND_ERRORS].sort(), Object.keys(nb.localRoundError).sort());
});

test("FE-3: 400 for formen og teksten gir retry (markeringen staar), med norsk tekst", async () => {
  for (const code of ["shape_invalid", "shape_not_supported", "instruction_invalid", "text_required", "text_too_long", "text_not_accepted"]) {
    captureFetch(400, { detail: { code, field: "local" } });
    const out = await api.postDecision({ jobId: "j1", decision: { action: "correct" }, getToken });
    assert.deepEqual(out, { kind: "blocked", code, fields: ["local"], overrideCode: null }, code);
    assert.deepEqual(local.localResult(out), { kind: "retry", message: { group: "localError", code } }, code);
  }
  // local_not_accepted og local_exclusive: 400 foer claim, siden laases med melding.
  for (const code of ["local_not_accepted", "local_exclusive", "local_not_supported"]) {
    captureFetch(400, { detail: { code, field: "local" } });
    const out = await api.postDecision({ jobId: "j1", decision: { action: "correct" }, getToken });
    assert.deepEqual(local.localResult(out), { kind: "blocked", message: { group: "localError", code } }, code);
  }
  // Uten LOCAL_ERROR_CODES ville 400 vaert «error» (generisk), som foer for ukjente koder.
  captureFetch(400, { detail: { code: "noe_annet" } });
  assert.deepEqual(await api.postDecision({ jobId: "j1", decision: { action: "correct" }, getToken }), {
    kind: "error",
    httpStatus: 400,
  });
});

test("FE-3: 409 raw_missing og raw_mismatch har egen tekst her (ikke lysstyrkens), correction_limit som foer", () => {
  const blocked = (code: string): DecisionOutcome => ({ kind: "blocked", code, fields: [], overrideCode: null });
  for (const code of ["raw_missing", "raw_mismatch"]) {
    assert.deepEqual(local.localResult(blocked(code)), { kind: "blocked", message: { group: "localError", code } });
    assert.notEqual(codeText("nb", "localError", code), codeText("nb", "decisionError", code));
  }
  assert.deepEqual(local.localResult(blocked("correction_limit")), {
    kind: "limit",
    message: { group: "decisionError", code: "correction_limit" },
  });
  assert.deepEqual(local.localResult({ kind: "status_changed", status: "awaiting_approval" }), {
    kind: "reload",
    message: { group: "decisionError", code: "status_changed" },
  });
});

test("FE-3: svarene paa «Bruk denne»: allerede valgt, mangler og feilet bytte", () => {
  const blocked = (code: string): DecisionOutcome => ({ kind: "blocked", code, fields: [], overrideCode: null });
  assert.deepEqual(local.chooseResult(blocked("candidate_already_chosen")), {
    kind: "reload",
    message: { group: "localError", code: "candidate_already_chosen" },
  });
  assert.deepEqual(local.chooseResult(blocked("candidate_missing")), {
    kind: "message",
    message: { group: "localError", code: "candidate_missing" },
    refetch: true,
  });
  assert.deepEqual(local.chooseResult(blocked("candidate_invalid")), {
    kind: "message",
    message: { group: "localError", code: "candidate_invalid" },
    refetch: true,
  });
  assert.deepEqual(local.chooseResult({ kind: "unavailable", code: "choose_failed" }), {
    kind: "message",
    message: { group: "localError", code: "choose_failed" },
    refetch: false,
  });
  assert.deepEqual(local.chooseResult({ kind: "not_found" }), { kind: "not_found" });
});

test("FE-3: runden som feilet: teksten for last_round_error, ellers samme melding som i dag", () => {
  const msg = (code: unknown) =>
    local.roundFailedMessage(review({ correction: { last_round_failed: true, last_round_error: code } }));
  assert.deepEqual(msg("effect_too_large"), { group: "localRoundError", code: "effect_too_large" });
  assert.deepEqual(msg("mask_empty"), { group: "localRoundError", code: "mask_empty" });
  assert.deepEqual(msg("no_candidate"), { group: "localRoundError", code: "no_candidate" });
  // Ukjent kode, en feil fra en hel runde, eller uten feltet (backend foer PR-en): som i dag.
  for (const code of ["timeout", null, undefined]) assert.deepEqual(msg(code), { key: "correct.roundFailed" });
  assert.equal(t("nb", "correct.roundFailed"), DICTIONARIES.nb.generic.localRoundError);
});

// --- Merketeksten -------------------------------------------------------------------

function d(edited: string[], extra: Partial<ReviewDisclosure> = {}): ReviewDisclosure {
  return { version: "10", base: "evening_from_day", time: "late", scope: "exterior", edited, source: "recorded", status: "ok", ...extra };
}
const BASE_NB = "Kveldsbilde laget med AI fra dagsbilde.";
const txt = (r: ReturnType<typeof disclosureText>) => (r?.kind === "text" ? r.text : null);

test("FE-3: merketeksten versjon 10: objects_removed og objects_added er egne setninger, candles som i dag", () => {
  assert.equal(
    txt(disclosureText("nb", d(["window_lights", "candles", "objects_removed"]), "edited")),
    `${BASE_NB} Lys i vinduer og stearinlys er redigert. Gjenstander er fjernet digitalt.`
  );
  assert.equal(
    txt(disclosureText("nb", d(["objects_removed", "objects_added"]), "edited")),
    `${BASE_NB} Gjenstander er fjernet digitalt. Gjenstander er lagt til digitalt.`
  );
  assert.equal(txt(disclosureText("nb", d(["objects_added"]), "base")), BASE_NB);
  assert.equal(
    txt(disclosureText("en", d(["sky", "objects_added"]), "edited")),
    "Evening image created with AI from a daytime photo. Sky has been edited. Objects have been added digitally."
  );
  // Ukjent kode gir fortsatt ingen tekst, og aarstidsbasene tar ikke de lokale kodene.
  assert.deepEqual(disclosureText("nb", d(["objects_moved"]), "edited"), { kind: "missing" });
  assert.deepEqual(
    disclosureText("nb", d(["objects_removed"], { base: "season_winter", time: null }), "edited"),
    { kind: "missing" }
  );
});

// --- Siden og komponentene ------------------------------------------------------------

test("FE-3: siden viser valget bare naar review-svaret sier det, lerretet med én boks, og kandidatene", () => {
  const page = read("(app)/godkjenning/[jobId]/page.tsx");
  assert.match(page, /const localAvailable = localShown\(review\) && review\.images\.previewUrl !== null;/);
  assert.match(page, /const isLocal = isEditing && localMode && localAvailable;/);
  // Valget staar ved siden av «Lag et nytt forsøk»/«Endre valgene» (tittelen fra correctionView).
  assert.match(page, /\{localAvailable && \(\s*<div role="group"[\s\S]*?\{t\(locale, correctionTitleKey\)\}[\s\S]*?\{t\(locale, "local\.title"\)\}/);
  assert.match(page, /\{isLocal \? \(\s*<LocalEditPanel[\s\S]*?onSubmit=\{submitLocal\}[\s\S]*?\) : \(\s*<CorrectionPanel/);
  // Venting som i dag: pending "correct" og poll.
  const submit = page.slice(page.indexOf("const submitLocal"), page.indexOf("const chooseCandidate"));
  assert.match(submit, /setPending\("correct"\);/);
  assert.match(submit, /handle: \(out\) => handleCorrection\(localResult\(out\)\)/);
  // «Bruk denne»: choose, og 200 henter review paa nytt gjennom runDecision.
  const choose = page.slice(page.indexOf("const chooseCandidate"), page.indexOf("const messageText"));
  assert.match(choose, /buildChoose\(review, k\)/);
  assert.match(choose, /refetch: fetchReview/);
  assert.match(page, /\{candidates !== null && !isLocal && making === null && \(\s*<LocalCandidates/);
  // Feilteksten for runden.
  assert.match(page, /const failedMessage = roundFailedMessage\(review\);/);
  assert.match(page, /roundFailedText=\{/);
  assert.match(read("components/godkjenning/DecisionCard.tsx"), /\{roundFailedText \?\? t\(locale, "correct\.roundFailed"\)\}/);
  // Ingen tjenestenavn: valget styres bare av review-svaret.
  assert.doesNotMatch(read("lib/local.ts"), /skumring|preset|klart_vaer/);
});

test("FE-3: panelet: fire knapper, tekstfelt bare for Legg til (maxLength og teller), og linja med rundene", () => {
  const panel = read("components/godkjenning/LocalEditPanel.tsx");
  assert.match(panel, /LOCAL_INSTRUCTIONS\.map\(/);
  assert.match(panel, /\{instruction === "add" && \(/);
  assert.match(panel, /maxLength=\{LOCAL_TEXT_MAX\}/);
  assert.match(panel, /t\(locale, "local\.textCount", \{ n: text\.length, max: LOCAL_TEXT_MAX \}\)/);
  assert.match(panel, /disabled=\{locked \|\| missing !== null\}/);
  assert.deepEqual(
    local.LOCAL_INSTRUCTIONS.map((i) => t("nb", local.LOCAL_INSTRUCTION_KEYS[i])),
    ["Slukk", "Tenn", "Fjern dette", "Legg til"]
  );
  const info = local.localInfo(review());
  assert.equal(t("nb", info.key, info.vars), "2 forslag · bare det markerte endres · runder igjen: 2 av 3");
  const noMax = local.localInfo(review({ correction: { rounds_left: 1 } }));
  assert.equal(t("nb", noMax.key, noMax.vars), "2 forslag · bare det markerte endres · runder igjen: 1");
  // Kandidatene: side om side fra sm, under hverandre paa mobil.
  const cands = read("components/godkjenning/LocalCandidates.tsx");
  assert.match(cands, /grid grid-cols-1 sm:grid-cols-2/);
  assert.match(cands, /view\.canChoose && \(/);
  assert.match(cands, /onClick=\{\(\) => onChoose\(c\.k\)\}/);
});
