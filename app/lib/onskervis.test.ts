import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { JobSummary, ReviewWishes, WishItem } from "./api.ts";
import { answerKey, wishesSummaryText, wishesView, wishReasonKey, type WishesView } from "./wishes.ts";
import { orderLines } from "./historyGroups.ts";
import { DICTIONARIES, t, type UiKey } from "./i18n/index.ts";
import { literalTexts, withoutComments } from "./testing/jsxText.ts";

// «Dine ønsker» (TG-NEW-263, Petter 27.10): «Megler må se sitt eget ønske i
// historikken etterpå.» Backend #254 sender `wishes` i review-svaret og
// `wishes_summary` i lista. api.ts kaster ved import uten NEXT_PUBLIC_API_BASE.
process.env.NEXT_PUBLIC_API_BASE = "http://api.test";
const api = await import("./api.ts");

const APP = join(dirname(fileURLToPath(import.meta.url)), "..");
const code = (rel: string) => withoutComments(readFileSync(join(APP, rel), "utf8"));
const nb = (key: UiKey, vars?: Record<string, number>) => t("nb", key, vars);

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const OWNER = { status: "awaiting_approval", isOwner: true };
const ADMIN = { status: "awaiting_approval", isOwner: false };

function item(no: number, status: WishItem["status"], reason: WishItem["reason"] = "none", text: string | null = null): WishItem {
  return { no, status, reason, text };
}

function wishes(over: Partial<ReviewWishes>): ReviewWishes {
  return { version: "w2", planStatus: "ok", cleared: false, text: null, items: [], ...over };
}

/** Det panelet viser, som tekst i rekkefoelge (nb). */
function shown(view: WishesView): string[] {
  const out: string[] = [];
  if (view.cleared) out.push(nb("wishes.cleared"));
  if (view.quote !== null) out.push(`«${view.quote}»`);
  for (const r of view.rows) {
    out.push(r.text ?? nb("wishes.numbered", { n: r.no }));
    if (r.answer !== null) out.push(nb(r.answer));
    if (r.reason !== null) out.push(nb(r.reason));
  }
  if (view.summary !== null) out.push(nb(view.summary));
  for (const k of view.reasons) out.push(`- ${nb(k)}`);
  if (view.note !== null) out.push(nb(view.note));
  if (view.footnote) out.push(nb("wishes.footnote"));
  return out;
}

const W2_OWNER = wishes({
  items: [
    item(1, "followed", "none", "Sofaen mot vinduet"),
    item(2, "partly", "no_space", "Rundt spisebord"),
    item(3, "not_possible", "rule_door", "Bokhylle ved døra"),
    item(4, null, null, "Plante i hjørnet"),
  ],
});

// --- Panelet: radene i tabellen -----------------------------------------------

test("w2 hos eieren: én linje per ønske, med teksten og svaret under", () => {
  assert.deepEqual(shown(wishesView(W2_OWNER, OWNER)), [
    "Sofaen mot vinduet",
    "Tatt med",
    "Rundt spisebord",
    "Delvis",
    "Bokhylle ved døra",
    "Ikke mulig",
    "Ville stått foran en dør eller åpning",
    "Plante i hjørnet",
    "Ikke vurdert",
    "Svarene gjelder planen for møbleringen. Sjekk bildet.",
  ]);
});

test("w1 hos eieren: hele ønsket som sitat, og én samlet linje med grunnene uten nummer (valg 4)", () => {
  const text = "Sofaen mot vinduet, rundt bord\nog ingen lenestol";
  const w1 = wishes({
    version: "w1",
    text,
    items: [item(1, "followed"), item(2, "not_possible", "rule_fixed"), item(3, "not_possible", "rule_door"), item(4, "not_possible", "rule_door")],
  });
  assert.deepEqual(shown(wishesView(w1, OWNER)), [
    `«${text}»`,
    "Delvis tatt med",
    "- Ville stått foran en dør eller åpning",
    "- Faste ting som vinduer, dører, peis og ovner endres ikke",
    "Svarene gjelder planen for møbleringen. Sjekk bildet.",
  ]);
  // Ingen «Ønske n» i w1: oppdelingen er planleggerens egen.
  assert.equal(wishesView(w1, OWNER).rows.length, 0);
  assert.equal(nb(wishesView(wishes({ version: "w1", items: [item(1, "followed"), item(2, "followed")] }), OWNER).summary!), "Tatt med");
  assert.equal(wishesView(wishes({ version: "w1", items: [item(1, "partly", "no_space")] }), OWNER).summary, "wishes.w1.partly");
  assert.equal(wishesView(wishes({ version: "w1", items: [item(1, "not_possible", "unclear")] }), OWNER).summary, "wishes.w1.none");
  assert.equal(nb("wishes.w1.none"), "Ikke tatt med");
});

