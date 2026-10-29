import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { JobSummary } from "./api.ts";
import {
  doneTitleKey,
  failedLines,
  isNotCreated,
  NOT_CREATED_ORDER,
  notCreatedReasons,
  pollFailedLines,
  quotaReturned,
  stopDoneKey,
} from "./notCreated.ts";
import { jobMessage } from "./jobMessage.ts";
import { outcome } from "./review.ts";
import { statusVariant } from "./statusVariants.ts";
import { orderStatusKey } from "./orderTabs.ts";
import { orderLines } from "./historyGroups.ts";
import { terminalState } from "./jobState.ts";
import { DICTIONARIES, messageText, type UiKey } from "./i18n/index.ts";
import { withoutComments } from "./testing/jsxText.ts";

// Porten P3b (Dag 56, Cowork 27.10): «Bildet ble ikke laget.» med grunnen, og
// «Gratisbildet er gitt tilbake.» bare naar backend sier quota_return "returned".
// api.ts kaster ved import uten NEXT_PUBLIC_API_BASE: dynamisk import.
process.env.NEXT_PUBLIC_API_BASE = "http://api.test";
const api = await import("./api.ts");

const APP = join(dirname(fileURLToPath(import.meta.url)), "..");
const code = (rel: string) => withoutComments(readFileSync(join(APP, rel), "utf8"));
const nb = (key: UiKey) => DICTIONARIES.nb.ui[key];
const en = (key: UiKey) => DICTIONARIES.en.ui[key];

const KVELD = "skumring";
const KLART = "klart_vaer";
const STYLING = "styling_japandi";
const RETURNED = "Gratisbildet er gitt tilbake.";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function reasons(reasonCodes: string[], presetId: string | null = KVELD, imageType: string | null = null): string[] {
  return notCreatedReasons({ reasonCodes, presetId, imageType }).map(nb);
}

// --- Grunnene ---------------------------------------------------------------------

test("P3b: hver grunnkode gir sin tekst, ordrett (nb)", () => {
  const cases: [string, string | null, string][] = [
    ["image_type_not_supported", KLART, "Blå himmel bytter himmelen på bilder tatt ute, og dette bildet er tatt innendørs."],
    ["sky_missing", KLART, "Vi fant ingen himmel i bildet, så det er ingenting å bytte."],
    ["sky_through_windows_only", KLART, "Himmelen synes bare gjennom vinduer, og Blå himmel bytter bare himmel ute."],
    ["image_type_untested", KVELD, "Kveldsbilde er ikke laget for denne typen bilde ennå, for eksempel dronebilder."],
    ["image_type_untested", "skumring_interior", "Kveldsbilde er ikke laget for denne typen bilde ennå, for eksempel dronebilder."],
    ["image_type_untested", STYLING, "Digital styling er ikke laget for denne typen bilde ennå, for eksempel dronebilder."],
    ["valid_runs_insufficient", KVELD, "Analysen av bildet feilet, så vi har ikke laget det. Prøv igjen."],
  ];
  for (const [c, presetId, text] of cases) assert.deepEqual(reasons([c], presetId), [text], `${c} ${presetId}`);
  assert.equal(nb("notCreated.title"), "Bildet ble ikke laget.");
  assert.equal(nb("notCreated.quotaReturned"), RETURNED);
});

test("P3b: feil romtype, inne eller ute ut fra bildetypen; uten bildetype den noeytrale teksten", () => {
  const inside = "Bildet ser ut som et rom inne, men du valgte balkong eller terrasse. Bestill på nytt med riktig romtype.";
  const outside = "Bildet ser ut som et uterom, men du valgte et rom inne. Bestill på nytt med riktig romtype.";
  const neutral = "Bildet passer ikke romtypen du valgte. Bestill på nytt med riktig romtype.";
  assert.deepEqual(reasons(["furnish_as_mismatch"], STYLING, "interior"), [inside]);
  assert.deepEqual(reasons(["furnish_as_mismatch"], STYLING, "balcony_terrace"), [outside]);
  assert.deepEqual(reasons(["furnish_as_mismatch"], STYLING, "exterior_facade"), [outside]);
  for (const imageType of ["aerial", "other", null]) {
    assert.deepEqual(reasons(["furnish_as_mismatch"], STYLING, imageType), [neutral], String(imageType));
  }
  // Poll og lista har ikke bildetypen (AVVIK 2): den noeytrale teksten.
  assert.deepEqual(notCreatedReasons({ reasonCodes: ["furnish_as_mismatch"], presetId: STYLING }).map(nb), [neutral]);
  // Ingen «Avbryt» her: jobben er allerede avsluttet.
  for (const key of ["inside", "outside", ""].map((v) => `notCreated.reason.furnish_as_mismatch${v ? `.${v}` : ""}` as UiKey)) {
    assert.doesNotMatch(nb(key), /Avbryt/);
    assert.doesNotMatch(en(key), /Cancel/);
  }
});

