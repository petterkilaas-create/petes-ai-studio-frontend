import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { literalTextsInFile, withoutComments } from "./testing/jsxText.ts";
import type { JobReviewDetail, JobSummary } from "./api.ts";

// Tilbakemelding fra megleren (Dag 58, Petter 28.10; valg 1A, 2A, 3A og 4B).
// Kontrakten er RAPPORT_FEEDBACK_BE.md §3 og §3b: POST og GET /v1/jobs/{id}/feedback
// (GET svarer `{feedback, tags_allowed}`), og `feedback_rating` paa radene i GET /v1/jobs (1A). api.ts kaster ved import
// uten NEXT_PUBLIC_API_BASE; fetch byttes ut, ingen nettverkskall.
process.env.NEXT_PUBLIC_API_BASE = "http://api.test";
const api = await import("./api.ts");
const { DICTIONARIES, t } = await import("./i18n/index.ts");
const {
  FEEDBACK_TAGS,
  FEEDBACK_TEXT_MAX,
  TAG_KEYS,
  buildFeedback,
  changeRating,
  feedbackLength,
  feedbackMode,
  feedbackRound,
  feedbackTags,
  feedbackTooLong,
  historyRating,
  parseFeedback,
  ratingOrNull,
  toggleTag,
} = await import("./feedback.ts");

const APP_DIR = fileURLToPath(new URL("..", import.meta.url));
const raw = (rel: string) => readFileSync(join(APP_DIR, rel), "utf8");
const read = (rel: string) => withoutComments(raw(rel));

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const getToken = async () => "tok";