test("cleared: «Ønsket er slettet sammen med bildene.» og svarene uten tekst", () => {
  // Backend sender radene fra kodene etter A1; selv om teksten skulle vaere med, vises den ikke.
  const w2 = wishes({ cleared: true, items: [item(1, "followed"), item(2, "not_possible", "no_space", "Rest")] });
  assert.deepEqual(shown(wishesView(w2, OWNER)), [
    "Ønsket er slettet sammen med bildene.",
    "Ønske 1",
    "Tatt med",
    "Ønske 2",
    "Ikke mulig",
    "Det er ikke plass",
    "Svarene gjelder planen for møbleringen. Sjekk bildet.",
  ]);
  const w1 = wishes({ version: "w1", cleared: true, text: "rest", items: [item(1, "followed")] });
  assert.deepEqual(shown(wishesView(w1, OWNER)), [
    "Ønsket er slettet sammen med bildene.",
    "Tatt med",
    "Svarene gjelder planen for møbleringen. Sjekk bildet.",
  ]);
});

test("admin paa andres jobb: svarene uten tekst, ogsaa om svaret skulle ha tekst", () => {
  assert.deepEqual(shown(wishesView(W2_OWNER, ADMIN)), [
    "Ønske 1",
    "Tatt med",
    "Ønske 2",
    "Delvis",
    "Ønske 3",
    "Ikke mulig",
    "Ville stått foran en dør eller åpning",
    "Ønske 4",
    "Ikke vurdert",
    "Svarene gjelder planen for møbleringen. Sjekk bildet.",
  ]);
  const w1 = wishes({ version: "w1", text: "Hemmelig", items: [item(1, "followed")] });
  assert.equal(wishesView(w1, ADMIN).quote, null);
  assert.ok(!shown(wishesView(w1, ADMIN)).some((s) => s.includes("Hemmelig")));
  const none = wishes({ version: null, planStatus: null, text: "Hemmelig" });
  assert.equal(wishesView(none, { status: "failed", isOwner: false }).quote, null);
});

test("planen ikke ok (error, skipped, empty, ukjent): «Ønskene kunne ikke brukes denne gangen.»", () => {
  for (const planStatus of ["error", "skipped", "empty", null] as const) {
    const w2 = wishes({ planStatus, items: [item(1, null, null, "Sofaen mot vinduet")] });
    // Eieren ser fortsatt linja, uten svar og uten fotnote.
    assert.deepEqual(shown(wishesView(w2, OWNER)), ["Sofaen mot vinduet", "Ønskene kunne ikke brukes denne gangen."], String(planStatus));
    assert.deepEqual(shown(wishesView(w2, ADMIN)), ["Ønskene kunne ikke brukes denne gangen."], String(planStatus));
    const w1 = wishes({ version: "w1", planStatus, text: "Rundt bord", items: [] });
    assert.deepEqual(shown(wishesView(w1, OWNER)), ["«Rundt bord»", "Ønskene kunne ikke brukes denne gangen."], String(planStatus));
  }
});

test("not_applicable og ingen plan: «Ønskene ble ikke brukt for dette bildet.» (valg 2)", () => {
  const na = wishes({ version: "w1", planStatus: "not_applicable", text: "Rundt bord" });
  assert.deepEqual(shown(wishesView(na, OWNER)), ["«Rundt bord»", "Ønskene ble ikke brukt for dette bildet."]);
  const none = wishes({ version: null, planStatus: null, text: "Rundt bord" });
  for (const status of ["failed", "succeeded", "awaiting_approval", "unknown"]) {
    assert.deepEqual(shown(wishesView(none, { status, isOwner: true })), ["«Rundt bord»", "Ønskene ble ikke brukt for dette bildet."], status);
  }
  // Planen er ok, men planleggeren rapporterte ingen ønsker.
  assert.deepEqual(shown(wishesView(wishes({ version: "w1", items: [] }), OWNER)), ["Ønskene ble ikke brukt for dette bildet."]);
});

test("mens jobben venter eller kjoerer: teksten og «Svaret kommer når bildet er laget.» (valg 3)", () => {
  const none = wishes({ version: null, planStatus: null, text: "Rundt bord" });
  for (const status of ["needs_review", "queued", "running"]) {
    assert.deepEqual(shown(wishesView(none, { status, isOwner: true })), ["«Rundt bord»", "Svaret kommer når bildet er laget."], status);
    assert.deepEqual(shown(wishesView(none, { status, isOwner: false })), ["Svaret kommer når bildet er laget."], status);
  }
});

