import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { withoutComments } from "./testing/jsxText.ts";
import type { JobReviewDetail } from "./api.ts";

// «Som i originalen» (Dag 58, ORIGINAL_BYGG). Kontrakten er backend 5cb3c1f
// (RAPPORT_ORIGINAL_BE, Petter 28.10: C1, A1, B1): en endring er
// `{shape: box, mode: "original"}` uten tekst, instruksen i review er
// "original", «Prøv igjen» gir 400 retry_invalid (A1), og de nye kodene er
// `original_ring_empty` (og `original_missing`/`original_invalid` i runden).
// Kontrollen av tillegg er fra basen etter en lokal runde (backend C2).
// Falske svar: fetch byttes ut, ingen nettverkskall og ingen betalte kall.
process.env.NEXT_PUBLIC_API_BASE = "http://api.test";
const api = await import("./api.ts");
const { DICTIONARIES, codeText, t } = await import("./i18n/index.ts");
const local = await import("./local.ts");
const { addBox, STUDIO_START } = await import("./studio.ts");

const APP_DIR = fileURLToPath(new URL("..", import.meta.url));
const read = (rel: string) => withoutComments(readFileSync(join(APP_DIR, rel), "utf8"));

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});
const getToken = async () => "tok";

const ASPECT = 3 / 2;
const ONE = addBox(STUDIO_START, { x: 0.1, y: 0.2 }, { x: 0.4, y: 0.5 });
const TWO = addBox(ONE, { x: 0.6, y: 0.6 }, { x: 0.9, y: 0.9 });
const [id1, id2] = local.localBoxes(TWO).map((b) => b.id);

const WARNING = {
  status: "found",
  level: "warning",
  items: [{ kind: "warning", type: "new_window", box: [100, 200, 300, 400], confidence: "high", location: "left wall" }],
};
const NONE = { status: "ok", level: "none", items: [] };

/** Review etter en lokal runde (runde 1) paa runde 0, med én «Som i originalen» og én fritekst. */
function rawReview(extra: Record<string, unknown> = {}) {
  return {
    job_id: "j1",
    status: "awaiting_approval",
    version: 7,
    allowed_actions: ["approve", "reject", "correct"],
    correction: { rounds_used: 1, rounds_left: 2, max_rounds: 3, last_round_failed: false, local_accepted: true },
    images: {
      preview_url: "https://x/p2.jpg",
      original_url: "https://x/o.jpg",
      previous: { round: 0, preview_url: "https://x/p1.jpg" },
      rounds: [
        { round: 0, current: false, preview_url: "https://x/p1.jpg", additions_check: WARNING },
        { round: 1, current: true, preview_url: "https://x/p2.jpg", additions_check: WARNING },
      ],
    } as Record<string, unknown>,
    additions_check: WARNING,
    local: {
      round: 1,
      retry_of: null,
      edits: [
        { k: 1, instruction: "original", box: [[0.1, 0.2], [0.4, 0.5]], text_len: null, text: null, status: "ok" },
        { k: 2, instruction: "text", box: [[0.6, 0.6], [0.9, 0.9]], text_len: 12, text: "slukk peisen", status: "ok" },
      ],
    },
    ...extra,
  };
}

const review = (raw: unknown = rawReview()): JobReviewDetail => api.normalizeReview(raw, "j1");

