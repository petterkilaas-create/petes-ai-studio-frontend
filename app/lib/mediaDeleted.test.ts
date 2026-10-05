import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// api.ts kaster ved import uten NEXT_PUBLIC_API_BASE; sett en dummy-verdi
// foer dynamisk import. fetch mockes; ingen nettverkskall.
process.env.NEXT_PUBLIC_API_BASE = "http://api.test";
const api = await import("./api.ts");
const { cardNote, mediaView, mergeRefresh, placeholderKey } = await import("./jobMedia.ts");
const { thumbSrc } = await import("./statusVariants.ts");
const { mediaDeleted } = await import("./review.ts");
const { canDownload, downloadErrorKey, downloadMarkedImage } = await import("./download.ts");
const { blockedResult } = await import("./brightness.ts");
const { correctionResult } = await import("./correction.ts");
const { codeText, DICTIONARIES, t } = await import("./i18n/index.ts");

import type { JobSummary } from "./api.ts";

/**
 * TG-NEW-117 F1: det megleren ser naar bildene er slettet. Backend (PR-B)
 * sender `media_deleted_at` og `thumb_deleted_at`; null og et felt som
 * mangler, betyr det samme: ikke slettet. Ingen antall dager i tekstene.
 */

const realFetch = globalThis.fetch;
after(() => {
  globalThis.fetch = realFetch;
});

const APP_DIR = fileURLToPath(new URL("..", import.meta.url));
const read = (rel: string) => readFileSync(join(APP_DIR, rel), "utf8");

const THUMB = "https://x/j_thumb_aaa.jpg";
const AT = "2026-10-05T10:00:00+00:00";

function job(overrides: Partial<JobSummary> = {}): JobSummary {
  return {
    jobId: "j",
    service: "scene_transform",
    status: "succeeded",
    createdAt: "2026-07-01T10:00:00Z",
    thumbUrl: null,
    originalThumbUrl: null,
    error: null,
    code: null,
    reason: null,
    isOwner: true,
    ownerShort: null,
    ...overrides,
  };
}

/** Det kortet gjoer (JobCard): bildeboksen og den lille linja. */
const card = (j: JobSummary) => ({ view: mediaView(j, thumbSrc(j)), note: cardNote(j, thumbSrc(j)) });

test("slettet: listJobs leser media_deleted_at og thumb_deleted_at; null, tom eller mangler gir null", async () => {
  const row = { service: "scene_transform", status: "succeeded", created_at: null, error: null };
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify([
        { ...row, job_id: "a", media_deleted_at: AT, thumb_deleted_at: AT },
        { ...row, job_id: "b", media_deleted_at: AT, thumb_deleted_at: null },
        { ...row, job_id: "c", media_deleted_at: "", thumb_deleted_at: "" },
        { ...row, job_id: "d" },
      ]),
      { status: 200, headers: { "Content-Type": "application/json" } }
    )) as typeof fetch;
  const rows = await api.listJobs({ getToken: async () => "tok" });
  assert.deepEqual(
    rows.map((r) => [r.mediaDeletedAt, r.thumbDeletedAt]),
    [[AT, AT], [AT, null], [null, null], [null, null]]
  );
});

test("slettet: miniatyren er slettet gir «Bildet er slettet», ikke det tomme ikonet", () => {
  const c = card(job({ mediaDeletedAt: AT, thumbDeletedAt: AT }));
  assert.deepEqual(c.view, { kind: "deleted", overlay: null });
  assert.equal(c.note, null, "ingen liten linje i tillegg");
  // Ogsaa om en lenke skulle komme med: slettet vinner.
  assert.equal(card(job({ mediaDeletedAt: AT, thumbDeletedAt: AT, thumbUrl: THUMB })).view.kind, "deleted");
});

test("slettet: bare full stoerrelse slettet viser miniatyren og den lille linja", () => {
  const c = card(job({ mediaDeletedAt: AT, thumbUrl: THUMB }));
  assert.deepEqual(c.view, { kind: "result", url: THUMB });
  assert.equal(c.note, "media.fullSizeDeleted");
  assert.equal(t("nb", c.note), "Bildene i full størrelse er slettet");
});

test("slettet: full stoerrelse slettet uten miniatyr gir «Bildet er slettet» og ingen linje (B1)", () => {
  for (const status of ["failed", "rejected", "succeeded", "awaiting_approval"] as const) {
    const c = card(job({ status, mediaDeletedAt: AT }));
    assert.deepEqual(c.view, { kind: "deleted", overlay: null }, status);
    assert.equal(c.note, null, status);
  }
});

