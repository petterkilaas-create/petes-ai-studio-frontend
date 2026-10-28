import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { withoutComments } from "./testing/jsxText.ts";
import type { CurrentChoices, JobReviewDetail, ReviewOrder, ReviewRound, RoundChoices } from "./api.ts";

// «Endre valg» ved retting (TG-NEW-145, FE-a, Dag 57). Kontrakt:
// ~/dev/_handoff/dag57/KONTRAKT_ENDRE_VALG.md og backend-branchen
// dag57-endre-valg (CorrectionChoices i router.py, resolve_choices og
// current_choices i decisions.py). api.ts kaster ved import uten
// NEXT_PUBLIC_API_BASE; fetch byttes ut, ingen nettverkskall.
process.env.NEXT_PUBLIC_API_BASE = "http://api.test";
const api = await import("./api.ts");
const { DICTIONARIES, codeText, t } = await import("./i18n/index.ts");
const { buildCorrection, correctionResult, correctionSubmitKey, correctionView } = await import("./correction.ts");
const { choicesBody, choicesKind, correctionStyles, initialChoices, NO_CHOICES } = await import(
  "./correctionChoices.ts"
);
const { changeStyle, DEFAULT_DUSK } = await import("./dusk.ts");
const { STYLING_STYLES } = await import("./styling.ts");
const { compareVariants, variantLabel } = await import("./compare.ts");
const { orderTabs } = await import("./orderTabs.ts");

const APP_DIR = fileURLToPath(new URL("..", import.meta.url));
const read = (rel: string) => withoutComments(readFileSync(join(APP_DIR, rel), "utf8"));

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});
const getToken = async () => "tok";

type ReviewPart = Pick<JobReviewDetail, "correction">;

function review(accepted: string[], current: Partial<CurrentChoices> | null): ReviewPart {
  return {
    correction: {
      roundsLeft: 2,
      lastRoundFailed: false,
      choicesAccepted: accepted,
      currentChoices:
        current === null ? null : { duskStyle: null, duskSky: null, style: null, decorLevel: null, ...current },
    },
  };
}

const DUSK = ["dusk_style", "dusk_sky"];
const STYLING = ["style", "decor_level"];

// --- Review-svaret ----------------------------------------------------------------

test("FE-a: review-svaret leses strengt: choices_accepted, current_choices og rundens stil", () => {
  const r = api.normalizeReview(
    {
      correction: {
        rounds_left: 2,
        choices_accepted: ["dusk_style", "dusk_sky", 7],
        current_choices: { dusk_style: "late_evening_v1", dusk_time: "late", dusk_sky: "starry" },
      },
      images: {
        rounds: [
          { round: 0, current: false, choices: { time: "early", sky: "light_clouds", style: "nordic_blue_hour_v2", decor_level: null } },
          { round: 1, current: true, choices: { time: "late", sky: "starry", style: "late_evening_v1" } },
        ],
      },
    },
    "j"
  );
  assert.deepEqual(r.correction.choicesAccepted, ["dusk_style", "dusk_sky"]);
  assert.deepEqual(r.correction.currentChoices, { duskStyle: "late_evening_v1", duskSky: "starry", style: null, decorLevel: null });
  assert.deepEqual(r.images.rounds?.map((x) => x.choices?.style), ["nordic_blue_hour_v2", "late_evening_v1"]);

  const s = api.normalizeReview(
    {
      correction: { choices_accepted: ["style", "decor_level"], current_choices: { style: "styling_funkis", decor_level: 3 } },
      images: { rounds: [{ round: 0, current: true, choices: { style: "styling_funkis", decor_level: 3 } }] },
    },
    "j"
  );
  assert.deepEqual(s.correction.currentChoices, { duskStyle: null, duskSky: null, style: "styling_funkis", decorLevel: 3 });
  assert.equal(s.images.rounds?.[0].choices?.decorLevel, 3);
  // Uten feltene (CORRECT_CHOICES av), eller med feil form: tomt og null.
  const old = api.normalizeReview({ correction: { rounds_left: 1 } }, "j");
  assert.deepEqual(old.correction.choicesAccepted, []);
  assert.equal(old.correction.currentChoices, null);
  const odd = api.normalizeReview({ correction: { current_choices: "x" } }, "j");
  assert.equal(odd.correction.currentChoices, null);
  const bad = api.normalizeReview({ correction: { current_choices: { style: "styling_funkis", decor_level: 2 } } }, "j");
  assert.equal(bad.correction.currentChoices?.decorLevel, null, "bare 1, 3 og 5");
});