test("svarene og grunnene: alle kodene, `none` og ukjent gir ingen grunn", () => {
  assert.deepEqual(
    (["followed", "partly", "not_possible", null] as const).map((s) => nb(answerKey(s))),
    ["Tatt med", "Delvis", "Ikke mulig", "Ikke vurdert"]
  );
  const reasons: [WishItem["reason"], string | null][] = [
    ["rule_door", "Ville stått foran en dør eller åpning"],
    ["rule_fixed", "Faste ting som vinduer, dører, peis og ovner endres ikke"],
    ["not_in_list", "Kan ikke legges til ennå"],
    ["no_space", "Det er ikke plass"],
    ["conflict", "Kolliderer med et annet ønske"],
    ["unclear", "Ønsket var uklart"],
    ["rule_window", "Vinduene passer ikke for gardiner"],
    ["none", null],
    [null, null],
  ];
  for (const [reason, text] of reasons) {
    const key = wishReasonKey({ status: "not_possible", reason });
    assert.equal(key === null ? null : nb(key), text, String(reason));
  }
  // Grunnen vises bare ved «Ikke mulig».
  assert.equal(wishReasonKey({ status: "partly", reason: "no_space" }), null);
  assert.equal(wishReasonKey({ status: "followed", reason: "rule_door" }), null);
});

// --- Lesingen ------------------------------------------------------------------

test("normalizeReview: wishes strengt lest; mangler feltet eller er det null, er det ingen panel", () => {
  assert.equal(api.normalizeReview({}, "j").wishes, null);
  assert.equal(api.normalizeReview({ wishes: null }, "j").wishes, null);
  assert.equal(api.normalizeReview({ wishes: "x" }, "j").wishes, null);
  const w = api.normalizeReview(
    {
      wishes: {
        version: "w2",
        plan_status: "ok",
        cleared: false,
        text: null,
        items: [
          { no: 1, status: "followed", reason: "none", asked_kind: "storage", text: "Sofaen mot vinduet" },
          { no: 2, status: "nope", reason: "__proto__" },
          { no: 2, status: "followed", reason: "none" },
          { no: 0, status: "followed" },
          { no: 1.5, status: "followed" },
          { status: "followed" },
          { no: 3, status: null, reason: null, text: "" },
        ],
      },
    },
    "j"
  ).wishes;
  assert.deepEqual(w, {
    version: "w2",
    planStatus: "ok",
    cleared: false,
    text: null,
    items: [
      { no: 1, status: "followed", reason: "none", text: "Sofaen mot vinduet" },
      { no: 2, status: null, reason: null, text: null },
      { no: 3, status: null, reason: null, text: null },
    ],
  });
  const odd = api.normalizeReview({ wishes: { version: "w9", plan_status: "maybe", cleared: "yes", text: 5, items: "x" } }, "j").wishes;
  assert.deepEqual(odd, { version: null, planStatus: null, cleared: false, text: null, items: [] });
});

test("listJobs: wishes_summary strengt lest, og raden har aldri tekst fra ønsket", async () => {
  const row = { service: "scene_transform", created_at: null, error: null, status: "succeeded" };
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify([
        { ...row, job_id: "a", wishes_summary: { plan_status: "ok", count: 3, followed: 2, partly: 1 } },
        { ...row, job_id: "b", wishes_summary: null },
        { ...row, job_id: "c" },
        { ...row, job_id: "d", wishes_summary: { plan_status: "x", count: -1, followed: "2", text: "Sofaen" } },
      ]),
      { status: 200, headers: { "Content-Type": "application/json" } }
    )) as typeof fetch;
  const rows = await api.listJobs({ getToken: async () => "tok" });
  assert.deepEqual(
    rows.map((r) => r.wishesSummary),
    [{ planStatus: "ok", count: 3, followed: 2, partly: 1 }, null, null, { planStatus: null, count: 0, followed: 0, partly: 0 }]
  );
  assert.ok(!JSON.stringify(rows).includes("Sofaen"));
});

// --- Kortet --------------------------------------------------------------------

test("kortet: «Ønsker: 2 av 3 tatt med», med delvis, og «Ønskene ble ikke brukt»", () => {
  const text = (s: Parameters<typeof wishesSummaryText>[0]) => {
    const out = wishesSummaryText(s);
    return out === null ? null : nb(out.key, out.vars);
  };
  assert.equal(text({ planStatus: "ok", count: 3, followed: 2, partly: 0 }), "Ønsker: 2 av 3 tatt med");
  assert.equal(text({ planStatus: "ok", count: 3, followed: 2, partly: 1 }), "Ønsker: 2 av 3 tatt med, 1 delvis");
  for (const planStatus of ["error", "skipped", "empty", "not_applicable"] as const) {
    assert.equal(text({ planStatus, count: 0, followed: 0, partly: 0 }), "Ønskene ble ikke brukt", planStatus);
  }
  // Valg 5: 0 ønsker eller ukjent plan_status gir ingen linje; uten oppsummering heller ikke.
  assert.equal(text({ planStatus: "ok", count: 0, followed: 0, partly: 0 }), null);
  assert.equal(text({ planStatus: null, count: 3, followed: 3, partly: 0 }), null);
  assert.equal(text(null), null);
  assert.equal(text(undefined), null);
  const en = wishesSummaryText({ planStatus: "ok", count: 3, followed: 2, partly: 1 })!;
  assert.equal(t("en", en.key, en.vars), "Wishes: 2 of 3 included, 1 partly");
});