test("slettet: jobber uten feltene, eller med null, ser ut som i dag", () => {
  for (const extra of [{}, { mediaDeletedAt: null, thumbDeletedAt: null }]) {
    // Feilet jobb uten miniatyr: det tomme ikonet som foer.
    assert.deepEqual(card(job({ status: "failed", ...extra })).view, { kind: "placeholder", overlay: null });
    assert.deepEqual(card(job({ thumbUrl: THUMB, ...extra })), {
      view: { kind: "result", url: THUMB },
      note: null,
    });
  }
});

test("slettet: automatisk henting bytter kortet naar bildene blir slettet", () => {
  const a = job({ jobId: "a", thumbUrl: "https://x/a?token=1" });
  const b = job({ jobId: "b", thumbUrl: "https://x/b?token=1", mediaDeletedAt: AT });
  const a2 = { ...a, thumbUrl: "https://x/a?token=2", mediaDeletedAt: AT };
  const b2 = { ...b, thumbUrl: null, thumbDeletedAt: AT };
  const merged = mergeRefresh([a, b], [a2, b2], 2);
  assert.equal(merged[0], a2, "full stoerrelse slettet: kortet byttes");
  assert.equal(merged[1], b2, "miniatyren slettet: kortet byttes");
  // Uendret: null og manglende felt er det samme, og kortet beholdes.
  const c = job({ jobId: "c", thumbUrl: "https://x/c?token=1" });
  const c2 = { ...c, thumbUrl: "https://x/c?token=2", mediaDeletedAt: null, thumbDeletedAt: null };
  assert.equal(mergeRefresh([c], [c2], 1)[0], c);
});

test("slettet: PreviewPlaceholder velger tekst etter grunnen", () => {
  assert.equal(placeholderKey("notReady"), "preview.notReady");
  assert.equal(placeholderKey("deleted"), "media.deleted");
  assert.equal(t("nb", placeholderKey("deleted")), "Bildet er slettet");
  assert.equal(t("en", placeholderKey("deleted")), "Image deleted");
  const src = read("components/PreviewPlaceholder.tsx");
  assert.match(src, /reason = "notReady"/, "standard er «ikke klar ennå», saa Tjenester er uendret");
  assert.match(src, /t\(locale, placeholderKey\(reason\)\)/);
});

test("slettet: review leser media_deleted_at; null eller mangler gir ikke slettet", () => {
  assert.equal(api.normalizeReview({ media_deleted_at: AT }, "j").mediaDeletedAt, AT);
  assert.equal(mediaDeleted(api.normalizeReview({ media_deleted_at: AT }, "j")), true);
  for (const raw of [{}, { media_deleted_at: null }, { media_deleted_at: "" }, { media_deleted_at: 5 }]) {
    assert.equal(mediaDeleted(api.normalizeReview(raw, "j")), false, JSON.stringify(raw));
  }
  assert.equal(mediaDeleted({}), false);
});

test("slettet: poll-svar uten media_deleted_at gir ikke slettet, og feltet mangler", () => {
  for (const status of ["succeeded", "awaiting_approval"]) {
    const bare = api.parseStatusBody({ status, preview_url: null }, "j1");
    assert.equal("mediaDeletedAt" in bare, false, status);
    assert.equal(mediaDeleted(bare as { mediaDeletedAt?: string }), false, status);
    const gone = api.parseStatusBody({ status, preview_url: null, media_deleted_at: AT }, "j1");
    assert.equal((gone as { mediaDeletedAt?: string }).mediaDeletedAt, AT, status);
    assert.equal(mediaDeleted(gone as { mediaDeletedAt?: string }), true, status);
  }
});

test("slettet: download sender 410 media_deleted til riktig noekkel, og knappen skjules", async () => {
  assert.equal(downloadErrorKey(410, { detail: { code: "media_deleted" } }), "review.downloadDeleted");
  assert.equal(downloadErrorKey(410, { code: "media_deleted" }), "review.downloadDeleted");
  assert.equal(downloadErrorKey(410, null), "review.downloadFailed", "410 uten koden: den generelle teksten");
  const result = await downloadMarkedImage({
    jobId: "j1",
    fetchFile: async () =>
      new Response(JSON.stringify({ detail: { code: "media_deleted" } }), {
        status: 410,
        headers: { "Content-Type": "application/json" },
      }),
    save: () => assert.fail("ingenting lagres"),
  });
  assert.deepEqual(result, { kind: "error", key: "review.downloadDeleted" });
  assert.equal(t("nb", "review.downloadDeleted"), "Bildet er slettet og kan ikke lastes ned lenger.");
  assert.equal(canDownload({ status: "succeeded", isOwner: true, mediaDeletedAt: AT }), false);
  assert.equal(canDownload({ status: "succeeded", isOwner: true, mediaDeletedAt: null }), true);
});