type Call = { url: string; init: RequestInit | undefined };
function fakeFetch(responses: { status: number; body?: unknown }[]): Call[] {
  const calls: Call[] = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const next = responses.shift() ?? { status: 500 };
    return new Response(next.body === undefined ? null : JSON.stringify(next.body), {
      status: next.status,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  return calls;
}

const KVELD = "skumring";
const STYLING = "styling_japandi";
const AARSTID = "aarstid_vinter";
const KLART = "klart_vaer";

// --- Knappene -------------------------------------------------------------------

test("Tilbakemelding: knappene per tjeneste er kodene fra kontrakten, med «Annet» sist", () => {
  assert.deepEqual(feedbackTags(KVELD), ["sky", "window_light", "lamps", "colours", "added_removed", "framing", "other"]);
  assert.deepEqual(feedbackTags(STYLING), ["furniture", "style", "fixtures_missing", "framing", "light", "other"]);
  assert.deepEqual(feedbackTags(AARSTID), ["trees_leaves", "snow", "sky", "added", "other"]);
  // Valg 2A og Petter 28.10: Blå himmel og ukjent oppskrift har bare «Annet».
  assert.deepEqual(feedbackTags(KLART), ["other"]);
  assert.deepEqual(feedbackTags("ukjent_oppskrift"), ["other"]);
  for (const tags of Object.values(FEEDBACK_TAGS)) assert.equal(tags.at(-1), "other");
});

test("Tilbakemelding: knappene har Petters tekster paa norsk og en engelsk tekst", () => {
  const nb = (preset: string) => feedbackTags(preset).map((tag) => t("nb", TAG_KEYS[tag]));
  assert.deepEqual(nb(KVELD), [
    "Himmel",
    "Lys i vinduene",
    "Lamper",
    "Farger",
    "Noe er lagt til eller fjernet",
    "Utsnitt",
    "Annet",
  ]);
  assert.deepEqual(nb(STYLING), ["Møbler", "Stil", "Faste ting er borte", "Utsnitt", "Lys", "Annet"]);
  assert.deepEqual(nb(AARSTID), ["Trær og løv", "Snø", "Himmel", "Noe er lagt til", "Annet"]);
  for (const key of Object.values(TAG_KEYS)) {
    assert.ok(DICTIONARIES.en.ui[key].length > 0, key);
    assert.notEqual(DICTIONARIES.en.ui[key], DICTIONARIES.nb.ui[key], key);
  }
});

test("Tilbakemelding: flere knapper kan velges, i knappenes rekkefoelge, og fremmede legges ikke til", () => {
  const allowed = feedbackTags(KVELD);
  let chosen = toggleTag(allowed, [], "framing");
  chosen = toggleTag(allowed, chosen, "sky");
  assert.deepEqual(chosen, ["sky", "framing"]);
  assert.deepEqual(toggleTag(allowed, chosen, "sky"), ["framing"]);
  assert.deepEqual(toggleTag(allowed, chosen, "snow"), ["sky", "framing"]);
});

// --- Teksten og body ------------------------------------------------------------

test("Tilbakemelding: teksten er høyst 500 tegn, talt som backend (tegn, ikke UTF-16), etter trim", () => {
  assert.equal(FEEDBACK_TEXT_MAX, 500);
  assert.equal(feedbackLength("  hei  "), 3);
  assert.equal(feedbackLength("😀".repeat(500)), 500);
  assert.equal(feedbackTooLong("😀".repeat(500)), false);
  assert.equal(feedbackTooLong("a".repeat(501)), true);
});

test("Tilbakemelding: body sender bare det som er valgt, og «Send» er av uten innhold eller med for lang tekst", () => {
  const allowed = feedbackTags(KVELD);
  assert.equal(buildFeedback({ rating: null, tags: [], text: "  " }, allowed, 2), null);
  assert.deepEqual(buildFeedback({ rating: 4, tags: [], text: "" }, allowed, 2), { rating: 4, round: 2 });
  assert.deepEqual(buildFeedback({ rating: 2, tags: ["framing", "sky"], text: " For mørkt " }, allowed, null), {
    rating: 2,
    tags: ["sky", "framing"],
    text: "For mørkt",
  });
  assert.equal(buildFeedback({ rating: 3, tags: [], text: "a".repeat(501) }, allowed, 1), null);
  // En knapp tjenesten ikke har, sendes aldri (backend svarer 400).
  assert.deepEqual(buildFeedback({ rating: 5, tags: ["snow"], text: "" }, allowed, null), { rating: 5 });
});

// --- Når kortet vises -----------------------------------------------------------

type ReviewPart = Pick<JobReviewDetail, "status" | "code" | "decisions" | "isOwner" | "mediaDeletedAt" | "images">;
const IMAGES: JobReviewDetail["images"] = {
  originalUrl: "https://x/o.jpg",
  previous: null,
  previewUrl: "https://x/p.jpg",
  rawPreviewUrl: null,
  rounds: [
    { round: 0, current: false, previewUrl: "https://x/0.jpg", rawPreviewUrl: null, choices: null },
    { round: 1, current: true, previewUrl: "https://x/1.jpg", rawPreviewUrl: null, choices: null },
  ],
};
const decision = (action: string) => ({ action, at: null, byRole: null, reason: null });
const review = (over: Partial<ReviewPart> = {}): ReviewPart => ({
  status: "succeeded",
  code: null,
  decisions: [decision("approve")],
  isOwner: true,
  mediaDeletedAt: null,
  images: IMAGES,
  ...over,
});

test("Tilbakemelding: kortet kommer etter «Godkjenn» og «Avvis», og eieren kan sende", () => {
  assert.equal(feedbackMode(review()), "send");
  assert.equal(feedbackMode(review({ status: "failed", decisions: [decision("reject")] })), "send");
});

test("Tilbakemelding: admin paa en annen brukers jobb leser bare (Petter 28.10)", () => {
  assert.equal(feedbackMode(review({ isOwner: false })), "read");
  assert.equal(feedbackMode(review({ isOwner: false, status: "failed", decisions: [decision("reject")] })), "read");
});

test("Tilbakemelding: ikke foer avgjoerelsen, ikke uten bilde og ikke etter slettingen", () => {
  assert.equal(feedbackMode(review({ status: "awaiting_approval", decisions: [] })), null);
  assert.equal(feedbackMode(review({ status: "needs_review", decisions: [] })), null);
  assert.equal(feedbackMode(review({ status: "running", decisions: [] })), null);
  // Feilet uten avvisning, og «Ikke laget».
  assert.equal(feedbackMode(review({ status: "failed", decisions: [] })), null);
  assert.equal(feedbackMode(review({ status: "failed", code: "not_created", decisions: [decision("reject")] })), null);
  // «Ja, avbryt» i porten: ingen bilde ble laget.
  const none = { ...IMAGES, previewUrl: null, rounds: [] };
  assert.equal(feedbackMode(review({ status: "failed", decisions: [decision("reject")], images: none })), null);
  assert.equal(feedbackMode(review({ mediaDeletedAt: "2026-10-01T00:00:00Z" })), null);
});

test("Tilbakemelding: runden er gjeldende runde, ellers null", () => {
  assert.equal(feedbackRound({ images: IMAGES }), 1);
  assert.equal(feedbackRound({ images: { ...IMAGES, rounds: null } }), null);
});

// --- GET og Historikk -----------------------------------------------------------

test("Tilbakemelding: GET tolkes forsiktig, og en tom rad er ingen tilbakemelding", () => {
  assert.equal(parseFeedback(null), null);
  assert.equal(parseFeedback({}), null);
  assert.equal(parseFeedback([]), null);
  assert.deepEqual(parseFeedback({ rating: 3, tags: ["sky", "nope", 4], text: "Fin", round: 2 }), {
    rating: 3,
    tags: ["sky"],
    text: "Fin",
    round: 2,
  });
  assert.deepEqual(parseFeedback({ rating: 9, tags: ["other"] }), { rating: null, tags: ["other"], text: "", round: null });
  assert.equal(ratingOrNull(0), null);
  assert.equal(ratingOrNull(2.5), null);
  assert.equal(ratingOrNull("4"), null);
  assert.equal(ratingOrNull(5), 5);
});

test("Tilbakemelding (3A): nye stjerner i Historikk sender knappene, teksten og runden fra forrige gang", () => {
  const allowed = feedbackTags(KVELD);
  const previous = { rating: 2 as const, tags: ["sky" as const, "snow" as const], text: " Mørkt ", round: 1 };
  assert.deepEqual(changeRating(previous, 4, allowed), { rating: 4, tags: ["sky"], text: "Mørkt", round: 1 });
  assert.deepEqual(changeRating(null, 5, allowed), { rating: 5 });
});

test("Tilbakemelding: Historikk viser stjernene som er gitt; bare eieren kan endre dem", () => {
  const job = (over: Partial<JobSummary> = {}) =>
    ({ status: "succeeded", code: null, isOwner: true, mediaDeletedAt: null, feedbackRating: 4, ...over }) as JobSummary;
  assert.deepEqual(historyRating(job()), { rating: 4, editable: true });
  assert.deepEqual(historyRating(job({ status: "failed", code: "rejected_by_reviewer" })), { rating: 4, editable: true });
  assert.deepEqual(historyRating(job({ isOwner: false })), { rating: 4, editable: false });
  assert.equal(historyRating(job({ feedbackRating: null })), null);
  assert.equal(historyRating(job({ feedbackRating: undefined })), null);
  assert.equal(historyRating(job({ status: "awaiting_approval" })), null);
  assert.equal(historyRating(job({ status: "failed", code: "not_created" })), null);
  // Tilbakemeldingen lagres i 12 maaneder, bildene kortere: stjernene staar etter slettingen.
  assert.deepEqual(historyRating(job({ mediaDeletedAt: "2026-10-01T00:00:00Z" })), { rating: 4, editable: true });
});

// --- API --------------------------------------------------------------------------

test("Tilbakemelding: postFeedback sender JSON til /feedback; 201 er lagret, 400 gir koden", async () => {
  let calls = fakeFetch([{ status: 201, body: { id: "x" } }]);
  assert.deepEqual(await api.postFeedback({ jobId: "j/1", body: { rating: 4, round: 1 }, getToken }), { kind: "ok" });
  assert.equal(calls[0].url, "http://api.test/v1/jobs/j%2F1/feedback");
  assert.equal(calls[0].init?.method, "POST");
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), { rating: 4, round: 1 });

  calls = fakeFetch([{ status: 400, body: { detail: { code: "invalid_tag" } } }]);
  assert.deepEqual(await api.postFeedback({ jobId: "j", body: { rating: 1 }, getToken }), {
    kind: "invalid",
    code: "invalid_tag",
  });
  fakeFetch([{ status: 409 }]);
  assert.deepEqual(await api.postFeedback({ jobId: "j", body: { rating: 1 }, getToken }), { kind: "error" });
});

