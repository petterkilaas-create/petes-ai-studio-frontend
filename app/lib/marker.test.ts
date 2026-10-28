import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { withoutComments } from "./testing/jsxText.ts";
import type { DecisionOutcome, JobReviewDetail } from "./api.ts";
import type { ReviewDisclosure } from "./disclosure.ts";

// «Marker og beskriv», studio v2 (Dag 58). Kontrakten er backend STUDIO_V2_BE
// (RAPPORT_STUDIO_V2_BE.md, «Kontrakten (bekreftet)», valgene A1, B1, C1, D1):
// `correct` med `local: {edits: [...]}` (1–4) eller `local: {retry: k}`,
// `local: {round, retry_of, edits: [{k, instruction, box, text_len, status}]}`
// i review, og `images.previous.preview_url` som forrige versjon (D1).
// Merketeksten v10 og feilmeldingen for runden er fra FE-3.
// Falske svar: fetch byttes ut, ingen nettverkskall og ingen betalte kall.
process.env.NEXT_PUBLIC_API_BASE = "http://api.test";
const api = await import("./api.ts");
const { DICTIONARIES, codeText, t } = await import("./i18n/index.ts");
const local = await import("./local.ts");
const { addBox, removeMark, undo, STUDIO_START } = await import("./studio.ts");
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

/** Review-svaret etter en lokal v2-runde med tre endringer, der nummer 2 feilet. */
const LOCAL_REVIEW = {
  job_id: "j1",
  status: "awaiting_approval",
  version: 7,
  allowed_actions: ["approve", "reject", "correct"],
  correction: {
    rounds_used: 1,
    rounds_left: 2,
    max_rounds: 3,
    last_round_failed: false,
    local_accepted: true,
  },
  images: {
    preview_url: "https://x/p2.jpg",
    original_url: "https://x/o.jpg",
    previous: { round: 0, preview_url: "https://x/p1.jpg" },
  },
  local: {
    round: 1,
    retry_of: null,
    edits: [
      { k: 1, instruction: "remove", box: [[0.1, 0.2], [0.3, 0.4]], text_len: 0, status: "ok" },
      { k: 2, instruction: "add", box: [[0.5, 0.5], [0.7, 0.7]], text_len: 12, status: "mask_empty" },
      { k: 3, instruction: "light", box: [[0.8, 0.1], [0.95, 0.3]], text_len: 0, status: "ok" },
    ],
  },
};

const review = (raw: unknown = LOCAL_REVIEW): JobReviewDetail => api.normalizeReview(raw, "j1");

/** Boks 1 fra (0,1, 0,2) til (0,4, 0,5). */
const ONE_BOX = addBox(STUDIO_START, { x: 0.4, y: 0.5 }, { x: 0.1, y: 0.2 });
const id1 = ONE_BOX.marks[0].id;
/** To bokser langt fra hverandre. */
const TWO = addBox(ONE_BOX, { x: 0.6, y: 0.6 }, { x: 0.9, y: 0.9 });
const id2 = TWO.marks[1].id;
const ASPECT = 3 / 2;

// --- Review-svaret --------------------------------------------------------------