test("slettet: avgjoerelser sender 409 media_deleted til decisionError.media_deleted og laaser knappene", () => {
  const out = api.parseDecisionResponse(409, { detail: { code: "media_deleted", status: "awaiting_approval" } });
  assert.equal(out.kind, "blocked");
  if (out.kind !== "blocked") return;
  assert.deepEqual(blockedResult(out), {
    message: { group: "decisionError", code: "media_deleted" },
    block: true,
    refetch: false,
  });
  assert.deepEqual(correctionResult(out), {
    kind: "blocked",
    message: { group: "decisionError", code: "media_deleted" },
  });
  assert.equal(
    codeText("nb", "decisionError", "media_deleted"),
    "Bildene er slettet, så jobben kan ikke godkjennes eller rettes lenger."
  );
  assert.equal(
    codeText("en", "decisionError", "media_deleted"),
    "The images have been deleted, so the job can no longer be approved or corrected."
  );
});

test("slettet: alle nye noekler finnes paa nb og en, uten antall dager", () => {
  const keys = ["media.deleted", "media.fullSizeDeleted", "review.mediaDeleted", "review.downloadDeleted"] as const;
  for (const locale of ["nb", "en"] as const) {
    for (const key of keys) {
      const text = DICTIONARIES[locale].ui[key];
      assert.equal(typeof text, "string", `${locale} ${key}`);
      assert.doesNotMatch(text, /\d/, `${locale} ${key}: ingen tall`);
    }
    assert.doesNotMatch(DICTIONARIES[locale].codes.decisionError.media_deleted, /\d/);
  }
  assert.equal(
    t("nb", "review.mediaDeleted", { date: "05. okt. 2026" }),
    "Bildene i full størrelse ble slettet 05. okt. 2026. Opplysningene om jobben er tatt vare på."
  );
  assert.equal(
    t("en", "review.mediaDeleted", { date: "05. okt. 2026" }),
    "The full-size images were deleted on 05. okt. 2026. The job details have been kept."
  );
});

test("slettet: godkjenningssiden viser banneret og laaser knappene, slideren og nedlastingen", () => {
  const page = read("(app)/godkjenning/[jobId]/page.tsx");
  assert.match(page, /const deleted = mediaDeleted\(review\);/);
  // Banneret med datoen fra samme funksjon som kortene.
  assert.match(page, /\{deleted && \([\s\S]*?t\(locale, "review\.mediaDeleted", \{ date: formatDate\(review\.mediaDeletedAt/);
  assert.match(page, /import \{ formatDate \} from "@\/app\/lib\/dates";/);
  // Én boks i stedet for varianter, bildene og lysstyrke-slideren (A1).
  const branch = page.slice(page.indexOf("{deleted ? ("));
  assert.match(branch, /^\{deleted \? \(\s*\/\/[^\n]*\n\s*<PreviewPlaceholder reason="deleted" \/>\s*\) : \(/);
  const elseEnd = branch.indexOf("</section>");
  for (const part of ["<VariantPicker", "<CompareViewer", "<BrightnessControl"]) {
    const at = branch.indexOf(part);
    assert.ok(at > 0 && at < elseEnd, `${part} bare naar bildene ikke er slettet`);
  }
  // «Ingen handlinger …» skjules (C1); knappene styres fortsatt av allowed_actions, som da er tom.
  assert.match(page, /readOnly=\{readOnly \|\| deleted\}/);
  assert.match(page, /decisionControls\(review, answer\)/);
  // Nedlastingen: canDownload sjekker slettingen.
  assert.match(page, /\{canDownload\(review\) && <DownloadButton/);
  assert.match(read("lib/download.ts"), /!mediaDeleted\(review\)/);
});

test("slettet: kortet bruker den delte datofunksjonen, som er uendret", () => {
  const cardSrc = read("components/JobCard.tsx");
  assert.match(cardSrc, /import \{ formatDate \} from "\.\.\/lib\/dates";/);
  assert.doesNotMatch(cardSrc, /function formatDate/);
  assert.match(cardSrc, /cardNote\(job, thumb\)/);
  assert.match(read("lib/dates.ts"), /toLocaleString\("nb-NO"/);
});