// --- Når velgerne vises ----------------------------------------------------------

test("FE-a: velgeren bare når kontrakten sier det: Kveldsbilde, styling, ellers ingen", () => {
  assert.equal(choicesKind(review(DUSK, { duskStyle: "warm_dusk_v3", duskSky: "light_clouds" })), "dusk");
  assert.equal(choicesKind(review(STYLING, { style: "styling_japandi" })), "styling");
  // Klart vær og Årstider: [] og null.
  assert.equal(choicesKind(review([], null)), null);
  // Flagget av: feltene mangler.
  assert.equal(choicesKind({ correction: { roundsLeft: 2, lastRoundFailed: false } }), null);
  // Uten current_choices vises ingen velger, selv om feltene er godtatt.
  assert.equal(choicesKind(review(DUSK, null)), null);
  // Siden: velgerne bare med choicesKind, og ingen regel paa tjenestenavnet.
  const page = read("(app)/godkjenning/[jobId]/page.tsx");
  assert.match(page, /const choiceKind = choicesKind\(review\);/);
  assert.match(page, /choiceKind === "dusk" \? \(\s*<DuskChoicePicker[\s\S]*?compact[\s\S]*?\/>\s*\) : choiceKind === "styling" \? \(\s*<StylingCorrectionPicker/);
  assert.match(page, /\) : null\s*\}\s*submitKey=\{correctionSubmitKey\(choices\)\}/);
  // Ingen tjenestenavn i vilkaarene (presetId er bare bestillingens jobber i correctionStyles).
  assert.doesNotMatch(read("lib/correctionChoices.ts"), /klart_vaer|skumring|aarstid/);
});

// --- Forvalgte verdier -----------------------------------------------------------