test("Studio v2: review-svaret leses strengt: edits med k 1–4, boksen, status og retry_of", () => {
  const r = review();
  assert.equal(r.correction.localAccepted, true);
  assert.deepEqual(r.allowedActions, ["approve", "reject", "correct"]);
  assert.deepEqual(r.local, {
    round: 1,
    retryOf: null,
    edits: [
      { k: 1, instruction: "remove", box: { from: { x: 0.1, y: 0.2 }, to: { x: 0.3, y: 0.4 } }, textLen: 0, status: "ok" },
      { k: 2, instruction: "add", box: { from: { x: 0.5, y: 0.5 }, to: { x: 0.7, y: 0.7 } }, textLen: 12, status: "mask_empty" },
      { k: 3, instruction: "light", box: { from: { x: 0.8, y: 0.1 }, to: { x: 0.95, y: 0.3 } }, textLen: 0, status: "ok" },
    ],
  });
  // Feil form: k utenfor 1–4 og dubletter forkastes, sortert etter k; ukjent instruks og boks blir null;
  // uten status aldri «ok». Boksen i formen fra forespoerselen godtas, og hjoernene sorteres.
  const odd = review({
    ...LOCAL_REVIEW,
    local: {
      round: 2,
      retry_of: 3,
      edits: [
        { k: 4, instruction: "paint", box: [[0.1, 0.1], [1.2, 0.2]], status: "ok" },
        { k: 2, instruction: "light", box: { shape: "box", points: [[0.6, 0.6], [0.5, 0.5]] } },
        { k: 2, instruction: "remove", status: "ok" },
        { k: 5, status: "ok" },
        { k: "1", status: "ok" },
        null,
      ],
    },
  });
  assert.deepEqual(odd.local, {
    round: 2,
    retryOf: 3,
    edits: [
      { k: 2, instruction: "light", box: { from: { x: 0.5, y: 0.5 }, to: { x: 0.6, y: 0.6 } }, textLen: null, status: "unknown" },
      { k: 4, instruction: null, box: null, textLen: null, status: "ok" },
    ],
  });
  // Uten endringer, uten feltet (flagget av), null, og en gammel FE-3-runde med kandidater: ingen lokal runde.
  for (const value of [null, undefined, "x", { edits: [] }, { candidates: [{ k: 1, preview_url: "u" }], chosen: 1 }]) {
    assert.equal(review({ ...LOCAL_REVIEW, local: value }).local, null, JSON.stringify(value));
  }
  // `choose` er ute av handlingene (backend tar den ut av allowed_actions for lr2).
  assert.deepEqual(review({ ...LOCAL_REVIEW, allowed_actions: ["approve", "choose"] }).allowedActions, ["approve"]);
  // Uten LOCAL_EDIT mangler local_accepted: av.
  assert.equal(local.localShown(review({ ...LOCAL_REVIEW, correction: { rounds_left: 2 } })), false);
  assert.equal(local.localShown(review()), true);
});

// --- Boksene ------------------------------------------------------------------------

test("Studio v2: inntil 4 bokser, nummerert 1–4 i rekkefoelgen de ble tegnet; en femte avvises", () => {
  let s = STUDIO_START;
  const corners: [number, number][] = [[0.0, 0.0], [0.5, 0.0], [0.0, 0.5], [0.5, 0.5]];
  for (const [x, y] of corners) {
    const r = local.addLocalBox(s, { x: x + 0.05, y: y + 0.05 }, { x: x + 0.4, y: y + 0.4 }, ASPECT);
    assert.equal(r.rejected, null);
    s = r.studio;
  }
  assert.equal(local.localBoxes(s).length, 4);
  assert.deepEqual(local.localBoxes(s).map((b) => local.boxNumber(s, b.id)), [1, 2, 3, 4]);
  const fifth = local.addLocalBox(s, { x: 0.46, y: 0.46 }, { x: 0.47, y: 0.47 }, ASPECT);
  assert.deepEqual(fifth, { studio: s, rejected: "max" });
  assert.equal(local.MAX_LOCAL_EDITS, 4);
  // Fjernes boks 2, blir boks 3 nummer 2. Angre gir den tilbake med samme nummer.
  const second = local.localBoxes(s)[1].id;
  const third = local.localBoxes(s)[2].id;
  const removed = removeMark(s, second);
  assert.equal(local.boxNumber(removed, third), 2);
  assert.equal(local.boxNumber(removed, second), 0);
  assert.equal(local.boxNumber(undo(removed), second), 2);
  // Et klikk uten aa dra lager ingen boks og ingen melding.
  assert.deepEqual(local.addLocalBox(ONE_BOX, { x: 0.8, y: 0.8 }, { x: 0.8, y: 0.8 }, ASPECT), {
    studio: ONE_BOX,
    rejected: null,
  });
});