test("P3b: med utestet bildetype vises ikke linja om romtype (valg b)", () => {
  assert.deepEqual(reasons(["image_type_untested", "furnish_as_mismatch"], STYLING, "other"), [
    "Digital styling er ikke laget for denne typen bilde ennå, for eksempel dronebilder.",
  ]);
  // Uten utestet bildetype staar romtypen.
  assert.equal(reasons(["furnish_as_mismatch", "valid_runs_insufficient"], STYLING, "interior").length, 2);
});

test("P3b: flere koder i fast rekkefoelge, uten duplikater", () => {
  const keys = notCreatedReasons({
    reasonCodes: ["valid_runs_insufficient", "sky_missing", "image_type_not_supported", "sky_missing"],
    presetId: KLART,
  });
  assert.deepEqual(keys, [
    "notCreated.reason.image_type_not_supported",
    "notCreated.reason.sky_missing",
    "notCreated.reason.valid_runs_insufficient",
  ]);
  assert.deepEqual([...NOT_CREATED_ORDER], [
    "image_type_not_supported",
    "sky_missing",
    "sky_through_windows_only",
    "furnish_as_mismatch",
    "image_type_untested",
    "valid_runs_insufficient",
  ]);
});

test("P3b: ukjent kode, ukjent tjeneste og ingen koder gir den noeytrale teksten, aldri tom", () => {
  const neutral = "Vi laget ikke dette bildet.";
  for (const codes of [[], ["some_future_code"], ["__proto__"], ["toString"]]) {
    assert.deepEqual(reasons(codes), [neutral], JSON.stringify(codes));
  }
  assert.deepEqual(notCreatedReasons({ reasonCodes: undefined, presetId: KVELD }).map(nb), [neutral]);
  // Blaa himmel og ukjent tjeneste feiler ikke paa utestet bildetype: noeytral tekst.
  assert.deepEqual(reasons(["image_type_untested"], KLART), [neutral]);
  assert.deepEqual(reasons(["image_type_untested"], "lawn_green"), [neutral]);
  // Kjent og ukjent: den kjente, saa den noeytrale.
  assert.deepEqual(reasons(["sky_missing", "x"], KLART), ["Vi fant ingen himmel i bildet, så det er ingenting å bytte.", neutral]);
});

test("P3b: alle tekstene finnes paa nb og en", () => {
  const keys = Object.keys(DICTIONARIES.nb.ui).filter((k) => k.startsWith("notCreated.")) as UiKey[];
  assert.ok(keys.length >= 12);
  for (const key of [...keys, "stop.done", "stop.doneReturned", "status.notCreated"] as UiKey[]) {
    assert.ok(nb(key).length > 5, `nb ${key}`);
    assert.ok(en(key).length > 5, `en ${key}`);
    assert.notEqual(nb(key), en(key), key);
  }
  for (const presetId of [KVELD, KLART, STYLING, "lawn_green", null]) {
    for (const imageType of ["interior", "balcony_terrace", "other", null]) {
      for (const key of notCreatedReasons({ reasonCodes: [...NOT_CREATED_ORDER, "x"], presetId, imageType })) {
        assert.ok(Object.hasOwn(DICTIONARIES.en.ui, key), key);
      }
    }
  }
});

// --- Gratisbildet: bare med "returned" ----------------------------------------

const NOT_RETURNED = ["not_returned", null, undefined, "RETURNED", "yes", true, 1, {}];