test("Som i originalen: body er {shape, mode: \"original\"} uten tekst, og kan blandes med fritekst", async () => {
  const drafts = {
    [id1]: { text: "teksten staar", mode: "original" as const },
    [id2]: { text: "slukk peisen" },
  };
  const body = local.buildLocalCorrection(review(), TWO, drafts, ASPECT);
  assert.deepEqual(body, {
    action: "correct",
    local: {
      edits: [
        { shape: { shape: "box", points: [[0.1, 0.2], [0.4, 0.5]] }, mode: "original" },
        { shape: { shape: "box", points: [[0.6, 0.6], [0.9, 0.9]] }, text: "slukk peisen" },
      ],
    },
    expected_version: 7,
  });
  const calls = captureFetch(202, { job_id: "j1", status: "running" });
  await api.postDecision({ jobId: "j1", decision: body!, getToken });
  // Byte for byte: ingen tekst og ingen instruks paa «Som i originalen» (backend: text_not_accepted).
  assert.equal(
    calls[0].init?.body,
    '{"action":"correct","local":{"edits":[{"shape":{"shape":"box","points":[[0.1,0.2],[0.4,0.5]]},"mode":"original"},' +
      '{"shape":{"shape":"box","points":[[0.6,0.6],[0.9,0.9]]},"text":"slukk peisen"}]},"expected_version":7}'
  );
  assert.doesNotMatch(String(calls[0].init?.body), /instruction/);
  // Bare «Som i originalen» i alle boksene gaar ogsaa.
  const all = local.buildLocalCorrection(review(), ONE, { [id1]: { text: "", mode: "original" } }, ASPECT);
  assert.deepEqual(all?.local, { edits: [{ shape: { shape: "box", points: [[0.1, 0.2], [0.4, 0.5]] }, mode: "original" }] });
});

test("Som i originalen: trenger ingen tekst; tas valget av, gjelder teksten igjen", () => {
  assert.equal(local.draftMissing({ text: "", mode: "original" }), null);
  assert.equal(local.draftMissing({ text: "", mode: "text" }), "text");
  assert.equal(local.draftMissing({ text: "" }), "text");
  const drafts = { [id1]: { text: "", mode: "original" as const }, [id2]: { text: "" } };
  assert.deepEqual(local.localMissing({ studio: TWO, drafts, aspect: ASPECT }), { kind: "text", n: 2 });
  const off = { [id1]: { text: "", mode: "text" as const }, [id2]: { text: "x" } };
  assert.deepEqual(local.localMissing({ studio: TWO, drafts: off, aspect: ASPECT }), { kind: "text", n: 1 });
});

test("Som i originalen: lista etter runden: «Som i originalen», ingen «Prøv igjen» (A1), egne feiltekster", () => {
  const r = review();
  assert.equal(r.local?.edits[0].instruction, "original");
  const rows = local.editResults(r)!;
  assert.equal(rows[0].canRetry, false);
  assert.equal(rows[1].canRetry, true);
  const head = local.resultLabel(rows[0]);
  assert.equal(head.text, null);
  assert.equal(t("nb", head.key, head.vars), "Som i originalen");
  assert.equal(t("en", head.key, head.vars), "As in the original");
  // Feilet: egen tekst uten «Prøv igjen» for koden fra justeringen og den tomme ringen.
  const failed = review(
    rawReview({
      local: {
        round: 1,
        retry_of: null,
        edits: [
          { k: 1, instruction: "original", box: [[0.1, 0.2], [0.4, 0.5]], text_len: null, text: null, status: "align_inliers" },
          { k: 2, instruction: "text", box: [[0.6, 0.6], [0.9, 0.9]], text_len: 3, text: "abc", status: "align_inliers" },
          { k: 3, instruction: "original", box: [[0.1, 0.7], [0.2, 0.8]], text_len: null, text: null, status: "original_ring_empty" },
        ],
      },
    })
  );
  const [o, f, ring] = local.editResults(failed)!;
  assert.equal(o.canRetry, false);
  assert.equal(local.editErrorGroup(o), "localOriginalError");
  assert.equal(local.editErrorGroup(f), "localEditError");
  assert.equal(
    codeText("nb", local.editErrorGroup(o), o.code),
    "Originalen kunne ikke passes inn i bildet her. Beskriv endringen med tekst i stedet."
  );
  assert.doesNotMatch(codeText("nb", local.editErrorGroup(o), o.code), /Prøv igjen/);
  assert.equal(codeText("nb", local.editErrorGroup(f), f.code), "Endringen passet ikke inn i bildet. Prøv igjen.");
  assert.equal(
    codeText("nb", local.editErrorGroup(ring), ring.code),
    "Området rundt boksen er for lite til å tilpasse originalen. Dra en mindre boks, eller beskriv endringen med tekst."
  );
  // Ukjent kode: den generiske teksten for gruppen.
  assert.equal(
    codeText("nb", local.editErrorGroup({ instruction: "original", code: "ny_kode" }), "ny_kode"),
    "Endringen ble ikke gjort."
  );
});