test("Studio v2: overlappende bokser avvises med forklaring; margen er 3 % av kortsiden, 10 % for Tenn", () => {
  // Rett inni og over kanten: avvist.
  assert.equal(local.addLocalBox(ONE_BOX, { x: 0.2, y: 0.3 }, { x: 0.6, y: 0.6 }, ASPECT).rejected, "overlap");
  // 1 % av bredden fra kanten: innenfor 3 % av kortsiden (= 2 % av bredden ved 3:2). Avvist.
  assert.equal(local.addLocalBox(ONE_BOX, { x: 0.41, y: 0.2 }, { x: 0.6, y: 0.5 }, ASPECT).rejected, "overlap");
  // 5 % av bredden fra kanten (begge marger er 2 %, til sammen 4 %): godtatt.
  assert.equal(local.addLocalBox(ONE_BOX, { x: 0.45, y: 0.2 }, { x: 0.6, y: 0.5 }, ASPECT).rejected, null);
  // 5 % av bredden mellom boksene: liggende 3:2 gir 2 % margin i x per boks (4 % < 5 %), mens
  // kvadratisk og staaende (kortsiden er bredden) gir 3 % per boks (6 % > 5 %).
  const left = { from: { x: 0.1, y: 0.1 }, to: { x: 0.3, y: 0.3 } };
  const right = { from: { x: 0.35, y: 0.1 }, to: { x: 0.5, y: 0.3 } };
  assert.equal(local.boxesOverlap(left, right, 0.03, 0.03, 3 / 2), false);
  assert.equal(local.boxesOverlap(left, right, 0.03, 0.03, 1), true);
  assert.equal(local.boxesOverlap(left, right, 0.03, 0.03, 2 / 3), true);
  // Staaende: margen i y er 3 % av bredden = 2 % av hoeyden. 5 % mellom i y: ikke overlapp.
  const top = { from: { x: 0.1, y: 0.1 }, to: { x: 0.3, y: 0.3 } };
  const below = { from: { x: 0.1, y: 0.35 }, to: { x: 0.3, y: 0.5 } };
  assert.equal(local.boxesOverlap(top, below, 0.03, 0.03, 2 / 3), false);
  // Kanter som bare beroerer hverandre (uten margin): ikke overlapp.
  assert.equal(local.boxesOverlap(left, { from: { x: 0.3, y: 0.1 }, to: { x: 0.4, y: 0.3 } }, 0, 0, 1), false);
  // Tenn har 10 %: to bokser som er greie med Fjern, ligger for tett naar den ene er Tenn.
  const near = local.addLocalBox(ONE_BOX, { x: 0.45, y: 0.2 }, { x: 0.6, y: 0.5 }, ASPECT).studio;
  const b2 = near.marks[1].id;
  const drafts = (i1: "remove" | "light") => ({
    [id1]: { instruction: i1, text: "" },
    [b2]: { instruction: "remove" as const, text: "" },
  });
  assert.deepEqual(local.localMissing({ studio: near, drafts: drafts("remove"), aspect: ASPECT }), null);
  assert.deepEqual(local.localMissing({ studio: near, drafts: drafts("light"), aspect: ASPECT }), { kind: "overlap", a: 1, b: 2 });
  assert.equal(local.buildLocalCorrection({ version: 1 }, near, drafts("light"), ASPECT), null);
  // Forklaringene staar i ordlista.
  assert.equal(t("nb", local.BOX_REJECTION_KEYS.overlap), "Boksene kan ikke overlappe. Dra den nye boksen et annet sted.");
  assert.equal(t("nb", local.BOX_REJECTION_KEYS.max), "Du kan markere opptil 4 ting. Fjern en boks for å lage en ny.");
  const m = local.missingText({ kind: "overlap", a: 1, b: 2 });
  assert.equal(t("nb", m.key, m.vars), "Boks 1 og 2 ligger for tett. Flytt eller fjern en av dem.");
});