test("FE-a: dagens valg er forvalgt; en gammel stil gir intet valgt kort", () => {
  assert.deepEqual(initialChoices(review(DUSK, { duskStyle: "late_evening_v1", duskSky: "starry" })), {
    dusk: { style: "late_evening_v1", sky: "starry" },
    style: null,
    decor: null,
  });
  // En himmel stilen ikke har, gir stilens standard (backend gjoer det samme).
  assert.deepEqual(initialChoices(review(DUSK, { duskStyle: "late_evening_v1", duskSky: "clear" })).dusk, {
    style: "late_evening_v1",
    sky: "dark",
  });
  // Gamle stiler (v1/v2): ingen av kortene er valgt.
  for (const old of ["nordic_blue_hour_v1", "warm_dusk_v2"]) {
    assert.equal(initialChoices(review(DUSK, { duskStyle: old, duskSky: "light_clouds" })).dusk, null, old);
  }
  assert.deepEqual(initialChoices(review(STYLING, { style: "styling_funkis", decorLevel: 5 })), {
    dusk: null,
    style: "styling_funkis",
    decor: 5,
  });
  // En stil utenfor de 14 (fra S2-f): ingen valgt, og pyntnivaaet staar.
  assert.deepEqual(initialChoices(review(STYLING, { style: "styling_skandinavisk", decorLevel: null })), NO_CHOICES);
  assert.deepEqual(initialChoices(review([], null)), NO_CHOICES);
  // Kortet uten valg (null) gir stilen med standardhimmelen.
  assert.deepEqual(changeStyle(null, "nordic_blue_hour_v2"), { style: "nordic_blue_hour_v2", sky: "light_clouds" });
  assert.deepEqual(changeStyle(null, "late_evening_v1"), { style: "late_evening_v1", sky: "dark" });
  assert.deepEqual(changeStyle(DEFAULT_DUSK, "nordic_blue_hour_v2"), DEFAULT_DUSK);
  // Siden forvelger ved «Korriger bildet» og nullstiller ved Avbryt.
  const page = read("(app)/godkjenning/[jobId]/page.tsx");
  assert.match(page, /setChoiceState\(initialChoices\(load\.review\)\);/);
  assert.match(page, /const cancelCorrection = \(\) => \{[\s\S]*?setChoiceState\(NO_CHOICES\);/);
});

// --- Skjulte stiler (V-b) -----------------------------------------------------------

test("FE-a (V-b): stiler som er andre jobber i bestillingen skjules; jobbens egen stil vises alltid", () => {
  const order: ReviewOrder = {
    orderId: "o",
    jobs: [
      { jobId: "a", presetId: "styling_japandi", status: "awaiting_approval", thumbUrl: null, code: null },
      { jobId: "b", presetId: "styling_funkis", status: "awaiting_approval", thumbUrl: null, code: null },
      { jobId: "c", presetId: "styling_pastell", status: "awaiting_approval", thumbUrl: null, code: null },
    ],
  };
  const shown = correctionStyles(order, "b", "styling_funkis");
  assert.equal(shown.length, 12);
  assert.ok(shown.includes("styling_funkis"));
  assert.ok(!shown.includes("styling_japandi") && !shown.includes("styling_pastell"));
  // Rekkefoelgen er menyens.
  assert.deepEqual(shown, STYLING_STYLES.filter((s) => s !== "styling_japandi" && s !== "styling_pastell"));
  // Uten bestilling: alle 14.
  assert.deepEqual(correctionStyles(null, "b", "styling_funkis"), [...STYLING_STYLES]);
  // Hintet om skjulte stiler finnes paa nb og en.
  assert.equal(t("nb", "correct.styleHint"), "Stiler som allerede er i bestillingen, vises ikke.");
  const picker = read("components/styling/StylingCorrectionPicker.tsx");
  assert.match(picker, /shown=\{styles\}/);
  assert.match(picker, /const hidden = styles\.length < STYLING_STYLES\.length;/);
  assert.match(read("(app)/godkjenning/[jobId]/page.tsx"), /styles=\{correctionStyles\(review\.order, jobId, choiceStart\.style\)\}/);
});

// --- Body ------------------------------------------------------------------------

test("FE-a: body har bare de endrede valgene, etter kontrakten", () => {
  const dusk = review(DUSK, { duskStyle: "nordic_blue_hour_v2", duskSky: "clear" });
  const start = initialChoices(dusk);
  // Uendret: ingen choices.
  assert.deepEqual(choicesBody("dusk", start, start), {});
  // Ny stil med himmelvalg: stilen og himmelen.
  assert.deepEqual(choicesBody("dusk", start, { ...start, dusk: { style: "late_evening_v1", sky: "starry" } }), {
    dusk_style: "late_evening_v1",
    dusk_sky: "starry",
  });
  // Ny stil uten himmelvalg (Varm skumring, Lys sommerkveld): bare stilen.
  for (const style of ["warm_dusk_v3", "summer_night_v1"] as const) {
    assert.deepEqual(choicesBody("dusk", start, { ...start, dusk: { style, sky: "light_clouds" } }), { dusk_style: style });
  }
  // Samme stil, ny himmel: bare himmelen. dusk_time sendes aldri.
  const sky = choicesBody("dusk", start, { ...start, dusk: { style: "nordic_blue_hour_v2", sky: "pink_clouds" } });
  assert.deepEqual(sky, { dusk_sky: "pink_clouds" });
  // Fra en gammel stil (intet kort): kortet sendes.
  const old = initialChoices(review(DUSK, { duskStyle: "nordic_blue_hour_v1", duskSky: "clear" }));
  assert.deepEqual(choicesBody("dusk", old, { ...old, dusk: changeStyle(null, "warm_dusk_v3") }), { dusk_style: "warm_dusk_v3" });
  assert.deepEqual(choicesBody("dusk", old, old), {});

  const styling = initialChoices(review(STYLING, { style: "styling_funkis", decorLevel: null }));
  assert.deepEqual(choicesBody("styling", styling, styling), {});
  assert.deepEqual(choicesBody("styling", styling, { ...styling, style: "styling_japandi" }), { style: "styling_japandi" });
  assert.deepEqual(choicesBody("styling", styling, { ...styling, decor: 1 }), { decor_level: 1 });
  // Tilbake til stilens eget nivaa: null sendes.
  const five = initialChoices(review(STYLING, { style: "styling_funkis", decorLevel: 5 }));
  assert.deepEqual(choicesBody("styling", five, { ...five, decor: null }), { decor_level: null });
  // Ingen velger: aldri choices.
  assert.deepEqual(choicesBody(null, styling, { ...styling, style: "styling_japandi" }), {});
});

test("FE-a: lys og peis sendes fortsatt, også sammen med ny stil", async () => {
  const base = {
    version: 7,
    reviewPanels: ["fireplace", "dusk", "style", "lights", "correct"],
    lights: {
      approved: [{ key: "L1", id: "L1", run: null, type: "pendant", location: "x", box: null, reasonCode: null, editable: true, state: "approved" }],
      unstable: [],
      rejected: [],
    },
  } as unknown as Parameters<typeof buildCorrection>[0];
  const body = buildCorrection(base, { L1: false }, true, "no", { dusk_style: "late_evening_v1", dusk_sky: "starry" });
  assert.deepEqual(body, {
    action: "correct",
    overrides: { promote: [], disable: ["L1"], add: [] },
    fireplace_fire: "no",
    expected_version: 7,
    choices: { dusk_style: "late_evening_v1", dusk_sky: "starry" },
  });
  // Uten endring: ingen choices-noekkel (som foer).
  assert.ok(!("choices" in buildCorrection(base, {}, true, "no")));
  assert.ok(!("choices" in buildCorrection(base, {}, true, "no", {})));
  // Kallet sender body-en som den er.
  const sent: unknown[] = [];
  globalThis.fetch = (async (_url: RequestInfo | URL, init?: RequestInit) => {
    sent.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({ job_id: "j", status: "running", round: 1 }), { status: 202 });
  }) as typeof fetch;
  const out = await api.postDecision({ jobId: "j", decision: body, getToken });
  assert.equal(out.kind, "poll");
  assert.deepEqual(sent[0], body);
  // Siden sender de endrede valgene ved «Lag nytt bilde».
  const page = read("(app)/godkjenning/[jobId]/page.tsx");
  assert.match(page, /choicesBody\(choicesKind\(review\), initialChoices\(review\), choiceState\)/);
});