test("Som i originalen: kodene har tekst i alle gruppene, og samme koder paa engelsk", () => {
  const nb = DICTIONARIES.nb.codes;
  assert.deepEqual([...local.LOCAL_ORIGINAL_ERRORS].sort(), Object.keys(nb.localOriginalError).sort());
  for (const group of ["localOriginalError", "localRoundError", "localEditError"] as const) {
    assert.deepEqual(Object.keys(DICTIONARIES.en.codes[group]), Object.keys(nb[group]), group);
  }
  for (const code of ["original_missing", "original_invalid", "original_ring_empty"]) {
    assert.ok(local.LOCAL_ROUND_ERRORS.includes(code), code);
    assert.ok(local.LOCAL_EDIT_ERRORS.includes(code), code);
  }
  // Runden som feilet helt (alle endringene feilet likt): teksten for koden.
  const failed = review(rawReview({ correction: { rounds_left: 2, last_round_failed: true, last_round_error: "original_ring_empty" } }));
  const msg = local.roundFailedMessage(failed);
  assert.ok("group" in msg);
  assert.equal(
    codeText("nb", msg.group, msg.code),
    "Området rundt boksen er for lite til å tilpasse originalen. Dra en mindre boks. Du har fortsatt forrige bilde, og runden er ikke brukt."
  );
  // 409 original_missing foer claim: som foer (decisionError, knappene laases).
  assert.equal(local.localResult({ kind: "blocked", code: "original_missing", httpStatus: 409 } as never).kind, "blocked");
});

test("Som i originalen: utsnittet av originalen har boksens sideforhold og viser boksen", () => {
  // Boksen er 0,3 x 0,3 av et bilde 3:2: utsnittet er 1,5:1, hoeyst 160 x 96 px.
  const crop = local.originalCrop({ from: { x: 0.1, y: 0.2 }, to: { x: 0.4, y: 0.5 } }, ASPECT)!;
  assert.equal(crop.width, 144);
  assert.equal(crop.height, 96);
  assert.ok(Math.abs(crop.img.width - 100 / 0.3) < 1e-9);
  assert.ok(Math.abs(crop.img.height - 100 / 0.3) < 1e-9);
  assert.ok(Math.abs(crop.img.left - -100 / 3) < 1e-9);
  assert.ok(Math.abs(crop.img.top - -200 / 3) < 1e-9);
  // Bred boks: bredden er taket.
  const wide = local.originalCrop({ from: { x: 0, y: 0.4 }, to: { x: 1, y: 0.5 } }, ASPECT)!;
  assert.equal(wide.width, 160);
  assert.equal(wide.height, Math.round(160 / 15));
  // Uten flate: ingenting.
  assert.equal(local.originalCrop({ from: { x: 0.2, y: 0.2 }, to: { x: 0.2, y: 0.5 } }, ASPECT), null);
});