test("P3b: gratisbildet vises bare med quota_return \"returned\", for alle feilede jobber (valg c)", () => {
  for (const jobCode of ["not_created", "rejected_by_reviewer", "job_failed", null]) {
    const job = { status: "failed", code: jobCode, reasonCodes: ["sky_missing"], presetId: KLART };
    assert.equal(failedLines({ ...job, quotaReturn: "returned" }).at(-1), "notCreated.quotaReturned", String(jobCode));
    for (const q of NOT_RETURNED) {
      assert.ok(!failedLines({ ...job, quotaReturn: q }).includes("notCreated.quotaReturned"), `${jobCode} ${String(q)}`);
    }
    // Uten feltet.
    assert.ok(!failedLines(job).includes("notCreated.quotaReturned"), String(jobCode));
  }
  // Bare for failed: andre statuser har ingen linjer.
  for (const status of ["succeeded", "awaiting_approval", "needs_review", "running", "rejected"]) {
    assert.deepEqual(failedLines({ status, code: "not_created", presetId: KVELD, quotaReturn: "returned" }), [], status);
  }
  assert.equal(quotaReturned("returned"), true);
  for (const q of NOT_RETURNED) assert.equal(quotaReturned(q), false, String(q));
});

test("P3b: linjene for en jobb vi ikke laget er grunnene, saa gratisbildet; teknisk feil bare gratisbildet", () => {
  assert.deepEqual(
    failedLines({ status: "failed", code: "not_created", reasonCodes: ["sky_missing"], presetId: KLART, quotaReturn: "returned" }),
    ["notCreated.reason.sky_missing", "notCreated.quotaReturned"]
  );
  assert.deepEqual(
    failedLines({ status: "failed", code: "not_created", reasonCodes: ["sky_missing"], presetId: KLART, quotaReturn: "not_returned" }),
    ["notCreated.reason.sky_missing"]
  );
  // Teknisk feil og avvist: ingen grunner fra porten, selv om lista skulle ha koder.
  assert.deepEqual(failedLines({ status: "failed", code: null, reasonCodes: ["sky_missing"], presetId: KLART }), []);
  assert.deepEqual(failedLines({ status: "failed", code: null, presetId: KLART, quotaReturn: "returned" }), [
    "notCreated.quotaReturned",
  ]);
});

test("P3b: bare stop.doneReturned og notCreated.quotaReturned lover gratisbildet", () => {
  const promising = new Set(["stop.doneReturned", "notCreated.quotaReturned"]);
  for (const locale of ["nb", "en"] as const) {
    for (const [key, text] of Object.entries(DICTIONARIES[locale].ui)) {
      if (!key.startsWith("stop.") && !key.startsWith("note.") && !key.startsWith("notCreated.")) continue;
      if (promising.has(key)) assert.match(text, /Gratisbildet er gitt tilbake|free image has been returned/, key);
      else assert.doesNotMatch(text, /gratis|free|tilbake|returned/i, `${locale} ${key}`);
    }
  }
});

// --- «Ja, avbryt» i et stopp ---------------------------------------------------

test("P3b: svaret paa «Ja, avbryt» med og uten quota_return", () => {
  assert.deepEqual(api.parseDecisionResponse(200, { job_id: "j", status: "failed", code: "rejected_by_reviewer", reason: null, quota_return: "returned" }), {
    kind: "updated",
    status: "failed",
    quotaReturn: "returned",
  });
  assert.deepEqual(api.parseDecisionResponse(200, { status: "failed", quota_return: "not_returned" }), {
    kind: "updated",
    status: "failed",
    quotaReturn: "not_returned",
  });
  for (const raw of [null, "yes", 5]) {
    assert.deepEqual(api.parseDecisionResponse(200, { status: "failed", quota_return: raw }), {
      kind: "updated",
      status: "failed",
      quotaReturn: null,
    });
  }
  // «Avvis» etter bildet: backend sender ikke feltet.
  assert.deepEqual(api.parseDecisionResponse(200, { status: "failed", code: "rejected_by_reviewer" }), {
    kind: "updated",
    status: "failed",
  });
});

test("P3b: bekreftelsen etter «Ja, avbryt»: gratisbildet bare med \"returned\"", () => {
  assert.equal(stopDoneKey("returned"), "stop.doneReturned");
  assert.equal(nb(stopDoneKey("returned")), "Bildet blir ikke laget. Gratisbildet er gitt tilbake.");
  for (const q of NOT_RETURNED) {
    assert.equal(stopDoneKey(q), "stop.done", String(q));
  }
  assert.equal(nb("stop.done"), "Bildet blir ikke laget.");
  // Teksten foer megleren trykker, er som i P3a.
  assert.equal(nb("stop.confirm"), "Bildet blir ikke laget.");
  const outs = [
    api.parseDecisionResponse(200, { status: "failed", quota_return: "returned" }),
    api.parseDecisionResponse(200, { status: "failed", quota_return: "not_returned" }),
    api.parseDecisionResponse(200, { status: "failed", quota_return: null }),
    api.parseDecisionResponse(200, { status: "failed" }),
  ];
  assert.deepEqual(
    outs.map((o) => (o.kind === "updated" ? stopDoneKey(o.quotaReturn) : null)),
    ["stop.doneReturned", "stop.done", "stop.done", "stop.done"]
  );
});