test("Tilbakemelding: getFeedback gir siste innsending, null uten, og kaster ved feil", async () => {
  const saved = { rating: 5, tags: ["other"], text: "Bra", round: 0, created_at: "2026-10-28T12:00:00Z" };
  const calls = fakeFetch([{ status: 200, body: { feedback: saved, tags_allowed: ["other"] } }]);
  assert.deepEqual(await api.getFeedback({ jobId: "j", getToken }), { rating: 5, tags: ["other"], text: "Bra", round: 0 });
  assert.equal(calls[0].url, "http://api.test/v1/jobs/j/feedback");
  assert.equal(calls[0].init?.method, "GET");
  fakeFetch([{ status: 200, body: { feedback: null, tags_allowed: ["sky", "other"] } }]);
  assert.equal(await api.getFeedback({ jobId: "j", getToken }), null);
  // Et bart svar uten `feedback` er ingen tilbakemelding.
  fakeFetch([{ status: 200, body: saved }]);
  assert.equal(await api.getFeedback({ jobId: "j", getToken }), null);
  fakeFetch([{ status: 200, body: null }]);
  assert.equal(await api.getFeedback({ jobId: "j", getToken }), null);
  fakeFetch([{ status: 404 }]);
  assert.equal(await api.getFeedback({ jobId: "j", getToken }), null);
  fakeFetch([{ status: 500 }]);
  await assert.rejects(api.getFeedback({ jobId: "j", getToken }));
});