// --- Knappen og teksten ------------------------------------------------------------

test("FE-a: «Lag nytt bilde» uten endring, «Lag nytt bilde med valgene» med, og teksten under", () => {
  assert.equal(t("nb", correctionSubmitKey({})), "Lag nytt bilde");
  assert.equal(t("nb", correctionSubmitKey({ style: "styling_japandi" })), "Lag nytt bilde med valgene");
  assert.equal(t("en", correctionSubmitKey({ decor_level: null })), "Create new image with the choices");
  const withChoices = correctionView("retry", { lightsShown: false, lightCount: 0, choices: true });
  assert.equal(t("nb", withChoices.titleKey), "Endre valgene");
  assert.equal(withChoices.hintKey, null, "aldri «med de samme valgene» naar valgene kan endres");
  assert.equal(withChoices.footer, true);
  assert.equal(t("nb", withChoices.footerKey), "Bildet lages på nytt fra originalen.");
  assert.equal(t("en", withChoices.footerKey), "The image is made again from the original.");
  // Kveldsbilde med lys: hintet om lysene staar, og lista vises.
  const lights = correctionView("lights", { lightsShown: true, lightCount: 2, choices: true });
  assert.equal(lights.hintKey, "correct.hint");
  assert.equal(lights.lightsList, true);
  // Uten velger (Klart vær, Årstider): som før.
  assert.equal(t("nb", correctionView("retry", { lightsShown: false, lightCount: 0 }).titleKey), "Lag et nytt forsøk");
  const panel = read("components/godkjenning/CorrectionPanel.tsx");
  assert.match(panel, /\{t\(locale, submitKey\)\}/);
  assert.match(panel, /\{choices\}/);
});

// --- Feilteksten ---------------------------------------------------------------------

test("FE-a: 400 invalid_choice gir tekst på nb og en, og valgene står", () => {
  const out = api.parseDecisionResponse(400, { detail: { code: "invalid_choice", field: "dusk_sky" } });
  assert.deepEqual(out, { kind: "blocked", code: "invalid_choice", fields: ["dusk_sky"], overrideCode: null });
  assert.deepEqual(correctionResult(out), { kind: "retry", message: { group: "decisionError", code: "invalid_choice" } });
  for (const code of ["choices_not_accepted", "choices_not_supported"]) {
    const o = api.parseDecisionResponse(400, { detail: { code, field: "choices" } });
    assert.equal(correctionResult(o).kind, "retry", code);
  }
  // Annen 400 er som foer.
  assert.deepEqual(api.parseDecisionResponse(400, { detail: { code: "noe_annet" } }), { kind: "error", httpStatus: 400 });
  assert.equal(codeText("nb", "decisionError", "invalid_choice"), "Valget kan ikke brukes for dette bildet. Velg på nytt og prøv igjen.");
  assert.equal(codeText("en", "decisionError", "invalid_choice"), "The choice cannot be used for this image. Choose again and try again.");
  for (const code of ["invalid_choice", "choices_not_accepted", "choices_not_supported"]) {
    assert.ok(Object.hasOwn(DICTIONARIES.nb.codes.decisionError, code), code);
    assert.ok(Object.hasOwn(DICTIONARIES.en.codes.decisionError, code), code);
  }
});