test("P3b: overskriften rett etter «Ja, avbryt» er «Avbrutt av deg»; etter ny innlasting som foer", () => {
  assert.equal(nb("stop.cancelledByYou"), "Avbrutt av deg");
  assert.equal(en("stop.cancelledByYou"), "Cancelled by you");
  for (const q of ["returned", "not_returned", null]) {
    assert.equal(doneTitleKey("review.statusRejected", stopDoneKey(q)), "stop.cancelledByYou", String(q));
  }
  // Uten bekreftelsen (ny innlasting, eller «Avvis» etter bildet): linja fra outcome.
  assert.equal(doneTitleKey("review.statusRejected", null), "review.statusRejected");
  assert.equal(nb(doneTitleKey("review.statusRejected", null)), "Avvist av deg");
  assert.equal(doneTitleKey("notCreated.title", null), "notCreated.title");
  assert.match(
    code("components/godkjenning/ResultReview.tsx"),
    /<p className="text-ink font-bold">\{t\(locale, doneTitleKey\(done\.key, stopDone\)\)\}<\/p>/
  );
});

test("P3b: siden viser bekreftelsen bare etter «Avbryt» i et stopp, fra svaret, og glemmer den ved ny lasting", () => {
  const page = code("components/godkjenning/ResultReview.tsx");
  assert.match(page, /const fromStop = action === "reject" && isStopped\(review\);/);
  assert.match(page, /if \(fromStop\) setStopDone\(stopDoneKey\(out\.quotaReturn\)\);/);
  assert.equal(page.match(/setStopDone\(stopDoneKey/g)?.length, 1);
  assert.match(page, /setLightbox\(false\);\s*setStopDone\(null\);\s*\}, \[jobId, getToken\]\);/);
  // Ellers grunnene og gratisbildet fra review-svaret, med bildetypen.
  assert.match(page, /failedLines\(\{ \.\.\.review, imageType: review\.imageType\.value \}\)/);
  assert.match(page, /\{doneLines\.map\(\(key\) => \(/);
});

// --- Kontrakten: poll, lista og review ----------------------------------------------

test("P3b: poll not_created gir grunnkodene og quotaReturn, aldri feiltekst", () => {
  assert.deepEqual(
    api.parseStatusBody(
      { status: "failed", code: "not_created", reason_codes: ["sky_missing", 5, "x"], quota_return: "returned", message: "port: sky_missing" } as never,
      "j"
    ),
    { kind: "failed", detail: "not_created", notCreated: { reasonCodes: ["sky_missing", "x"] }, quotaReturn: "returned" }
  );
  assert.deepEqual(api.parseStatusBody({ status: "failed", code: "not_created" }, "j"), {
    kind: "failed",
    detail: "not_created",
    notCreated: { reasonCodes: [] },
  });
  // job_failed og avvist faar quotaReturn bare naar den er kjent.
  assert.deepEqual(api.parseStatusBody({ status: "failed", code: "job_failed", quota_return: "returned" }, "j"), {
    kind: "failed",
    detail: "job_failed",
    quotaReturn: "returned",
  });
  assert.deepEqual(api.parseStatusBody({ status: "failed", code: "job_failed", quota_return: "maybe" }, "j"), {
    kind: "failed",
    detail: "job_failed",
  });
  assert.deepEqual(
    api.parseStatusBody({ status: "failed", code: "rejected_by_reviewer", reason: "x", quota_return: "not_returned" }, "j"),
    { kind: "rejected_by_reviewer", reason: "x", quotaReturn: "not_returned" }
  );
});

test("P3b: tilstanden fra pollingen har notCreated og quotaReturn", () => {
  const nc = terminalState({ kind: "failed", detail: "not_created", notCreated: { reasonCodes: ["sky_missing"] }, quotaReturn: "returned" });
  assert.deepEqual([nc?.status, nc?.notCreated, nc?.quotaReturn], ["failed", { reasonCodes: ["sky_missing"] }, "returned"]);
  const tech = terminalState({ kind: "failed", detail: "job_failed" });
  assert.deepEqual([tech?.notCreated, tech?.quotaReturn], [null, null]);
  const rej = terminalState({ kind: "rejected_by_reviewer", reason: null, quotaReturn: "returned" });
  assert.deepEqual([rej?.status, rej?.quotaReturn], ["rejected_by_reviewer", "returned"]);
  const done = terminalState({ kind: "done", previewUrl: null, jobId: "j" });
  assert.deepEqual([done?.notCreated, done?.quotaReturn], [null, null]);
});

test("P3b: linjene paa Tjenester fra pollingen", () => {
  const nc = { status: "failed", notCreated: { reasonCodes: ["image_type_untested"] }, quotaReturn: "returned" as const };
  assert.deepEqual(pollFailedLines(nc, STYLING), ["notCreated.reason.image_type_untested.styling", "notCreated.quotaReturned"]);
  assert.deepEqual(pollFailedLines({ ...nc, quotaReturn: null }, KVELD), ["notCreated.reason.image_type_untested.kveldsbilde"]);
  assert.deepEqual(pollFailedLines({ status: "failed", notCreated: null, quotaReturn: "returned" }, KVELD), ["notCreated.quotaReturned"]);
  assert.deepEqual(pollFailedLines({ status: "failed", notCreated: null, quotaReturn: "not_returned" }, KVELD), []);
  assert.deepEqual(pollFailedLines({ status: "rejected_by_reviewer", notCreated: null, quotaReturn: "returned" }, KVELD), [
    "notCreated.quotaReturned",
  ]);
  assert.deepEqual(pollFailedLines({ status: "rejected_by_reviewer", notCreated: null, quotaReturn: null }, KVELD), []);
  for (const status of ["done", "awaiting_approval", "needs_review", "running", "idle"]) {
    assert.deepEqual(pollFailedLines({ status, notCreated: null, quotaReturn: "returned" }, KVELD), [], status);
  }
});

test("P3b: lista leser reason_codes og quota_return; mangler eller ukjent gir [] og null", async () => {
  const row = { service: "scene_transform", created_at: null, error: null, status: "failed" };
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify([
        { ...row, job_id: "a", code: "not_created", error: "port: sky_missing", reason_codes: ["sky_missing"], quota_return: "returned" },
        { ...row, job_id: "b", code: null, reason_codes: [], quota_return: "not_returned" },
        { ...row, job_id: "c" },
        { ...row, job_id: "d", reason_codes: "sky_missing", quota_return: "yes" },
      ]),
      { status: 200, headers: { "Content-Type": "application/json" } }
    )) as typeof fetch;
  const rows = await api.listJobs({ getToken: async () => "tok" });
  assert.deepEqual(
    rows.map((r) => [r.code, r.reasonCodes, r.quotaReturn]),
    [
      ["not_created", ["sky_missing"], "returned"],
      [null, [], "not_returned"],
      [null, [], null],
      [null, [], null],
    ]
  );
});