// --- Utfør endringene ---------------------------------------------------------------

test("Studio v2: «Utfør endringene» sender correct med edits i rekkefoelgen 1–N og expected_version; 202 gir poll", async () => {
  const drafts = {
    [id1]: { instruction: "remove" as const, text: "ignoreres" },
    [id2]: { instruction: "add" as const, text: "  en  grønn\n plante " },
  };
  const body = local.buildLocalCorrection(review(), TWO, drafts, ASPECT);
  assert.deepEqual(body, {
    action: "correct",
    local: {
      edits: [
        { shape: { shape: "box", points: [[0.1, 0.2], [0.4, 0.5]] }, instruction: "remove" },
        { shape: { shape: "box", points: [[0.6, 0.6], [0.9, 0.9]] }, instruction: "add", text: "en grønn plante" },
      ],
    },
    expected_version: 7,
  });
  const calls = captureFetch(202, { job_id: "j1", status: "running", round: 2, status_url: "/v1/jobs/j1" });
  const out = await api.postDecision({ jobId: "j1", decision: body!, getToken });
  assert.equal(calls[0].url, "http://api.test/v1/jobs/j1/decision");
  // Body er byte for byte det backend venter: aldri overrides, choices eller fireplace_fire (local_exclusive).
  assert.equal(
    calls[0].init?.body,
    '{"action":"correct","local":{"edits":[{"shape":{"shape":"box","points":[[0.1,0.2],[0.4,0.5]]},"instruction":"remove"},' +
      '{"shape":{"shape":"box","points":[[0.6,0.6],[0.9,0.9]]},"instruction":"add","text":"en grønn plante"}]},"expected_version":7}'
  );
  assert.deepEqual(out, { kind: "poll", status: "running" });
  assert.deepEqual(local.localResult(out), { kind: "poll" });
  // Uten version: utelatt.
  assert.equal("expected_version" in (local.buildLocalCorrection({ version: null }, TWO, drafts, ASPECT) ?? {}), false);
  // Knappen og linja.
  assert.equal(t("nb", "local.submit", { n: 2 }), "Utfør endringene (2)");
  const info = local.localInfo(review());
  assert.equal(t("nb", info.key, info.vars), "Runder igjen: 2 av 3 · bare de markerte områdene endres");
  const noMax = local.localInfo(review({ correction: { rounds_left: 1 } }));
  assert.equal(t("nb", noMax.key, noMax.vars), "Runder igjen: 1 · bare de markerte områdene endres");
  assert.equal(
    t("nb", "local.hint"),
    "Dra en boks rundt det som skal endres, og velg hva som skal skje. Du kan markere opptil 4 ting."
  );
});