// --- Stripa og fanene -----------------------------------------------------------------

const CHOICES: RoundChoices = { time: "early", sky: "light_clouds", skyApplied: true, fireplaceFire: null, lightsChanged: false };

function round(n: number, choices: Partial<RoundChoices>, current = false): ReviewRound {
  return { round: n, current, previewUrl: `p${n}.jpg`, rawPreviewUrl: null, choices: { ...CHOICES, ...choices } };
}

test("FE-a (V-a): stripa viser rundens stil, også for megleren", () => {
  const images = (rounds: ReviewRound[]) => ({ previewUrl: null, rawPreviewUrl: null, previous: null, rounds });
  // compareVariants gir gjeldende runde foerst; plukk paa rundenummeret.
  const byRound = (vs: ReturnType<typeof compareVariants>) => [0, 1].map((n) => vs.find((v) => v.round === n)!);
  const [s0, s1] = byRound(
    compareVariants(images([round(0, { style: "styling_japandi" }), round(1, { style: "styling_funkis" }, true)]), {
      isAdmin: false,
    })
  );
  const broker = { choices: false, presetId: "styling_funkis" };
  assert.equal(variantLabel("nb", s0, broker), "Versjon 1 (Japandi)");
  assert.equal(variantLabel("nb", s1, broker), "Versjon 2 · nå (Funkis)");
  // Admin: rundens stil, ikke jobbens.
  assert.equal(variantLabel("nb", s0, { choices: true, presetId: "styling_funkis" }), "Versjon 1 (Japandi)");

  const [d0, d1] = byRound(
    compareVariants(
      images([round(0, { style: "nordic_blue_hour_v2" }), round(1, { style: "late_evening_v1", time: "late", sky: "starry" }, true)]),
      { isAdmin: false }
    )
  );
  assert.equal(variantLabel("nb", d0, { choices: false, presetId: "skumring" }), "Versjon 1 (Blå time)");
  assert.equal(variantLabel("nb", d1, { choices: false, presetId: "skumring" }), "Versjon 2 · nå (Sen kveld)");
  assert.equal(variantLabel("en", d1, { choices: false, presetId: "skumring" }), "Version 2 · now (Late evening)");
  // Admin: stilen foerst, saa valgene som foer.
  assert.equal(variantLabel("nb", d1, { choices: true, presetId: "skumring" }), "Versjon 2 · nå (Sen kveld, stjernehimmel)");
  // Uten stil i runden (flagget av, eldre runder): som foer.
  const [plain] = compareVariants(images([round(0, {}, true)]), { isAdmin: false });
  assert.equal(variantLabel("nb", plain, { choices: false, presetId: "skumring" }), "Versjon 1 · nå");
  assert.equal(variantLabel("nb", plain, { choices: true, presetId: "skumring" }), "Versjon 1 · nå (tidlig, lette skyer)");
});

test("FE-a (V-a): fanene og historikken bruker preset_id fra backend, som nå er stilen i gjeldende bilde", () => {
  const order: ReviewOrder = {
    orderId: "o",
    jobs: [
      { jobId: "a", presetId: "styling_funkis", status: "awaiting_approval", thumbUrl: null, code: null },
      { jobId: "b", presetId: "styling_pastell", status: "running", thumbUrl: null, code: null },
    ],
  };
  assert.deepEqual(orderTabs(order, "a", "nb")!.map((tab) => tab.label), ["Funkis", "Dansk pastell"]);
  // Ingen egen kopi av stilen i fanene eller historikken: begge leser presetId.
  assert.match(read("lib/orderTabs.ts"), /styleText\(locale, job\.presetId\)/);
  assert.match(read("lib/historyGroups.ts"), /styleText\(locale, job\.presetId\)/);
});