test("Tilbakemelding (1A): lista leser `feedback_rating`; mangler eller ugyldig gir null", async () => {
  const row = { job_id: "a", service: "scene_transform", status: "succeeded", created_at: null, error: null };
  fakeFetch([{ status: 200, body: [{ ...row, feedback_rating: 3 }, { ...row, job_id: "b" }, { ...row, job_id: "c", feedback_rating: 7 }] }]);
  const jobs = await api.listJobs({ getToken });
  assert.deepEqual(
    jobs.map((j) => j.feedbackRating),
    [3, null, null]
  );
});

// --- Tekstene og komponentene -----------------------------------------------------

test("Tilbakemelding: tekstene er Petters, og linja under kortet nevner ikke bildet", () => {
  assert.equal(t("nb", "feedback.title"), "Hvor fornøyd er du med bildet?");
  assert.equal(t("nb", "feedback.better"), "Hva kan bli bedre?");
  assert.equal(t("nb", "feedback.more"), "Fortell oss mer");
  assert.equal(t("nb", "feedback.send"), "Send");
  assert.equal(t("nb", "feedback.thanks"), "Takk! Dette hjelper oss å gjøre bildene bedre.");
  assert.equal(t("nb", "feedback.privacy"), "Tilbakemeldingen lagres i 12 måneder og brukes til å forbedre tjenesten.");
  assert.equal(t("en", "feedback.privacy"), "The feedback is stored for 12 months and is used to improve the service.");
  assert.equal(t("nb", "feedback.count", { n: 12, max: 500 }), "12 av 500 tegn");
});

test("Tilbakemelding: stjernene er knapper paa minst 44 px med navn fra ordlista", () => {
  const stars = read("components/godkjenning/StarRating.tsx");
  assert.match(stars, /min-h-11 min-w-11/);
  assert.match(stars, /aria-label=\{t\(locale, "feedback\.star", \{ n \}\)\}/);
  assert.match(stars, /aria-pressed=\{value === n\}/);
  // Knappene brytes pent paa mobil.
  assert.match(read("components/godkjenning/FeedbackCard.tsx"), /flex flex-wrap gap-2/);
});

test("Tilbakemelding: kortet er koblet inn etter avgjoerelsen, og bare eieren sender", () => {
  const page = read("(app)/godkjenning/[jobId]/page.tsx");
  assert.match(page, /const feedback = feedbackMode\(review\);/);
  assert.match(page, /readOnly=\{feedback === "read"\}/);
  const card = read("components/godkjenning/FeedbackCard.tsx");
  // Lesemodus returnerer foer «Send» finnes.
  assert.ok(card.indexOf("if (readOnly)") < card.indexOf("postFeedback({"), "lesemodus foer innsendingen");
  assert.match(card, /disabled=\{body === null \|\| busy\}/);
  const history = read("components/HistoryStars.tsx");
  assert.match(history, /view\.editable \? \(/);
  assert.match(read("components/JobCard.tsx"), /<HistoryStars job=\{job\}/);
  assert.match(read("components/OrderCard.tsx"), /<HistoryStars job=\{line\.job\}/);
});

test("Tilbakemelding: komponentene har ingen synlig tekst skrevet rett inn", () => {
  for (const rel of [
    "components/godkjenning/FeedbackCard.tsx",
    "components/godkjenning/StarRating.tsx",
    "components/HistoryStars.tsx",
  ]) {
    assert.deepEqual(literalTextsInFile(raw(rel)), [], rel);
  }
});