test("Studio v2: knappen er laast til hver boks har instruks, og Legg til har tekst (1–200 tegn)", () => {
  const m = (drafts: Record<number, { instruction: "add" | "light" | null; text: string }>, studio = TWO) =>
    local.localMissing({ studio, drafts, aspect: ASPECT });
  const light = { instruction: "light" as const, text: "" };
  assert.deepEqual(m({}, STUDIO_START), { kind: "box" });
  assert.deepEqual(m({}), { kind: "instruction", n: 1 });
  assert.deepEqual(m({ [id1]: light }), { kind: "instruction", n: 2 });
  assert.deepEqual(m({ [id1]: light, [id2]: light }), null);
  assert.deepEqual(m({ [id1]: light, [id2]: { instruction: "add", text: "  \n " } }), { kind: "text", n: 2 });
  assert.deepEqual(m({ [id1]: light, [id2]: { instruction: "add", text: "x".repeat(200) } }), null);
  assert.deepEqual(m({ [id1]: light, [id2]: { instruction: "add", text: "x".repeat(201) } }), { kind: "textTooLong", n: 2 });
  // Mellomrom som renses bort, teller ikke.
  assert.deepEqual(m({ [id1]: light, [id2]: { instruction: "add", text: ` ${"x".repeat(200)} ` } }), null);
  assert.equal(local.buildLocalCorrection({ version: 1 }, TWO, { [id1]: light }, ASPECT), null);
  assert.equal(local.buildLocalCorrection({ version: 1 }, STUDIO_START, {}, ASPECT), null);
  // Uten tekst for de andre instruksene, og bare local i body.
  for (const instruction of ["fire_out", "light", "remove"] as const) {
    const body = local.buildLocalCorrection({ version: 1 }, ONE_BOX, { [id1]: { instruction, text: "tekst" } }, ASPECT);
    assert.deepEqual(body, {
      action: "correct",
      local: { edits: [{ shape: { shape: "box", points: [[0.1, 0.2], [0.4, 0.5]] }, instruction }] },
      expected_version: 1,
    });
  }
  const txt = local.missingText({ kind: "text", n: 2 });
  assert.equal(t("nb", txt.key, txt.vars), "Skriv hva som skal legges til i boks 2.");
  assert.deepEqual(local.LOCAL_INSTRUCTIONS.map((i) => t("nb", local.LOCAL_INSTRUCTION_KEYS[i])), [
    "Slukk",
    "Tenn",
    "Fjern dette",
    "Legg til",
  ]);
});

// --- Etter runden ---------------------------------------------------------------------

test("Studio v2: lista etter runden: ✓ eller koden per endring, og «Prøv igjen» bare naar det gaar", () => {
  assert.deepEqual(local.editResults(review()), [
    { k: 1, instruction: "remove", ok: true, code: null, canRetry: true },
    { k: 2, instruction: "add", ok: false, code: "mask_empty", canRetry: true },
    { k: 3, instruction: "light", ok: true, code: null, canRetry: true },
  ]);
  // Ingen runder igjen, eller uten correct (admin paa andres jobb): ingen «Prøv igjen».
  for (const r of [
    review({ ...LOCAL_REVIEW, correction: { ...LOCAL_REVIEW.correction, rounds_left: 0 } }),
    review({ ...LOCAL_REVIEW, allowed_actions: ["approve"] }),
  ]) {
    assert.ok(local.editResults(r)!.every((row) => !row.canRetry));
  }
  // Legg til uten tekst (slettet, AVVIK 7): kan ikke proeves igjen.
  const cleared = review({
    ...LOCAL_REVIEW,
    local: { round: 1, edits: [{ k: 1, instruction: "add", box: null, text_len: 0, status: "ok" }] },
  });
  assert.equal(local.editResults(cleared)![0].canRetry, false);
  // Uten lokal runde, eller naar jobben ikke venter: ingen liste.
  assert.equal(local.editResults(review({ ...LOCAL_REVIEW, local: null })), null);
  assert.equal(local.editResults(review({ ...LOCAL_REVIEW, status: "succeeded" })), null);
  // Feilmeldingene per endring er norske, og ukjente koder faar gruppens tekst.
  assert.equal(codeText("nb", "localEditError", "mask_empty"), "Fant ingen gjenstand i boksen. Dra boksen tettere rundt den.");
  assert.equal(codeText("nb", "localEditError", "noe_nytt"), "Endringen ble ikke gjort.");
  assert.equal(t("nb", "local.retry"), "Prøv igjen");
});

test("Studio v2: «Prøv igjen» sender correct med local.retry og expected_version; 202 gir poll", async () => {
  const body = local.buildRetry(review(), 2);
  assert.deepEqual(body, { action: "correct", local: { retry: 2 }, expected_version: 7 });
  const calls = captureFetch(202, { job_id: "j1", status: "running" });
  const out = await api.postDecision({ jobId: "j1", decision: body, getToken });
  assert.equal(calls[0].init?.body, '{"action":"correct","local":{"retry":2},"expected_version":7}');
  assert.deepEqual(local.localResult(out), { kind: "poll" });
  assert.deepEqual(local.buildRetry({ version: null }, 4), { action: "correct", local: { retry: 4 } });
});