test("P3b: review-svaret har quotaReturn og bildetypen for en feilet jobb", () => {
  const review = api.normalizeReview(
    {
      status: "failed",
      code: "not_created",
      reason_codes: ["furnish_as_mismatch"],
      image_type: { value: "interior", run_values: ["interior", "interior"] },
      quota_return: "returned",
      preset_id: STYLING,
    },
    "j"
  );
  assert.equal(review.quotaReturn, "returned");
  assert.deepEqual(failedLines({ ...review, imageType: review.imageType.value }), [
    "notCreated.reason.furnish_as_mismatch.inside",
    "notCreated.quotaReturned",
  ]);
  for (const raw of [undefined, null, "not_returned", "x"]) {
    const q = api.normalizeReview({ status: "failed", quota_return: raw }, "j").quotaReturn;
    assert.equal(q, raw === "not_returned" ? "not_returned" : null, String(raw));
  }
});

// --- Overskriften og merket ---------------------------------------------------

test("P3b: overskriften «Bildet ble ikke laget.» i kortet og paa siden for jobben", () => {
  assert.deepEqual(jobMessage("failed", "not_created"), { key: "notCreated.title" });
  assert.equal(messageText("nb", jobMessage("failed", "not_created")!), "Bildet ble ikke laget.");
  assert.equal(messageText("en", jobMessage("failed", "not_created")!), "The image was not created.");
  // Som foer for andre koder.
  assert.deepEqual(jobMessage("failed", null), { key: "job.failed" });
  assert.deepEqual(jobMessage("failed", "rejected_by_reviewer"), { key: "status.rejectedByYou" });
  assert.deepEqual(outcome({ status: "failed", code: "not_created", decisions: [] }), { key: "notCreated.title", reason: null });
  assert.deepEqual(outcome({ status: "failed", code: null, decisions: [] }), { key: "review.statusOther", reason: null });
  assert.equal(isNotCreated({ status: "failed", code: "not_created" }), true);
  assert.equal(isNotCreated({ status: "needs_review", code: "not_created" }), false);
});