test("Varselet etter lokale rettinger: «Kontrollen gjelder versjon N» i stedet for varselet", () => {
  assert.equal(local.checkedVersion(review()), 1);
  assert.equal(
    t("nb", "additions.checkedVersion", { n: 1 }),
    "Kontrollen gjelder versjon 1. Sjekk selv at rettingene ser riktige ut."
  );
  // To lokale runder etter hverandre: kontrollen er fortsatt fra runde 0 (versjon 1).
  const chain = rawReview();
  chain.images = {
    ...chain.images,
    previous: { round: 1, preview_url: "https://x/p2.jpg" },
    rounds: [
      { round: 0, current: false, preview_url: "a", additions_check: WARNING },
      { round: 1, current: false, preview_url: "b", additions_check: WARNING },
      { round: 2, current: true, preview_url: "c", additions_check: WARNING },
    ],
  };
  assert.equal(local.checkedVersion(review(chain)), 1);
  // Runde 1 var en ny modellrunde med en annen kontroll: lokal runde 2 har kontrollen fra versjon 2.
  const other = { ...WARNING, items: [{ ...WARNING.items[0], location: "right wall" }] };
  const newer = rawReview();
  newer.images = {
    ...newer.images,
    previous: { round: 1, preview_url: "b" },
    rounds: [
      { round: 0, current: false, preview_url: "a", additions_check: other },
      { round: 1, current: false, preview_url: "b", additions_check: WARNING },
      { round: 2, current: true, preview_url: "c", additions_check: WARNING },
    ],
  };
  assert.equal(local.checkedVersion(review(newer)), 2);
  // Uten rounds: forrige versjon.
  const noRounds = rawReview();
  noRounds.images = { ...noRounds.images, rounds: undefined };
  assert.equal(local.checkedVersion(review(noRounds)), 1);
  // Merknad: samme linje.
  const note = { status: "found", level: "note", items: [{ kind: "note", type: "new_window", box: null, confidence: "low", location: "x" }] };
  const withNote = rawReview({ additions_check: note });
  withNote.images = {
    ...withNote.images,
    rounds: [
      { round: 0, current: false, preview_url: "a", additions_check: note },
      { round: 1, current: true, preview_url: "b", additions_check: note },
    ],
  };
  assert.equal(local.checkedVersion(review(withNote)), 1);
  // Ingen lokal runde, ingen funn, ikke kontrollert, eller ikke til godkjenning: som foer.
  assert.equal(local.checkedVersion(review(rawReview({ local: null }))), null);
  assert.equal(local.checkedVersion(review(rawReview({ additions_check: NONE }))), null);
  assert.equal(local.checkedVersion(review(rawReview({ additions_check: null }))), null);
  assert.equal(local.checkedVersion(review(rawReview({ status: "succeeded" }))), null);
});

test("Som i originalen: siden, panelet og kortet", () => {
  const panel = read("components/godkjenning/LocalEditPanel.tsx");
  // Knappen per rad, med aria-pressed, og infoknappen med egen tekst.
  assert.match(panel, /aria-pressed=\{original\}[\s\S]*?\{t\(locale, "local\.original"\)\}/);
  assert.match(panel, /aria-expanded=\{infoOpen\}\s*aria-controls=\{infoId\}\s*aria-label=\{t\(locale, "local\.originalInfoLabel"\)\}/);
  assert.match(panel, /<p id=\{infoId\} hidden=\{!infoOpen\}[^>]*>\s*\{t\(locale, "local\.originalInfoText"\)\}/);
  // I stedet for tekstfeltet: utsnittet med «Dette kommer tilbake».
  assert.match(panel, /\{original \? \(\s*<OriginalCrop/);
  assert.match(panel, /t\(locale, "local\.originalComes"\)/);
  // Uten original vises ikke valget.
  assert.match(panel, /\{originalUrl !== null && \(/);
  assert.equal(
    t("nb", "local.originalInfoText"),
    "Henter det som var i originalbildet her, også lys og ild. Bruk det når noe er lagt til som ikke skal være der."
  );
  assert.equal(t("nb", "local.originalComes"), "Dette kommer tilbake");
  const page = read("components/godkjenning/ResultReview.tsx");
  assert.match(page, /originalUrl=\{review\.images\.originalUrl\}\s*aspect=\{localAspect\}/);
  assert.match(page, /checkedVersion=\{checkedVersion\(review\)\}/);
  // Kortet: linja i stedet for varselet og merknaden, aldri begge.
  const card = read("components/godkjenning/DecisionCard.tsx");
  assert.match(card, /\{checkedVersion === null && view\.notice === "warning" && \(/);
  assert.match(card, /\{checkedVersion === null && view\.notice === "note" && \(/);
  assert.match(card, /t\(locale, "additions\.checkedVersion", \{ n: checkedVersion \}\)/);
});

function captureFetch(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  return calls;
}