test("Studio v2: sammenligningen er forrige versjon mot ny (D1), med boksene; uten forrige versjon som foer", () => {
  assert.deepEqual(local.localCompare(review()), {
    previousUrl: "https://x/p1.jpg",
    boxes: [
      { k: 1, ok: true, from: { x: 0.1, y: 0.2 }, to: { x: 0.3, y: 0.4 } },
      { k: 2, ok: false, from: { x: 0.5, y: 0.5 }, to: { x: 0.7, y: 0.7 } },
      { k: 3, ok: true, from: { x: 0.8, y: 0.1 }, to: { x: 0.95, y: 0.3 } },
    ],
  });
  // Uten forrige versjon (null eller uten preview_url), uten lokal runde, eller etter godkjenning: null.
  assert.equal(local.localCompare(review({ ...LOCAL_REVIEW, images: { preview_url: "p" } })), null);
  assert.equal(local.localCompare(review({ ...LOCAL_REVIEW, images: { previous: { round: 0 } } })), null);
  assert.equal(local.localCompare(review({ ...LOCAL_REVIEW, local: null })), null);
  assert.equal(local.localCompare(review({ ...LOCAL_REVIEW, status: "succeeded" })), null);
  assert.equal(t("nb", "local.vsPrevious"), "Mot forrige versjon");
  assert.equal(t("nb", "local.vsOriginal"), "Mot original");
});

// --- Feilkodene --------------------------------------------------------------------

test("Studio v2: alle kodene fra kontrakten har norsk tekst, og samme koder paa engelsk", () => {
  const nb = DICTIONARIES.nb.codes;
  const before = ["edits_count", "edits_overlap", "retry_invalid", "local_invalid", "text_cleared", "retry_source_missing"];
  for (const code of before) assert.ok(Object.hasOwn(nb.localError, code), code);
  const perEdit = ["mask_empty", "sam_failed", "effect_too_large", "align_inliers", "align_scale", "align_residual", "model_failed", "edits_overlap"];
  for (const code of perEdit) assert.ok(Object.hasOwn(nb.localEditError, code), code);
  for (const group of ["localError", "localRoundError", "localEditError", "disclosureLocal"] as const) {
    assert.deepEqual(Object.keys(DICTIONARIES.en.codes[group]), Object.keys(nb[group]), group);
  }
  // Tabellene i local.ts og ordlista er de samme kodene.
  assert.deepEqual([...local.LOCAL_ERROR_TEXT_CODES].sort(), Object.keys(nb.localError).sort());
  assert.deepEqual([...local.LOCAL_ROUND_ERRORS].sort(), Object.keys(nb.localRoundError).sort());
  assert.deepEqual([...local.LOCAL_EDIT_ERRORS].sort(), Object.keys(nb.localEditError).sort());
  // Kandidatene og choose er borte.
  for (const code of ["candidate_invalid", "candidate_already_chosen", "candidate_missing", "choose_failed"]) {
    assert.ok(!Object.hasOwn(nb.localError, code), code);
  }
  assert.ok(!api.LOCAL_ERROR_CODES.has("candidate_invalid"));
});