test("P3b: merket «Ikke laget» er noeytralt, nb og en (valg a)", () => {
  const v = statusVariant("failed", "scene_transform", "not_created");
  assert.equal(v.labelKey, "status.notCreated");
  assert.equal(v.tone, "neutral");
  assert.equal(nb("status.notCreated"), "Ikke laget");
  assert.equal(en("status.notCreated"), "Not created");
  // Andre feilede jobber er fortsatt «Feilet» i roedt.
  for (const c of [null, undefined, "job_failed", "rejected_by_reviewer"]) {
    assert.equal(statusVariant("failed", "scene_transform", c).labelKey, "status.failed", String(c));
    assert.equal(statusVariant("failed", "scene_transform", c).tone, "red", String(c));
  }
  // Koden gjelder bare failed.
  assert.equal(statusVariant("succeeded", "scene_transform", "not_created").labelKey, "status.approved");
  // Fanene paa siden for jobben.
  assert.equal(orderStatusKey("failed", "not_created"), "status.notCreated");
  assert.equal(orderStatusKey("failed", null), "status.failed");
});

test("P3b: linjene per stil paa bestillingskortet", () => {
  const base: JobSummary = {
    jobId: "a",
    service: "scene_transform",
    status: "failed",
    createdAt: null,
    thumbUrl: null,
    originalThumbUrl: null,
    error: "port: image_type_untested; furnish_as_mismatch",
    code: "not_created",
    reason: null,
    isOwner: true,
    ownerShort: null,
    presetId: STYLING,
    orderId: "o",
    reasonCodes: ["image_type_untested", "furnish_as_mismatch"],
    quotaReturn: "returned",
  };
  const [line] = orderLines("nb", [base]);
  assert.deepEqual(line.message, { key: "notCreated.title" });
  assert.deepEqual(line.lines, ["notCreated.reason.image_type_untested.styling", "notCreated.quotaReturned"]);
  const [other] = orderLines("nb", [{ ...base, code: null, reasonCodes: [], quotaReturn: "not_returned" }]);
  assert.deepEqual(other.lines, []);
});

// --- Kilden: komponentene bruker de rene reglene -------------------------------------

test("P3b: kortene, Tjenester og stilkortene bruker failedLines/pollFailedLines, aldri `error`", () => {
  const card = code("components/JobCard.tsx");
  assert.match(card, /const lines = failedLines\(job\);/);
  assert.match(card, /code=\{job\.code\}/);
  assert.doesNotMatch(card, /job\.error/);
  const order = code("components/OrderCard.tsx");
  assert.match(order, /\{line\.lines\.map\(\(key\) => \(/);
  const page = code("(app)/tjenester/page.tsx");
  assert.match(page, /const jobLines = pollFailedLines\(job, selectedTool\?\.presetId \?\? null\);/);
  assert.match(page, /\{showSubmitError && job\.notCreated !== null && <NotCreatedPanel lines=\{jobLines\} \/>\}/);
  assert.match(page, /<ReviewerRejectedPanel reason=\{job\.reviewerReason\} lines=\{jobLines\} \/>/);
  assert.match(page, /notCreated=\{notCreatedShown\}/);
  assert.doesNotMatch(page, /job\.error\b/);
  const cards = code("components/StylingOrderCards.tsx");
  assert.match(cards, /const lines = pollFailedLines\(card, card\.presetId\);/);
  assert.match(cards, /card\.status === "failed" && card\.notCreated !== null && <NotCreatedPanel lines=\{lines\} \/>/);
  // En jobb vi ikke laget er en avgjoerelse: noeytralt panel, ikke det roede.
  const panel = code("components/NotCreatedPanel.tsx");
  assert.match(panel, /bg-neutral-bg text-neutral-fg/);
  assert.doesNotMatch(panel, /red|ErrorPanel/);
});