test("bestillingskortet: oppsummeringen per stil, fordi planen lages per stil", () => {
  const base: JobSummary = {
    jobId: "a",
    service: "scene_transform",
    status: "awaiting_approval",
    createdAt: null,
    thumbUrl: null,
    originalThumbUrl: null,
    error: null,
    code: null,
    reason: null,
    isOwner: true,
    ownerShort: null,
    presetId: "styling_moderne",
    orderId: "o",
    wishesSummary: { planStatus: "ok", count: 3, followed: 3, partly: 0 },
  };
  const lines = orderLines("nb", [base, { ...base, jobId: "b", presetId: "styling_familie", wishesSummary: { planStatus: "ok", count: 3, followed: 1, partly: 2 } }, { ...base, jobId: "c", wishesSummary: null }]);
  assert.deepEqual(
    lines.map((l) => (l.wishes === null ? null : nb(l.wishes.key, l.wishes.vars))),
    ["Ønsker: 3 av 3 tatt med", "Ønsker: 1 av 3 tatt med, 2 delvis", null]
  );
});

test("ingen ønsketekst paa kortene: bare tallene fra wishesSummaryText", () => {
  for (const rel of ["components/JobCard.tsx", "components/OrderCard.tsx", "lib/historyGroups.ts"]) {
    const src = code(rel);
    assert.match(src, /wishesSummaryText\(|line\.wishes\./, rel);
    // Aldri review-feltet med teksten, panelreglene eller radene.
    assert.doesNotMatch(src, /ReviewWishes|wishesView|wishes\.(text|items|quote)|\.items\b/, rel);
  }
  assert.match(code("components/JobCard.tsx"), /const wishes = wishesSummaryText\(job\.wishesSummary\);/);
  assert.match(code("lib/historyGroups.ts"), /wishes: wishesSummaryText\(job\.wishesSummary\),/);
});

// --- Siden og panelet -------------------------------------------------------------

test("siden: panelet bare naar wishes ikke er null, for alle roller, under kortet med knappene", () => {
  const page = code("(app)/godkjenning/[jobId]/page.tsx");
  assert.match(page, /\{review\.wishes !== null && \(\s*<WishesPanel\s+wishes=\{review\.wishes\}\s+status=\{review\.status\}\s+isOwner=\{review\.isOwner\}/);
  assert.equal(page.match(/<WishesPanel\b/g)?.length, 1);
  // Ikke bak admin, og etter DecisionCard og resultatkortet, foer MoodPanel.
  const at = page.indexOf("<WishesPanel");
  assert.doesNotMatch(page.slice(at - 60, at), /admin &&|showDetails/);
  assert.ok(page.lastIndexOf("<DecisionCard") < at && at < page.indexOf("<MoodPanel"));
});

test("panelet: tekstene fra ordlista, ingen tekst skrevet rett inn, og meglerens tekst som tekst", () => {
  const src = readFileSync(join(APP, "components/godkjenning/WishesPanel.tsx"), "utf8");
  assert.deepEqual(literalTexts(withoutComments(src)), []);
  assert.doesNotMatch(src, /dangerouslySetInnerHTML/);
  assert.match(src, /const view = wishesView\(wishes, \{ status, isOwner \}\);/);
});

test("ordlista: alle tekstene for ønskene paa nb og en", () => {
  const keys = Object.keys(DICTIONARIES.nb.ui).filter((k) => k.startsWith("wishes.")) as UiKey[];
  assert.equal(keys.length, 24);
  for (const key of keys) {
    assert.ok(DICTIONARIES.en.ui[key].length > 3, key);
  }
  assert.equal(nb("wishes.title"), "Dine ønsker");
  assert.equal(nb("wishes.cleared"), "Ønsket er slettet sammen med bildene.");
  assert.equal(nb("wishes.couldNotUse"), "Ønskene kunne ikke brukes denne gangen.");
  assert.equal(nb("wishes.notUsed"), "Ønskene ble ikke brukt for dette bildet.");
  assert.equal(nb("wishes.pending"), "Svaret kommer når bildet er laget.");
});