test("Studio v2: 400 for boksene og teksten, og 409 ved «Prøv igjen», gir retry; retry_invalid henter paa nytt", async () => {
  for (const code of ["shape_invalid", "text_required", "text_too_long", "edits_count", "edits_overlap"]) {
    captureFetch(400, { detail: { code, field: "local.edits[1]" } });
    const out = await api.postDecision({ jobId: "j1", decision: { action: "correct" }, getToken });
    assert.deepEqual(out, { kind: "blocked", code, fields: ["local.edits[1]"], overrideCode: null }, code);
    assert.deepEqual(local.localResult(out), { kind: "retry", message: { group: "localError", code } }, code);
  }
  for (const code of ["text_cleared", "retry_source_missing"]) {
    captureFetch(409, { detail: { code } });
    const out = await api.postDecision({ jobId: "j1", decision: { action: "correct" }, getToken });
    assert.deepEqual(local.localResult(out), { kind: "retry", message: { group: "localError", code } }, code);
  }
  captureFetch(400, { detail: { code: "retry_invalid", field: "local" } });
  const stale = await api.postDecision({ jobId: "j1", decision: { action: "correct" }, getToken });
  assert.deepEqual(local.localResult(stale), { kind: "reload", message: { group: "localError", code: "retry_invalid" } });
  // local_invalid, local_not_accepted og local_exclusive: siden laases med melding.
  for (const code of ["local_invalid", "local_not_accepted", "local_exclusive"]) {
    captureFetch(400, { detail: { code, field: "local" } });
    const out = await api.postDecision({ jobId: "j1", decision: { action: "correct" }, getToken });
    assert.deepEqual(local.localResult(out), { kind: "blocked", message: { group: "localError", code } }, code);
  }
  // Ukjente 400-koder er fortsatt «error» (generisk).
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

test("Studio v2: runden som feilet helt: teksten for last_round_error, ellers samme melding som i dag", () => {
  const msg = (code: unknown) =>
    local.roundFailedMessage(review({ correction: { last_round_failed: true, last_round_error: code } }));
  // Backend gir den felles koden naar alle endringene feilet likt, ellers no_edit (local_round.run_edits).
  for (const code of [
    "effect_too_large", "mask_empty", "no_candidate", "model_failed", "align_inliers", "align_scale",
    "align_residual", "edits_overlap", "no_edit", "sam_failed", "effect_outside_crop", "answer_invalid",
  ]) {
    assert.deepEqual(msg(code), { group: "localRoundError", code });
    // Alle sier at runden ikke er brukt (mask_empty fra FE-3 uten «forrige bilde»).
    assert.match(codeText("nb", "localRoundError", code), /[Rr]unden er ikke brukt\./, code);
  }
  assert.equal(
    codeText("nb", "localRoundError", "no_edit"),
    "Ingen av endringene kunne gjøres. Du har fortsatt forrige bilde, og runden er ikke brukt."
  );
  // Ukjent kode, «unknown» fra backend, eller uten feltet: som i dag.
  for (const code of ["timeout", "unknown", null, undefined]) assert.deepEqual(msg(code), { key: "correct.roundFailed" });
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

test("Studio v2: siden: lerretet med nummererte bokser, lista, én knapp, og ingen kandidater", () => {
  const page = read("(app)/godkjenning/[jobId]/page.tsx");
  assert.match(page, /const localAvailable = localShown\(review\) && review\.images\.previewUrl !== null;/);
  assert.match(page, /const isLocal = isEditing && localMode && localAvailable;/);
  assert.match(page, /\{isLocal \? \(\s*<LocalEditPanel[\s\S]*?onSubmit=\{submitLocal\}[\s\S]*?\) : \(\s*<CorrectionPanel/);
  // Begge sendes som «Lag nytt bilde»: pending "correct", poll, og localResult.
  const send = page.slice(page.indexOf("const sendLocal"), page.indexOf("const submitLocal"));
  assert.match(send, /setPending\("correct"\);/);
  assert.match(send, /handle: \(out\) => handleCorrection\(localResult\(out\)\)/);
  assert.match(page, /buildLocalCorrection\(load\.review, localStudio, localDrafts, localAspect\)/);
  assert.match(page, /sendLocal\(buildRetry\(load\.review, k\)\)/);
  // Ny boks gaar gjennom addLocalBox, og avvisningen vises i panelet.
  assert.match(page, /addLocalBox\(localStudio, a, b, localAspect\)/);
  assert.match(page, /rejected=\{localRejected\}/);
  // Lista etter runden, og ingen kandidater eller choose.
  assert.match(page, /\{results !== null && !isEditing && making === null && \(\s*<section className=\{CARD\}>\s*<LocalEditResults/);
  assert.doesNotMatch(page, /LocalCandidates|chooseCandidate|buildChoose|"choose"/);
  assert.ok(!existsSync(join(APP_DIR, "components/godkjenning/LocalCandidates.tsx")));
  // Glideren: forrige versjon som standard, «Mot original» som valg, boksene av/på.
  assert.match(page, /useState<"previous" \| "original">\("previous"\)/);
  assert.match(page, /const \[boxesShown, setBoxesShown\] = useState\(true\);/);
  assert.match(page, /compareOn && compareBase === "previous"/);
  assert.match(page, /compareOn && boxesShown \? \(\s*<LocalEditBoxes/);
  // Bare for gjeldende versjon (ikke en eldre versjon eller originalen i stripa).
  assert.match(page, /const compare = !approveLock && !originalShown \? localCompare\(review\) : null;/);
  // Feilteksten for runden.
  assert.match(page, /const failedMessage = roundFailedMessage\(review\);/);
  // Ingen tjenestenavn: valget styres bare av review-svaret.
  assert.doesNotMatch(read("lib/local.ts"), /skumring|preset|klart_vaer/);
});

test("Studio v2: panelet og lista: samme nummer som i bildet, hover begge veier, store trykkflater", () => {
  const panel = read("components/godkjenning/LocalEditPanel.tsx");
  assert.match(panel, /boxes\.map\(\(box, i\) => \(\s*<EditRow[\s\S]*?n=\{i \+ 1\}/);
  assert.match(panel, /LOCAL_INSTRUCTIONS\.map\(/);
  assert.match(panel, /\{draft\.instruction === "add" && \(/);
  assert.match(panel, /maxLength=\{LOCAL_TEXT_MAX\}/);
  assert.match(panel, /onPointerEnter=\{\(e\) => e\.pointerType === "mouse" && onActive\(id\)\}/);
  assert.match(panel, /onFocus=\{\(\) => onActive\(id\)\}/);
  assert.match(panel, /t\(locale, "local\.submit", \{ n: boxes\.length \}\)/);
  assert.match(panel, /disabled=\{locked \|\| missing !== null\}/);
  // Veiledningen bare foer foerste boks.
  assert.match(panel, /\{boxes\.length === 0 && <p[^>]*>\{t\(locale, "local\.hint"\)\}<\/p>\}/);
  // Trykkflatene er minst 44 px (min-h-11), og hovedknappen er full bredde paa mobil.
  assert.match(panel, /buttonClass\("primary", "min-h-12 w-full sm:w-auto"\)/);
  assert.match(panel, /buttonClass\("secondary", "min-h-11"\)/);
  // Lerretet: nummer paa boksene og boksen under musa.
  const canvas = read("components/studio/StudioCanvas.tsx");
  assert.match(canvas, /const boxLabels = numbered/);
  assert.match(canvas, /m\.id === activeId/);
  assert.match(canvas, /onBox !== undefined\) \{\s*onBox\(d\.from, d\.to\);/);
  const results = read("components/godkjenning/LocalEditResults.tsx");
  assert.match(results, /row\.canRetry && \(/);
  assert.match(results, /onClick=\{\(\) => onRetry\(row\.k\)\}/);
  assert.match(results, /codeText\(locale, "localEditError", row\.code\)/);
  // Boksene i glideren tar ikke imot pekeren.
  assert.match(read("components/godkjenning/LocalEditBoxes.tsx"), /aria-hidden="true" className="pointer-events-none absolute inset-0"/);
  // Glideren: forrige versjon til venstre, men «Hold for original» viser originalen.
  const viewer = read("components/godkjenning/CompareViewer.tsx");
  assert.match(viewer, /base === null \|\| full\s*\? \{ url: originalUrl/);
});
